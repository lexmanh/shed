/**
 * Tests for SystemDetector.
 *
 * Per CLAUDE.md rule 3: tests written BEFORE implementation.
 *
 * Uses createFixture for real filesystem tests with an injected rootDir.
 * Platform guard is overridden via the `platform` option so tests run on macOS/Windows CI.
 */

import { join } from 'node:path';
import { createFixture } from 'fs-fixture';
import { describe, expect, it } from 'vitest';
import { RiskTier } from '../safety/risk-tiers.js';
import type { DetectorContext } from './detector.js';
import { SystemDetector } from './system-detector.js';
import type { CommandRunner } from './system-detector.js';

const ctx: DetectorContext = { scanRoot: '/', maxDepth: 5 };

/**
 * Build a CommandRunner mock from a routing table.
 * Key format: `${cmd} ${args.join(' ')}`. Missing key → exitCode 127 (not found).
 */
function mockRunner(table: Record<string, { stdout?: string; exitCode?: number }>): CommandRunner {
  return async (cmd, args) => {
    const key = `${cmd} ${args.join(' ')}`;
    const entry = table[key];
    if (!entry) return { stdout: '', exitCode: 127 };
    return { stdout: entry.stdout ?? '', exitCode: entry.exitCode ?? 0 };
  };
}

// ─── quickProbe / analyze ────────────────────────────────────────────────────

describe('SystemDetector.quickProbe', () => {
  it('always returns false — system detector has no project dir concept', async () => {
    expect(await new SystemDetector().quickProbe('/any/path')).toBe(false);
  });
});

describe('SystemDetector.analyze', () => {
  it('always returns null', async () => {
    expect(await new SystemDetector().analyze('/any/path', ctx)).toBeNull();
  });
});

// ─── platform guard ──────────────────────────────────────────────────────────

describe('SystemDetector.scanGlobal — platform guard', () => {
  it('returns empty array on non-linux platforms', async () => {
    const fix = await createFixture({});
    try {
      const items = await new SystemDetector({ rootDir: fix.path, platform: 'darwin' }).scanGlobal(
        ctx,
      );
      expect(items).toHaveLength(0);
    } finally {
      await fix.rm();
    }
  });
});

// ─── systemd journal logs ─────────────────────────────────────────────────────

describe('SystemDetector.scanGlobal — journal logs', () => {
  it('returns a Yellow item when /var/log/journal exists', async () => {
    const fix = await createFixture({ 'var/log/journal/machine-id/system.journal': '' });
    try {
      const items = await new SystemDetector({ rootDir: fix.path, platform: 'linux' }).scanGlobal(
        ctx,
      );
      const journal = items.find((i) => i.metadata?.kind === 'journal-logs');
      expect(journal).toBeDefined();
      expect(journal?.risk).toBe(RiskTier.Yellow);
      expect(journal?.path).toBe(join(fix.path, 'var/log/journal'));
    } finally {
      await fix.rm();
    }
  });

  it('skips journal when directory is absent', async () => {
    const fix = await createFixture({});
    try {
      const items = await new SystemDetector({ rootDir: fix.path, platform: 'linux' }).scanGlobal(
        ctx,
      );
      expect(items.find((i) => i.metadata?.kind === 'journal-logs')).toBeUndefined();
    } finally {
      await fix.rm();
    }
  });
});

// ─── APT package cache ────────────────────────────────────────────────────────

describe('SystemDetector.scanGlobal — apt cache', () => {
  it('returns a Green item when /var/cache/apt/archives contains .deb files', async () => {
    const fix = await createFixture({ 'var/cache/apt/archives/wget_1.21.deb': '' });
    try {
      const items = await new SystemDetector({ rootDir: fix.path, platform: 'linux' }).scanGlobal(
        ctx,
      );
      const apt = items.find((i) => i.metadata?.kind === 'apt-cache');
      expect(apt).toBeDefined();
      expect(apt?.risk).toBe(RiskTier.Green);
    } finally {
      await fix.rm();
    }
  });

  it('skips apt cache when archives dir is absent', async () => {
    const fix = await createFixture({});
    try {
      const items = await new SystemDetector({ rootDir: fix.path, platform: 'linux' }).scanGlobal(
        ctx,
      );
      expect(items.find((i) => i.metadata?.kind === 'apt-cache')).toBeUndefined();
    } finally {
      await fix.rm();
    }
  });
});

// ─── YUM package cache ────────────────────────────────────────────────────────

describe('SystemDetector.scanGlobal — yum cache', () => {
  it('returns a Green item when /var/cache/yum exists', async () => {
    const fix = await createFixture({ 'var/cache/yum/x86_64/7/base/repomd.xml': '' });
    try {
      const items = await new SystemDetector({ rootDir: fix.path, platform: 'linux' }).scanGlobal(
        ctx,
      );
      const yum = items.find((i) => i.metadata?.kind === 'yum-cache');
      expect(yum).toBeDefined();
      expect(yum?.risk).toBe(RiskTier.Green);
    } finally {
      await fix.rm();
    }
  });

  it('skips yum cache when directory is absent', async () => {
    const fix = await createFixture({});
    try {
      const items = await new SystemDetector({ rootDir: fix.path, platform: 'linux' }).scanGlobal(
        ctx,
      );
      expect(items.find((i) => i.metadata?.kind === 'yum-cache')).toBeUndefined();
    } finally {
      await fix.rm();
    }
  });
});

