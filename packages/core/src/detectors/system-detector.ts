import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { RiskTier } from '../safety/risk-tiers.js';
import type { CleanableItem, DetectedProject } from '../types.js';
import { BaseDetector, type DetectorContext } from './detector.js';

export interface SystemDetectorOptions {
  /** Override filesystem root for testability (default: '/') */
  readonly rootDir?: string;
  /** Override platform detection for testability */
  readonly platform?: NodeJS.Platform;
}

export class SystemDetector extends BaseDetector {
  readonly id = 'system';
  readonly displayName = 'Linux System';

  private readonly rootDir: string;
  private readonly platform: NodeJS.Platform;

  constructor(opts: SystemDetectorOptions = {}) {
    super();
    this.rootDir = opts.rootDir ?? '/';
    this.platform = opts.platform ?? process.platform;
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
}
