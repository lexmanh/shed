/**
 * Tests for RustDetector.
 *
 * Per CLAUDE.md rule 3: tests written BEFORE implementation.
 * Coverage target: 100% branches.
 */

import { join } from 'node:path';
import { execa } from 'execa';
import { createFixture } from 'fs-fixture';
import { describe, expect, it } from 'vitest';
import { RiskTier } from '../safety/risk-tiers.js';
import type { DetectorContext } from './detector.js';
import { RustDetector } from './rust-detector.js';

async function initGit(cwd: string) {
  await execa('git', ['init', '-q', '-b', 'main'], { cwd });
  await execa('git', ['config', 'user.email', 'test@shed.test'], { cwd });
  await execa('git', ['config', 'user.name', 'Shed Test'], { cwd });
  await execa('git', ['config', 'commit.gpgsign', 'false'], { cwd });
  await execa('git', ['commit', '--allow-empty', '-q', '-m', 'init'], { cwd });
}

const ctx: DetectorContext = { scanRoot: '/', maxDepth: 5 };

// ─── quickProbe ──────────────────────────────────────────────────────────────

describe('RustDetector.quickProbe', () => {
  it('returns true when Cargo.toml exists', async () => {
    const fix = await createFixture({ 'Cargo.toml': '[package]\nname="x"' });
    try {
      expect(await new RustDetector().quickProbe(fix.path)).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('returns false when Cargo.toml is absent', async () => {
    const fix = await createFixture({ 'package.json': '{}' });
    try {
      expect(await new RustDetector().quickProbe(fix.path)).toBe(false);
    } finally {
      await fix.rm();
    }
  });
});

// ─── analyze — null cases ─────────────────────────────────────────────────────

describe('RustDetector.analyze — null cases', () => {
  it('returns null when Cargo.toml is absent', async () => {
    const fix = await createFixture({ 'main.go': 'package main' });
    try {
      expect(await new RustDetector().analyze(fix.path, ctx)).toBeNull();
    } finally {
      await fix.rm();
    }
  });
});

// ─── analyze — project metadata ──────────────────────────────────────────────

describe('RustDetector.analyze — project metadata', () => {
  it('returns type=rust', async () => {
    const fix = await createFixture({ 'Cargo.toml': '[package]\nname = "myapp"' });
    try {
      const result = await new RustDetector().analyze(fix.path, ctx);
      expect(result?.type).toBe('rust');
    } finally {
      await fix.rm();
    }
  });

  it('reads name from Cargo.toml [package] table', async () => {
    const fix = await createFixture({ 'Cargo.toml': '[package]\nname = "my-crate"' });
    try {
      const result = await new RustDetector().analyze(fix.path, ctx);
      expect(result?.name).toBe('my-crate');
    } finally {
      await fix.rm();
    }
  });

  it('name is undefined when [package] has no name', async () => {
    const fix = await createFixture({ 'Cargo.toml': '[workspace]\nmembers = ["crates/*"]' });
    try {
      const result = await new RustDetector().analyze(fix.path, ctx);
      expect(result?.name).toBeUndefined();
    } finally {
      await fix.rm();
    }
  });

  it('hasGit is true when .git exists', async () => {
    const fix = await createFixture({ 'Cargo.toml': '[package]\nname="x"' });
    try {
      await initGit(fix.path);
      const result = await new RustDetector().analyze(fix.path, ctx);
      expect(result?.hasGit).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('hasGit is false when no .git', async () => {
    const fix = await createFixture({ 'Cargo.toml': '[package]\nname="x"' });
    try {
      const result = await new RustDetector().analyze(fix.path, ctx);
      expect(result?.hasGit).toBe(false);
    } finally {
      await fix.rm();
    }
  });

  it('gitClean is true on clean git repo', async () => {
    const fix = await createFixture({ 'Cargo.toml': '[package]\nname="x"' });
    try {
      await initGit(fix.path);
      await execa('git', ['add', '-A'], { cwd: fix.path });
      await execa('git', ['commit', '-q', '-m', 'add cargo'], { cwd: fix.path });
      const result = await new RustDetector().analyze(fix.path, ctx);
      expect(result?.gitClean).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('gitClean is false when uncommitted changes exist', async () => {
    const fix = await createFixture({ 'Cargo.toml': '[package]\nname="x"' });
    try {
      await initGit(fix.path);
      // Cargo.toml is untracked → dirty
      const result = await new RustDetector().analyze(fix.path, ctx);
      expect(result?.gitClean).toBe(false);
    } finally {
      await fix.rm();
    }
  });

  it('gitClean is undefined when not a git repo', async () => {
    const fix = await createFixture({ 'Cargo.toml': '[package]\nname="x"' });
    try {
      const result = await new RustDetector().analyze(fix.path, ctx);
      expect(result?.gitClean).toBeUndefined();
    } finally {
      await fix.rm();
    }
  });
});

// ─── analyze — cleanable items ────────────────────────────────────────────────

describe('RustDetector.analyze — cleanable items', () => {
  it('detects target/ as Yellow', async () => {
    const fix = await createFixture({
      'Cargo.toml': '[package]\nname="x"',
      'target/debug/x': 'ELF binary',
    });
    try {
      const result = await new RustDetector().analyze(fix.path, ctx);
      const item = result?.items.find((i) => i.path === join(fix.path, 'target'));
      expect(item).toBeDefined();
      expect(item?.risk).toBe(RiskTier.Yellow);
      expect(item?.detector).toBe('rust');
    } finally {
      await fix.rm();
    }
  });

  it('does not include target/ when absent', async () => {
    const fix = await createFixture({ 'Cargo.toml': '[package]\nname="x"' });
    try {
      const result = await new RustDetector().analyze(fix.path, ctx);
      expect(result?.items).toHaveLength(0);
    } finally {
      await fix.rm();
    }
  });

  it('sizeBytes > 0 for target/ with content', async () => {
    const fix = await createFixture({
      'Cargo.toml': '[package]\nname="x"',
      'target/debug/x': 'x'.repeat(4096),
    });
    try {
      const result = await new RustDetector().analyze(fix.path, ctx);
      const item = result?.items.find((i) => i.path.endsWith('target'));
      expect(item?.sizeBytes).toBeGreaterThan(0);
    } finally {
      await fix.rm();
    }
  });
});

// ─── scanGlobal ──────────────────────────────────────────────────────────────

describe('RustDetector.scanGlobal', () => {
  it('returns Green items for existing cargo registry cache', async () => {
    const home = await createFixture({
      '.cargo/registry/cache/github.com/pkg/pkg-1.0.0.crate': 'data',
    });
    try {
      const detector = new RustDetector({ homeDir: home.path });
      const items = await detector.scanGlobal(ctx);
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.risk).toBe(RiskTier.Green);
        expect(item.detector).toBe('rust');
      }
    } finally {
      await home.rm();
    }
  });

  it('returns empty array when no cargo caches exist', async () => {
    const home = await createFixture({});
    try {
      const detector = new RustDetector({ homeDir: home.path });
      const items = await detector.scanGlobal(ctx);
      expect(items).toHaveLength(0);
    } finally {
      await home.rm();
    }
  });
});