// ─── DNF package cache ────────────────────────────────────────────────────────

describe('SystemDetector.scanGlobal — dnf cache', () => {
  it('returns a Green item when /var/cache/dnf exists', async () => {
    const fix = await createFixture({ 'var/cache/dnf/fedora/repodata/repomd.xml': '' });
    try {
      const items = await new SystemDetector({ rootDir: fix.path, platform: 'linux' }).scanGlobal(
        ctx,
      );
      const dnf = items.find((i) => i.metadata?.kind === 'dnf-cache');
      expect(dnf).toBeDefined();
      expect(dnf?.risk).toBe(RiskTier.Green);
    } finally {
      await fix.rm();
    }
  });
});

// ─── crash dumps ─────────────────────────────────────────────────────────────

describe('SystemDetector.scanGlobal — crash dumps', () => {
  it('returns a Yellow item when /var/crash has files', async () => {
    const fix = await createFixture({ 'var/crash/nginx.1234.crash': '' });
    try {
      const items = await new SystemDetector({ rootDir: fix.path, platform: 'linux' }).scanGlobal(
        ctx,
      );
      const crash = items.find((i) => i.metadata?.kind === 'crash-dumps');
      expect(crash).toBeDefined();
      expect(crash?.risk).toBe(RiskTier.Yellow);
    } finally {
      await fix.rm();
    }
  });

  it('returns a Yellow item when /var/core has files', async () => {
    const fix = await createFixture({ 'var/core/core.5678': '' });
    try {
      const items = await new SystemDetector({ rootDir: fix.path, platform: 'linux' }).scanGlobal(
        ctx,
      );
      const core = items.find((i) => i.metadata?.kind === 'core-dumps');
      expect(core).toBeDefined();
      expect(core?.risk).toBe(RiskTier.Yellow);
    } finally {
      await fix.rm();
    }
  });

  it('skips crash dir when absent', async () => {
    const fix = await createFixture({});
    try {
      const items = await new SystemDetector({ rootDir: fix.path, platform: 'linux' }).scanGlobal(
        ctx,
      );
      expect(items.find((i) => i.metadata?.kind === 'crash-dumps')).toBeUndefined();
    } finally {
      await fix.rm();
    }
  });
});

// ─── old kernels (detect-only) ────────────────────────────────────────────────

