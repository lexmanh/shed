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

const ctx: DetectorContext = { scanRoot: '/', maxDepth: 5 };

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
