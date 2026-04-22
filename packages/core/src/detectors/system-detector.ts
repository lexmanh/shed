import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { RiskTier } from '../safety/risk-tiers.js';
import type { CleanableItem, DetectedProject } from '../types.js';
import { BaseDetector, type DetectorContext } from './detector.js';

export type CommandRunner = (
  cmd: string,
  args: readonly string[],
) => Promise<{ stdout: string; exitCode: number }>;

const defaultRunner: CommandRunner = async (cmd, args) => {
  const result = await execa(cmd, [...args], { reject: false, timeout: 10000 });
  return { stdout: result.stdout, exitCode: result.exitCode ?? 1 };
};

export interface SystemDetectorOptions {
  /** Override filesystem root for testability (default: '/') */
  readonly rootDir?: string;
  /** Override platform detection for testability */
  readonly platform?: NodeJS.Platform;
  /** Override subprocess execution (default: execa). Used by tests to mock dpkg/rpm/uname. */
  readonly commandRunner?: CommandRunner;
}

export class SystemDetector extends BaseDetector {
  readonly id = 'system';
  readonly displayName = 'Linux System';

  private readonly rootDir: string;
  private readonly platform: NodeJS.Platform;
  private readonly run: CommandRunner;

  constructor(opts: SystemDetectorOptions = {}) {
    super();
    this.rootDir = opts.rootDir ?? '/';
    this.platform = opts.platform ?? process.platform;
    this.run = opts.commandRunner ?? defaultRunner;
  }

  async quickProbe(_dir: string): Promise<boolean> {
    return false;
  }

  async analyze(_dir: string, _ctx: DetectorContext): Promise<DetectedProject | null> {
    return null;
  }

  override async scanGlobal(_ctx: DetectorContext): Promise<readonly CleanableItem[]> {
    if (this.platform !== 'linux') return [];
    const results = await Promise.all([
      this.checkJournalLogs(),
      this.checkAptCache(),
      this.checkYumCache(),
      this.checkDnfCache(),
      this.checkCrashDumps(),
      this.checkCoreDumps(),
      this.checkOldKernels(),
    ]);
    return results.flat();
  }

  private async checkJournalLogs(): Promise<CleanableItem[]> {
    const path = join(this.rootDir, 'var/log/journal');
    if (!(await this.dirExists(path))) return [];
    return [
      {
        id: 'global::system::journal-logs',
        path,
        detector: this.id,
        risk: RiskTier.Yellow,
        sizeBytes: await this.computeSize(path),
        lastModified: await this.getLastModified(path),
        description:
          'systemd journal logs — trim with `journalctl --vacuum-time=30d` or `journalctl --vacuum-size=500M`',
        metadata: { kind: 'journal-logs' },
      },
    ];
  }

  private async checkAptCache(): Promise<CleanableItem[]> {
    const path = join(this.rootDir, 'var/cache/apt/archives');
    if (!(await this.dirExists(path))) return [];
    // Check that there are actual .deb files (not just the partial/ subdir)
    let hasDebs = false;
    try {
      const entries = await readdir(path, { withFileTypes: true, encoding: 'utf-8' });
      hasDebs = entries.some((e) => e.isFile() && e.name.endsWith('.deb'));
    } catch {
      return [];
    }
    if (!hasDebs) return [];
    return [
      {
        id: 'global::system::apt-cache',
        path,
        detector: this.id,
        risk: RiskTier.Green,
        sizeBytes: await this.computeSize(path),
        lastModified: await this.getLastModified(path),
        description: 'APT downloaded package cache — remove with `apt clean` or `apt autoclean`',
        metadata: { kind: 'apt-cache' },
      },
    ];
  }

  private async checkYumCache(): Promise<CleanableItem[]> {
    const path = join(this.rootDir, 'var/cache/yum');
    if (!(await this.dirExists(path))) return [];
    return [
      {
        id: 'global::system::yum-cache',
        path,
        detector: this.id,
        risk: RiskTier.Green,
        sizeBytes: await this.computeSize(path),
        lastModified: await this.getLastModified(path),
        description: 'YUM package cache — remove with `yum clean all`',
        metadata: { kind: 'yum-cache' },
      },
    ];
  }

  private async checkDnfCache(): Promise<CleanableItem[]> {
    const path = join(this.rootDir, 'var/cache/dnf');
    if (!(await this.dirExists(path))) return [];
    return [
      {
        id: 'global::system::dnf-cache',
        path,
        detector: this.id,
        risk: RiskTier.Green,
        sizeBytes: await this.computeSize(path),
        lastModified: await this.getLastModified(path),
        description: 'DNF package cache — remove with `dnf clean all`',
        metadata: { kind: 'dnf-cache' },
      },
    ];
  }

  private async checkCrashDumps(): Promise<CleanableItem[]> {
    const path = join(this.rootDir, 'var/crash');
    if (!(await this.dirExists(path))) return [];
    let hasFiles = false;
    try {
      const entries = await readdir(path, { withFileTypes: true, encoding: 'utf-8' });
      hasFiles = entries.some((e) => e.isFile());
    } catch {
      return [];
    }
    if (!hasFiles) return [];
    return [
      {
        id: 'global::system::crash-dumps',
        path,
        detector: this.id,
        risk: RiskTier.Yellow,
        sizeBytes: await this.computeSize(path),
        lastModified: await this.getLastModified(path),
        description: 'Application crash dumps in /var/crash — safe to delete if not debugging',
        metadata: { kind: 'crash-dumps' },
      },
    ];
  }