describe('SystemDetector.scanGlobal — old kernels', () => {
  it('skips when neither dpkg-query nor rpm is installed', async () => {
    const fix = await createFixture({});
    try {
      const runner = mockRunner({}); // every command → 127
      const items = await new SystemDetector({
        rootDir: fix.path,
        platform: 'linux',
        commandRunner: runner,
      }).scanGlobal(ctx);
      expect(items.find((i) => i.metadata?.kind === 'old-kernels')).toBeUndefined();
    } finally {
      await fix.rm();
    }
  });

  it('skips when dpkg lists only the current kernel', async () => {
    const fix = await createFixture({
      'boot/vmlinuz-6.5.0-28-generic': 'x',
      'boot/initrd.img-6.5.0-28-generic': 'x',
    });
    try {
      const runner = mockRunner({
        'dpkg-query --version': { stdout: 'dpkg-query 1.21' },
        'uname -r': { stdout: '6.5.0-28-generic\n' },
        'dpkg-query -W -f=${Package}\n linux-image-*': {
          stdout: 'linux-image-6.5.0-28-generic\nlinux-image-generic\n',
        },
      });
      const items = await new SystemDetector({
        rootDir: fix.path,
        platform: 'linux',
        commandRunner: runner,
      }).scanGlobal(ctx);
      expect(items.find((i) => i.metadata?.kind === 'old-kernels')).toBeUndefined();
    } finally {
      await fix.rm();
    }
  });

  it('detects old kernels via dpkg, returns Red detect-only item with apt suggestion', async () => {
    const fix = await createFixture({
      'boot/vmlinuz-6.5.0-28-generic': 'current',
      'boot/initrd.img-6.5.0-28-generic': 'current',
      'boot/vmlinuz-6.2.0-39-generic': 'old1',
      'boot/initrd.img-6.2.0-39-generic': 'old1-larger-payload',
      'boot/vmlinuz-6.2.0-26-generic': 'old2',
      'boot/initrd.img-6.2.0-26-generic': 'old2',
    });
    try {
      const runner = mockRunner({
        'dpkg-query --version': { stdout: 'dpkg-query 1.21' },
        'uname -r': { stdout: '6.5.0-28-generic\n' },
        'dpkg-query -W -f=${Package}\n linux-image-*': {
          stdout: [
            'linux-image-6.5.0-28-generic',
            'linux-image-6.2.0-39-generic',
            'linux-image-6.2.0-26-generic',
            'linux-image-generic', // meta package — must be skipped
            '',
          ].join('\n'),
        },
      });
      const items = await new SystemDetector({
        rootDir: fix.path,
        platform: 'linux',
        commandRunner: runner,
      }).scanGlobal(ctx);
      const kernel = items.find((i) => i.metadata?.kind === 'old-kernels');
      expect(kernel).toBeDefined();
      expect(kernel?.risk).toBe(RiskTier.Red);
      expect(kernel?.metadata?.detectOnly).toBe(true);
      expect(kernel?.metadata?.count).toBe(2);
      expect(kernel?.path.startsWith('kernels::')).toBe(true);
      expect(kernel?.description).toContain('apt autoremove');
      expect(kernel?.description).toContain('6.5.0-28-generic'); // current shown
      expect(kernel?.id).toBe('global::system::old-kernels');
    } finally {
      await fix.rm();
    }
  });

  it('detects old kernels via rpm with dnf suggestion', async () => {
    const fix = await createFixture({
      'boot/vmlinuz-6.5.6-200.fc38.x86_64': 'current',
      'boot/vmlinuz-6.4.15-200.fc38.x86_64': 'old',
      'boot/initramfs-6.4.15-200.fc38.x86_64.img': 'old',
    });
    try {
      const runner = mockRunner({
        // dpkg not present → 127 (default)
        'rpm --version': { stdout: 'RPM version 4.18' },
        'uname -r': { stdout: '6.5.6-200.fc38.x86_64\n' },
        'rpm -q kernel': {
          stdout: 'kernel-6.5.6-200.fc38.x86_64\nkernel-6.4.15-200.fc38.x86_64\n',
        },
      });
      const items = await new SystemDetector({
        rootDir: fix.path,
        platform: 'linux',
        commandRunner: runner,
      }).scanGlobal(ctx);
      const kernel = items.find((i) => i.metadata?.kind === 'old-kernels');
      expect(kernel).toBeDefined();
      expect(kernel?.risk).toBe(RiskTier.Red);
      expect(kernel?.metadata?.detectOnly).toBe(true);
      expect(kernel?.metadata?.count).toBe(1);
      expect(kernel?.description).toContain('dnf remove');
    } finally {
      await fix.rm();
    }
  });

  it('skips when uname fails (cannot safely identify current kernel)', async () => {
    const fix = await createFixture({});
    try {
      const runner = mockRunner({
        'dpkg-query --version': { stdout: 'dpkg-query 1.21' },
        'uname -r': { stdout: '', exitCode: 1 },
        'dpkg-query -W -f=${Package}\n linux-image-*': {
          stdout: 'linux-image-6.5.0-28-generic\nlinux-image-6.2.0-39-generic\n',
        },
      });
      const items = await new SystemDetector({
        rootDir: fix.path,
        platform: 'linux',
        commandRunner: runner,
      }).scanGlobal(ctx);
      expect(items.find((i) => i.metadata?.kind === 'old-kernels')).toBeUndefined();
    } finally {
      await fix.rm();
    }
  });

  it('skips when dpkg-query listing throws', async () => {
    const fix = await createFixture({});
    try {
      const runner: CommandRunner = async (cmd, args) => {
        if (cmd === 'dpkg-query' && args[0] === '--version') {
          return { stdout: 'dpkg-query 1.21', exitCode: 0 };
        }
        if (cmd === 'uname') return { stdout: '6.5.0-28-generic\n', exitCode: 0 };
        if (cmd === 'dpkg-query') throw new Error('boom');
        return { stdout: '', exitCode: 127 };
      };
      const items = await new SystemDetector({
        rootDir: fix.path,
        platform: 'linux',
        commandRunner: runner,
      }).scanGlobal(ctx);
      expect(items.find((i) => i.metadata?.kind === 'old-kernels')).toBeUndefined();
    } finally {
      await fix.rm();
    }
  });

  it('does not flag dpkg meta packages like linux-image-generic / linux-image-amd64', async () => {
    const fix = await createFixture({});
    try {
      const runner = mockRunner({
        'dpkg-query --version': { stdout: 'dpkg-query 1.21' },
        'uname -r': { stdout: '6.5.0-28-generic\n' },
        'dpkg-query -W -f=${Package}\n linux-image-*': {
          stdout: [
            'linux-image-6.5.0-28-generic',
            'linux-image-generic',
            'linux-image-amd64',
            'linux-image-virtual',
            '',
          ].join('\n'),
        },
      });
      const items = await new SystemDetector({
        rootDir: fix.path,
        platform: 'linux',
        commandRunner: runner,
      }).scanGlobal(ctx);
      // Only the current kernel + meta packages → nothing to clean
      expect(items.find((i) => i.metadata?.kind === 'old-kernels')).toBeUndefined();
    } finally {
      await fix.rm();
    }
  });
});
