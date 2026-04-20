import { join } from 'node:path';
import { execa } from 'execa';
import { createFixture } from 'fs-fixture';
import { describe, expect, it } from 'vitest';
import { RiskTier } from '../safety/risk-tiers.js';
import type { DetectorContext } from './detector.js';
import { NodeDetector } from './node-detector.js';

async function initGit(cwd: string) {
  await execa('git', ['init', '-q', '-b', 'main'], { cwd });
  await execa('git', ['config', 'user.email', 'test@shed.test'], { cwd });
  await execa('git', ['config', 'user.name', 'Shed Test'], { cwd });
  await execa('git', ['config', 'commit.gpgsign', 'false'], { cwd });
  await execa('git', ['commit', '--allow-empty', '-q', '-m', 'init'], { cwd });
}

const ctx: DetectorContext = { scanRoot: '/', maxDepth: 5 };

// ─── quickProbe ──────────────────────────────────────────────────────────────

describe('NodeDetector.quickProbe', () => {
  it('returns true when package.json exists', async () => {
    const fix = await createFixture({ 'package.json': '{}' });
    try {
      const detector = new NodeDetector();
      expect(await detector.quickProbe(fix.path)).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('returns false when package.json is absent', async () => {
    const fix = await createFixture({ 'README.md': 'hello' });
    try {
      const detector = new NodeDetector();
      expect(await detector.quickProbe(fix.path)).toBe(false);
    } finally {
      await fix.rm();
    }
  });
});

// ─── analyze — null / invalid cases ─────────────────────────────────────────

describe('NodeDetector.analyze — null cases', () => {
  it('returns null when package.json is absent', async () => {
    const fix = await createFixture({ 'README.md': 'hello' });
    try {
      const detector = new NodeDetector();
      expect(await detector.analyze(fix.path, ctx)).toBeNull();
    } finally {
      await fix.rm();
    }
  });

  it('returns null when package.json is invalid JSON', async () => {
    const fix = await createFixture({ 'package.json': 'not json {{{' });
    try {
      const detector = new NodeDetector();
      expect(await detector.analyze(fix.path, ctx)).toBeNull();
    } finally {
      await fix.rm();
    }
  });
});

// ─── analyze — project metadata ──────────────────────────────────────────────

describe('NodeDetector.analyze — project metadata', () => {
  it('returns type=node', async () => {
    const fix = await createFixture({ 'package.json': JSON.stringify({ name: 'my-app' }) });
    try {
      const detector = new NodeDetector();
      const result = await detector.analyze(fix.path, ctx);
      expect(result?.type).toBe('node');
    } finally {
      await fix.rm();
    }
  });

  it('populates name from package.json', async () => {
    const fix = await createFixture({ 'package.json': JSON.stringify({ name: 'cool-lib' }) });
    try {
      const detector = new NodeDetector();
      const result = await detector.analyze(fix.path, ctx);
      expect(result?.name).toBe('cool-lib');
    } finally {
      await fix.rm();
    }
  });

  it('name is undefined when not in package.json', async () => {
    const fix = await createFixture({ 'package.json': '{}' });
    try {
      const detector = new NodeDetector();
      const result = await detector.analyze(fix.path, ctx);
      expect(result?.name).toBeUndefined();
    } finally {
      await fix.rm();
    }
  });

  it('hasGit is true when .git directory exists', async () => {
    const fix = await createFixture({ 'package.json': '{}' });
    try {
      await initGit(fix.path);
      const detector = new NodeDetector();
      const result = await detector.analyze(fix.path, ctx);
      expect(result?.hasGit).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('hasGit is false when no .git directory', async () => {
    const fix = await createFixture({ 'package.json': '{}' });
    try {
      const detector = new NodeDetector();
      const result = await detector.analyze(fix.path, ctx);
      expect(result?.hasGit).toBe(false);
    } finally {
      await fix.rm();
    }
  });

  it('gitClean is true on clean git repo', async () => {
    const fix = await createFixture({ 'package.json': '{}' });
    try {
      await initGit(fix.path);
      await execa('git', ['add', '-A'], { cwd: fix.path });
      await execa('git', ['commit', '-q', '-m', 'add pkg'], { cwd: fix.path });
      const detector = new NodeDetector();
      const result = await detector.analyze(fix.path, ctx);
      expect(result?.gitClean).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('gitClean is false when there are uncommitted changes', async () => {
    const fix = await createFixture({ 'package.json': '{}' });
    try {
      await initGit(fix.path);
      // package.json is untracked → dirty
      const detector = new NodeDetector();
      const result = await detector.analyze(fix.path, ctx);
      expect(result?.gitClean).toBe(false);
    } finally {
      await fix.rm();
    }
  });

  it('gitClean is undefined when not a git repo', async () => {
    const fix = await createFixture({ 'package.json': '{}' });
    try {
      const detector = new NodeDetector();
      const result = await detector.analyze(fix.path, ctx);
      expect(result?.gitClean).toBeUndefined();
    } finally {
      await fix.rm();
    }
  });
});

// ─── analyze — cleanable items ────────────────────────────────────────────────

describe('NodeDetector.analyze — cleanable items', () => {
  it('detects node_modules as Yellow', async () => {
    const fix = await createFixture({
      'package.json': '{}',
      'node_modules/lodash/index.js': 'module.exports={}',
    });
    try {
      const detector = new NodeDetector();
      const result = await detector.analyze(fix.path, ctx);
      const item = result?.items.find((i) => i.path === join(fix.path, 'node_modules'));
      expect(item).toBeDefined();
      expect(item?.risk).toBe(RiskTier.Yellow);
      expect(item?.detector).toBe('node');
    } finally {
      await fix.rm();
    }
  });

  it('does not include node_modules when absent', async () => {
    const fix = await createFixture({ 'package.json': '{}' });
    try {
      const detector = new NodeDetector();
      const result = await detector.analyze(fix.path, ctx);
      expect(result?.items.find((i) => i.path.endsWith('node_modules'))).toBeUndefined();
    } finally {
      await fix.rm();
    }
  });

  it('sizeBytes > 0 for node_modules after B1 impl', async () => {
    const fix = await createFixture({
      'package.json': '{}',
      'node_modules/a/index.js': 'x'.repeat(1024),
    });
    try {
      const detector = new NodeDetector();
      const result = await detector.analyze(fix.path, ctx);
      const item = result?.items.find((i) => i.path.endsWith('node_modules'));
      expect(item?.sizeBytes).toBeGreaterThan(0);
    } finally {
      await fix.rm();
    }
  });

  // Build output directories — all Yellow
  const BUILD_DIRS = [
    '.next',
    '.nuxt',
    '.turbo',
    'dist',
    'build',
    'out',
    '.svelte-kit',
    '.parcel-cache',
  ];

  for (const dir of BUILD_DIRS) {
    it(`detects ${dir}/ as Yellow`, async () => {
      const fix = await createFixture({
        'package.json': '{}',
        [`${dir}/index.js`]: '// built',
      });
      try {
        const detector = new NodeDetector();
        const result = await detector.analyze(fix.path, ctx);
        const item = result?.items.find((i) => i.path === join(fix.path, dir));
        expect(item, `expected ${dir} to be detected`).toBeDefined();
        expect(item?.risk).toBe(RiskTier.Yellow);
      } finally {
        await fix.rm();
      }
    });
  }

  it('does not include absent build dirs', async () => {
    const fix = await createFixture({ 'package.json': '{}' });
    try {
      const detector = new NodeDetector();
      const result = await detector.analyze(fix.path, ctx);
      expect(result?.items).toHaveLength(0);
    } finally {
      await fix.rm();
    }
  });
});

// ─── scanGlobal ──────────────────────────────────────────────────────────────

describe('NodeDetector.scanGlobal', () => {
  it('returns Green items for existing global caches', async () => {
    const home = await createFixture({
      '.npm/_cacache/index/abc': 'data',
      '.yarn/cache/pkg.tgz': 'data',
    });
    try {
      const detector = new NodeDetector({ homeDir: home.path });
      const items = await detector.scanGlobal(ctx);
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.risk).toBe(RiskTier.Green);
        expect(item.detector).toBe('node');
      }
    } finally {
      await home.rm();
    }
  });

  it('returns empty array when no global caches exist', async () => {
    const home = await createFixture({});
    try {
      const detector = new NodeDetector({ homeDir: home.path });
      const items = await detector.scanGlobal(ctx);
      expect(items).toHaveLength(0);
    } finally {
      await home.rm();
    }
  });
});

// ─── workspace root detection ─────────────────────────────────────────────────

describe('NodeDetector.analyze — workspace root warning', () => {
  it('adds workspace warning when pnpm-workspace.yaml exists', async () => {
    const fix = await createFixture({
      'package.json': JSON.stringify({ name: 'my-monorepo' }),
      'pnpm-workspace.yaml': 'packages:\n  - packages/*',
      'node_modules/.keep': '',
    });
    try {
      const result = await new NodeDetector().analyze(fix.path, ctx);
      const item = result?.items.find((i) => i.path.endsWith('node_modules'));
      expect(item?.description).toMatch(/workspace/i);
    } finally {
      await fix.rm();
    }
  });

  it('adds workspace warning when package.json has workspaces field', async () => {
    const fix = await createFixture({
      'package.json': JSON.stringify({ name: 'my-monorepo', workspaces: ['packages/*'] }),
      'node_modules/.keep': '',
    });
    try {
      const result = await new NodeDetector().analyze(fix.path, ctx);
      const item = result?.items.find((i) => i.path.endsWith('node_modules'));
      expect(item?.description).toMatch(/workspace/i);
    } finally {
      await fix.rm();
    }
  });

  it('adds workspace warning when nx.json exists', async () => {
    const fix = await createFixture({
      'package.json': '{}',
      'nx.json': '{}',
      'node_modules/.keep': '',
    });
    try {
      const result = await new NodeDetector().analyze(fix.path, ctx);
      const item = result?.items.find((i) => i.path.endsWith('node_modules'));
      expect(item?.description).toMatch(/workspace/i);
    } finally {
      await fix.rm();
    }
  });

  it('adds workspace warning when turbo.json exists', async () => {
    const fix = await createFixture({
      'package.json': '{}',
      'turbo.json': '{}',
      'node_modules/.keep': '',
    });
    try {
      const result = await new NodeDetector().analyze(fix.path, ctx);
      const item = result?.items.find((i) => i.path.endsWith('node_modules'));
      expect(item?.description).toMatch(/workspace/i);
    } finally {
      await fix.rm();
    }
  });

  it('no workspace warning for regular project', async () => {
    const fix = await createFixture({
      'package.json': JSON.stringify({ name: 'simple-app' }),
      'node_modules/.keep': '',
    });
    try {
      const result = await new NodeDetector().analyze(fix.path, ctx);
      const item = result?.items.find((i) => i.path.endsWith('node_modules'));
      expect(item?.description).not.toMatch(/workspace/i);
    } finally {
      await fix.rm();
    }
  });
});
