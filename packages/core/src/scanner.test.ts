/**
 * Tests for Scanner.
 *
 * Per CLAUDE.md rule 3: tests written BEFORE implementation for core logic.
 */

import { join } from 'node:path';
import { createFixture } from 'fs-fixture';
import { describe, expect, it } from 'vitest';
import type { DetectorContext, ProjectDetector } from './detectors/detector.js';
import { RiskTier } from './safety/risk-tiers.js';
import { Scanner } from './scanner.js';
import type { CleanableItem, DetectedProject } from './types.js';

// ─── Stub detectors ───────────────────────────────────────────────────────────

/** Detects dirs containing a `marker.txt` file. */
function makeMarkerDetector(id = 'marker'): ProjectDetector {
  return {
    id,
    displayName: id,
    async quickProbe(dir) {
      const { access } = await import('node:fs/promises');
      try {
        await access(join(dir, 'marker.txt'));
        return true;
      } catch {
        return false;
      }
    },
    async analyze(dir, _ctx): Promise<DetectedProject> {
      return {
        root: dir,
        type: 'unknown',
        lastModified: Date.now(),
        hasGit: false,
        items: [],
      };
    },
    async scanGlobal(_ctx): Promise<readonly CleanableItem[]> {
      return [];
    },
  };
}

/** Always returns a global item. */
function makeGlobalDetector(): ProjectDetector {
  return {
    id: 'global-stub',
    displayName: 'Global Stub',
    async quickProbe() {
      return false;
    },
    async analyze() {
      return null;
    },
    async scanGlobal(_ctx): Promise<readonly CleanableItem[]> {
      return [
        {
          id: 'global-stub::item',
          path: '/fake/cache',
          detector: 'global-stub',
          risk: RiskTier.Green,
          sizeBytes: 1024,
          lastModified: Date.now(),
          description: 'stub global item',
        },
      ];
    },
  };
}

const ctx: DetectorContext = { scanRoot: '/', maxDepth: 5 };

// ─── scan — basic detection ──────────────────────────────────────────────────

describe('Scanner.scan', () => {
  it('detects a project in the root dir', async () => {
    const fix = await createFixture({ 'marker.txt': 'yes' });
    try {
      const scanner = new Scanner([makeMarkerDetector()]);
      const results = await scanner.scan(fix.path);
      expect(results).toHaveLength(1);
      expect(results[0]?.root).toBe(fix.path);
    } finally {
      await fix.rm();
    }
  });

  it('detects projects in subdirectories', async () => {
    const fix = await createFixture({
      'projects/a/marker.txt': 'yes',
      'projects/b/marker.txt': 'yes',
    });
    try {
      const scanner = new Scanner([makeMarkerDetector()]);
      const results = await scanner.scan(fix.path);
      expect(results).toHaveLength(2);
      const roots = results.map((r) => r.root).sort();
      expect(roots).toEqual([join(fix.path, 'projects', 'a'), join(fix.path, 'projects', 'b')]);
    } finally {
      await fix.rm();
    }
  });

  it('returns empty array when no projects found', async () => {
    const fix = await createFixture({ 'README.md': 'hello' });
    try {
      const scanner = new Scanner([makeMarkerDetector()]);
      const results = await scanner.scan(fix.path);
      expect(results).toHaveLength(0);
    } finally {
      await fix.rm();
    }
  });

  it('does not recurse into a detected project directory', async () => {
    // outer project contains inner project — Scanner should stop at outer
    const fix = await createFixture({
      'marker.txt': 'yes',
      'subdir/marker.txt': 'yes',
    });
    try {
      const scanner = new Scanner([makeMarkerDetector()]);
      const results = await scanner.scan(fix.path);
      // Only the root project detected — no recursion into subdir once detected
      expect(results).toHaveLength(1);
      expect(results[0]?.root).toBe(fix.path);
    } finally {
      await fix.rm();
    }
  });

  it('respects maxDepth option', async () => {
    const fix = await createFixture({
      'a/b/c/marker.txt': 'deep',
    });
    try {
      const scanner = new Scanner([makeMarkerDetector()]);
      // maxDepth=1 means only root + 1 level deep
      const results = await scanner.scan(fix.path, { maxDepth: 1 });
      expect(results).toHaveLength(0);
    } finally {
      await fix.rm();
    }
  });

  it('skips directories named node_modules', async () => {
    const fix = await createFixture({
      'node_modules/some-pkg/marker.txt': 'yes',
    });
    try {
      const scanner = new Scanner([makeMarkerDetector()]);
      const results = await scanner.scan(fix.path);
      expect(results).toHaveLength(0);
    } finally {
      await fix.rm();
    }
  });

  it('skips directories named .git', async () => {
    const fix = await createFixture({
      '.git/objects/marker.txt': 'yes',
    });
    try {
      const scanner = new Scanner([makeMarkerDetector()]);
      const results = await scanner.scan(fix.path);
      expect(results).toHaveLength(0);
    } finally {
      await fix.rm();
    }
  });

  it('uses all provided detectors', async () => {
    const fix = await createFixture({
      'a/marker.txt': 'yes',
      'b/marker.txt': 'yes',
    });
    try {
      const d1 = makeMarkerDetector('d1');
      const d2 = makeMarkerDetector('d2');
      const scanner = new Scanner([d1, d2]);
      const results = await scanner.scan(fix.path);
      // Each subdir matches both detectors → 4 projects total
      expect(results).toHaveLength(4);
    } finally {
      await fix.rm();
    }
  });
});

// ─── scanGlobal ───────────────────────────────────────────────────────────────

describe('Scanner.scanGlobal', () => {
  it('collects global items from all detectors', async () => {
    const scanner = new Scanner([makeGlobalDetector(), makeGlobalDetector()]);
    const items = await scanner.scanGlobal(ctx);
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.detector).toBe('global-stub');
    }
  });

  it('returns empty array when no detector has global items', async () => {
    const scanner = new Scanner([makeMarkerDetector()]);
    const items = await scanner.scanGlobal(ctx);
    expect(items).toHaveLength(0);
  });
});