  private async checkCoreDumps(): Promise<CleanableItem[]> {
    const path = join(this.rootDir, 'var/core');
    if (!(await this.dirExists(path))) return [];
    let hasFiles = false;
    try {
      const entries = await readdir(path, { withFileTypes: true, encoding: 'utf-8' });
      hasFiles = entries.some((e) => e.isFile());
    } catch {
      return [];
    }
    if (!hasFiles) return [];
    return [
      {
        id: 'global::system::core-dumps',
        path,
        detector: this.id,
        risk: RiskTier.Yellow,
        sizeBytes: await this.computeSize(path),
        lastModified: await this.getLastModified(path),
        description: 'Process core dumps in /var/core — safe to delete if not debugging',
        metadata: { kind: 'core-dumps' },
      },
    ];
  }

  /**
   * Detect-only: enumerate obsolete kernel packages and report them with the
   * proper `apt autoremove` / `dnf remove` suggestion. Never deletes — touching
   * /boot directly bypasses GRUB regeneration and initramfs hooks, which can
   * brick the next boot. The package manager is the only safe surface.
   *
   * Path uses a virtual `kernels::${bootDir}` prefix so even if `detectOnly` is
   * ignored downstream the path is invalid for fs deletion (mirrors database
   * detector's `binlogs::` pattern).
   */
  private async checkOldKernels(): Promise<CleanableItem[]> {
    const pm = await this.detectPackageManager();
    if (!pm) return [];

    const current = await this.getCurrentKernel();
    if (!current) return []; // can't safely identify what NOT to remove

    const installed = await this.listInstalledKernels(pm);
    const obsolete = installed.filter((v) => v !== current);
    if (obsolete.length === 0) return [];

    const bootDir = join(this.rootDir, 'boot');
    const totalBytes = await this.estimateKernelSize(bootDir, obsolete);
    const suggestion =
      pm === 'dpkg'
        ? 'sudo apt autoremove --purge'
        : 'sudo dnf remove $(dnf repoquery --installonly --latest-limit=-1 -q)';

    return [
      {
        id: 'global::system::old-kernels',
        path: `kernels::${bootDir}`,
        detector: this.id,
        risk: RiskTier.Red,
        sizeBytes: totalBytes,
        lastModified: await this.getLastModified(bootDir),
        description: `${obsolete.length} obsolete kernel package${obsolete.length === 1 ? '' : 's'} (current: ${current}). DO NOT delete /boot files manually — run: ${suggestion}`,
        metadata: {
          kind: 'old-kernels',
          detectOnly: true,
          count: obsolete.length,
          packageManager: pm,
          currentKernel: current,
          obsoleteVersions: obsolete,
        } as Record<string, unknown>,
      },
    ];
  }

  private async detectPackageManager(): Promise<'dpkg' | 'rpm' | null> {
    try {
      const dpkg = await this.run('dpkg-query', ['--version']);
      if (dpkg.exitCode === 0) return 'dpkg';
    } catch {
      /* fall through to rpm */
    }
    try {
      const rpm = await this.run('rpm', ['--version']);
      if (rpm.exitCode === 0) return 'rpm';
    } catch {
      /* none available */
    }
    return null;
  }

  private async getCurrentKernel(): Promise<string | null> {
    try {
      const result = await this.run('uname', ['-r']);
      if (result.exitCode !== 0) return null;
      const version = result.stdout.trim();
      return version.length > 0 ? version : null;
    } catch {
      return null;
    }
  }

  private async listInstalledKernels(pm: 'dpkg' | 'rpm'): Promise<string[]> {
    try {
      if (pm === 'dpkg') {
        const result = await this.run('dpkg-query', ['-W', '-f=${Package}\n', 'linux-image-*']);
        if (result.exitCode !== 0) return [];
        // Match `linux-image-<digit>...` — skip meta packages like `linux-image-generic`,
        // `linux-image-amd64`, `linux-image-virtual` (they don't start with a version digit).
        return result.stdout
          .split('\n')
          .map((line) => line.trim())
          .map((line) => line.match(/^linux-image-(\d.*)$/)?.[1])
          .filter((v): v is string => v !== undefined);
      }
      const result = await this.run('rpm', ['-q', 'kernel']);
      if (result.exitCode !== 0) return [];
      return result.stdout
        .split('\n')
        .map((line) => line.trim())
        .map((line) => line.match(/^kernel-(\d.*)$/)?.[1])
        .filter((v): v is string => v !== undefined);
    } catch {
      return [];
    }
  }

  private async estimateKernelSize(bootDir: string, versions: readonly string[]): Promise<number> {
    if (!(await this.dirExists(bootDir))) return 0;
    try {
      const entries = await readdir(bootDir, { withFileTypes: true, encoding: 'utf-8' });
      let total = 0;
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!versions.some((v) => entry.name.includes(v))) continue;
        try {
          const s = await stat(join(bootDir, entry.name));
          total += s.size;
        } catch {
          /* skip */
        }
      }
      return total;
    } catch {
      return 0;
    }
  }
}
