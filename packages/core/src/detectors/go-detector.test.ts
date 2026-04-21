import { join } from 'node:path';
import { createFixture } from 'fs-fixture';
import { describe, expect, it } from 'vitest';
import { RiskTier } from '../safety/risk-tiers.js';
import type { DetectorContext } from './detector.js';
import { GoDetector } from './go-detector.js';

const ctx: DetectorContext = { scanRoot: '/', maxDepth: 5 };

describe('GoDetector.quickProbe', () => {
  it('returns true when go.mod exists', async () => {
    const fix = await createFixture({ 'go.mod': 'module example.com/app\n\ngo 1.21\n' });
    try {
      expect(await new GoDetector().quickProbe(fix.path)).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('returns false when go.mod is absent', async () => {
    const fix = await createFixture({ 'main.go': 'package main' });
    try {
      expect(await new GoDetector().quickProbe(fix.path)).toBe(false);
    } finally {
      await fix.rm();
    }
  });
});

describe('GoDetector.analyze', () => {
  it('returns null when go.mod absent', async () => {
    const fix = await createFixture({});
    try {
      expect(await new GoDetector().analyze(fix.path, ctx)).toBeNull();
    } finally {
      await fix.rm();
    }
  });

  it('returns type=go', async () => {
    const fix = await createFixture({ 'go.mod': 'module example.com/app\n\ngo 1.21\n' });
    try {
      expect((await new GoDetector().analyze(fix.path, ctx))?.type).toBe('go');
    } finally {
      await fix.rm();
    }
  });

  it('extracts module name', async () => {
    const fix = await createFixture({ 'go.mod': 'module github.com/user/myapp\n\ngo 1.21\n' });
    try {
      expect((await new GoDetector().analyze(fix.path, ctx))?.name).toBe('github.com/user/myapp');
    } finally {
      await fix.rm();
    }
  });

  it('returns vendor/ as Yellow when present', async () => {
    const fix = await createFixture({
      'go.mod': 'module example.com/app\n\ngo 1.21\n',
      'vendor/modules.txt': '',
    });
    try {
      const result = await new GoDetector().analyze(fix.path, ctx);
      const vendor = result?.items.find((i) => i.path === join(fix.path, 'vendor'));
      expect(vendor?.risk).toBe(RiskTier.Yellow);
    } finally {
      await fix.rm();
    }
  });

  it('returns no items when vendor absent', async () => {
    const fix = await createFixture({ 'go.mod': 'module example.com/app\n\ngo 1.21\n' });
    try {
      expect((await new GoDetector().analyze(fix.path, ctx))?.items).toHaveLength(0);
    } finally {
      await fix.rm();
    }
  });

  it('handles unicode paths', async () => {
    const fix = await createFixture({ 'go.mod': 'module example.com/phân-tích\n\ngo 1.21\n' });
    try {
      expect(await new GoDetector().analyze(fix.path, ctx)).not.toBeNull();
    } finally {
      await fix.rm();
    }
  });
});

describe('GoDetector.scanGlobal', () => {
  it('returns mod cache as Green when present', async () => {
    const fix = await createFixture({ 'go/pkg/mod/cache/lock': '' });
    try {
      const items = await new GoDetector({ homeDir: fix.path }).scanGlobal(ctx);
      expect(items.length).toBeGreaterThan(0);
      expect(items[0]?.risk).toBe(RiskTier.Green);
    } finally {
      await fix.rm();
    }
  });

  it('returns empty when mod cache absent', async () => {
    const fix = await createFixture({});
    try {
      expect(await new GoDetector({ homeDir: fix.path }).scanGlobal(ctx)).toHaveLength(0);
    } finally {
      await fix.rm();
    }
  });
});
