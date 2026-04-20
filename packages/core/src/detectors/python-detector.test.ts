/**
 * Tests for PythonDetector.
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
import { PythonDetector } from './python-detector.js';

async function initGit(cwd: string) {
  await execa('git', ['init', '-q', '-b', 'main'], { cwd });
  await execa('git', ['config', 'user.email', 'test@shed.test'], { cwd });
  await execa('git', ['config', 'user.name', 'Shed Test'], { cwd });
  await execa('git', ['config', 'commit.gpgsign', 'false'], { cwd });
  await execa('git', ['commit', '--allow-empty', '-q', '-m', 'init'], { cwd });
}

const ctx: DetectorContext = { scanRoot: '/', maxDepth: 5 };

// ─── quickProbe ──────────────────────────────────────────────────────────────

describe('PythonDetector.quickProbe', () => {
  it('returns true for pyproject.toml', async () => {
    const fix = await createFixture({ 'pyproject.toml': '[tool.poetry]\nname="x"' });
    try {
      expect(await new PythonDetector().quickProbe(fix.path)).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('returns true for setup.py', async () => {
    const fix = await createFixture({ 'setup.py': 'from setuptools import setup\nsetup()' });
    try {
      expect(await new PythonDetector().quickProbe(fix.path)).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('returns true for setup.cfg', async () => {
    const fix = await createFixture({ 'setup.cfg': '[metadata]\nname = x' });
    try {
      expect(await new PythonDetector().quickProbe(fix.path)).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('returns true for requirements.txt', async () => {
    const fix = await createFixture({ 'requirements.txt': 'requests==2.31.0' });
    try {
      expect(await new PythonDetector().quickProbe(fix.path)).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('returns false when none of the marker files exist', async () => {
    const fix = await createFixture({ 'main.go': 'package main' });
    try {
      expect(await new PythonDetector().quickProbe(fix.path)).toBe(false);
    } finally {
      await fix.rm();
    }
  });
});

// ─── analyze — null cases ────────────────────────────────────────────────────

describe('PythonDetector.analyze — null cases', () => {
  it('returns null when no Python marker file exists', async () => {
    const fix = await createFixture({ 'Cargo.toml': '[package]\nname="x"' });
    try {
      expect(await new PythonDetector().analyze(fix.path, ctx)).toBeNull();
    } finally {
      await fix.rm();
    }
  });
});

// ─── analyze — project metadata ──────────────────────────────────────────────

describe('PythonDetector.analyze — project metadata', () => {
  it('returns type=python', async () => {
    const fix = await createFixture({ 'requirements.txt': 'flask' });
    try {
      const result = await new PythonDetector().analyze(fix.path, ctx);
      expect(result?.type).toBe('python');
    } finally {
      await fix.rm();
    }
  });

  it('reads name from pyproject.toml [project] table', async () => {
    const fix = await createFixture({
      'pyproject.toml': '[project]\nname = "my-service"',
    });
    try {
      const result = await new PythonDetector().analyze(fix.path, ctx);
      expect(result?.name).toBe('my-service');
    } finally {
      await fix.rm();
    }
  });

  it('name is undefined when pyproject.toml has no [project] name', async () => {
    const fix = await createFixture({ 'pyproject.toml': '[tool.black]\nline-length = 88' });
    try {
      const result = await new PythonDetector().analyze(fix.path, ctx);
      expect(result?.name).toBeUndefined();
    } finally {
      await fix.rm();
    }
  });

  it('hasGit is true when .git dir exists', async () => {
    const fix = await createFixture({ 'requirements.txt': 'flask' });
    try {
      await initGit(fix.path);
      const result = await new PythonDetector().analyze(fix.path, ctx);
      expect(result?.hasGit).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('hasGit is false when no .git dir', async () => {
    const fix = await createFixture({ 'requirements.txt': 'flask' });
    try {
      const result = await new PythonDetector().analyze(fix.path, ctx);
      expect(result?.hasGit).toBe(false);
    } finally {
      await fix.rm();
    }
  });

  it('gitClean is true on clean git repo', async () => {
    const fix = await createFixture({ 'requirements.txt': 'flask' });
    try {
      await initGit(fix.path);
      await execa('git', ['add', '-A'], { cwd: fix.path });
      await execa('git', ['commit', '-q', '-m', 'add req'], { cwd: fix.path });
      const result = await new PythonDetector().analyze(fix.path, ctx);
      expect(result?.gitClean).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('gitClean is false when uncommitted changes exist', async () => {
    const fix = await createFixture({ 'requirements.txt': 'flask' });
    try {
      await initGit(fix.path);
      // requirements.txt is untracked → dirty
      const result = await new PythonDetector().analyze(fix.path, ctx);
      expect(result?.gitClean).toBe(false);
    } finally {
      await fix.rm();
    }
  });

  it('gitClean is undefined when not a git repo', async () => {
    const fix = await createFixture({ 'requirements.txt': 'flask' });
    try {
      const result = await new PythonDetector().analyze(fix.path, ctx);
      expect(result?.gitClean).toBeUndefined();
    } finally {
      await fix.rm();
    }
  });
});

// ─── analyze — cleanable items ────────────────────────────────────────────────

describe('PythonDetector.analyze — cleanable items', () => {
  const VENV_DIRS = ['venv', '.venv', 'env'];

  for (const dir of VENV_DIRS) {
    it(`detects ${dir}/ as Yellow`, async () => {
      const fix = await createFixture({
        'requirements.txt': 'flask',
        [`${dir}/pyvenv.cfg`]: 'home = /usr/bin',
      });
      try {
        const result = await new PythonDetector().analyze(fix.path, ctx);
        const item = result?.items.find((i) => i.path === join(fix.path, dir));
        expect(item, `expected ${dir} to be detected`).toBeDefined();
        expect(item?.risk).toBe(RiskTier.Yellow);
        expect(item?.detector).toBe('python');
      } finally {
        await fix.rm();
      }
    });
  }

  const CACHE_DIRS = ['__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache'];

  for (const dir of CACHE_DIRS) {
    it(`detects ${dir}/ as Yellow`, async () => {
      const fix = await createFixture({
        'requirements.txt': 'flask',
        [`${dir}/x`]: 'data',
      });
      try {
        const result = await new PythonDetector().analyze(fix.path, ctx);
        const item = result?.items.find((i) => i.path === join(fix.path, dir));
        expect(item, `expected ${dir} to be detected`).toBeDefined();
        expect(item?.risk).toBe(RiskTier.Yellow);
      } finally {
        await fix.rm();
      }
    });
  }

  it('detects *.egg-info/ as Yellow', async () => {
    const fix = await createFixture({
      'setup.py': 'from setuptools import setup\nsetup()',
      'my_pkg.egg-info/PKG-INFO': 'Metadata-Version: 2.1',
    });
    try {
      const result = await new PythonDetector().analyze(fix.path, ctx);
      const item = result?.items.find((i) => i.path.endsWith('.egg-info'));
      expect(item).toBeDefined();
      expect(item?.risk).toBe(RiskTier.Yellow);
    } finally {
      await fix.rm();
    }
  });

  it('returns empty items when nothing to clean', async () => {
    const fix = await createFixture({ 'requirements.txt': 'flask' });
    try {
      const result = await new PythonDetector().analyze(fix.path, ctx);
      expect(result?.items).toHaveLength(0);
    } finally {
      await fix.rm();
    }
  });

  it('sizeBytes > 0 for venv with content', async () => {
    const fix = await createFixture({
      'requirements.txt': 'flask',
      'venv/lib/python3.11/site-packages/flask/__init__.py': 'x'.repeat(2048),
    });
    try {
      const result = await new PythonDetector().analyze(fix.path, ctx);
      const item = result?.items.find((i) => i.path.endsWith('venv'));
      expect(item?.sizeBytes).toBeGreaterThan(0);
    } finally {
      await fix.rm();
    }
  });
});

// ─── scanGlobal ──────────────────────────────────────────────────────────────

describe('PythonDetector.scanGlobal', () => {
  it('returns Green items for existing pip cache', async () => {
    const home = await createFixture({
      '.cache/pip/http/abc': 'data',
    });
    try {
      const detector = new PythonDetector({ homeDir: home.path });
      const items = await detector.scanGlobal(ctx);
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.risk).toBe(RiskTier.Green);
        expect(item.detector).toBe('python');
      }
    } finally {
      await home.rm();
    }
  });

  it('returns empty array when no global caches exist', async () => {
    const home = await createFixture({});
    try {
      const detector = new PythonDetector({ homeDir: home.path });
      const items = await detector.scanGlobal(ctx);
      expect(items).toHaveLength(0);
    } finally {
      await home.rm();
    }
  });
});
