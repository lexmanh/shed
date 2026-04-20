/**
 * Tests for FlutterDetector.
 * Per CLAUDE.md rule 3: tests written BEFORE implementation.
 */

import { join } from 'node:path';
import { createFixture } from 'fs-fixture';
import { describe, expect, it } from 'vitest';
import { RiskTier } from '../safety/risk-tiers.js';
import type { DetectorContext } from './detector.js';
import { FlutterDetector } from './flutter-detector.js';

const ctx: DetectorContext = { scanRoot: '/', maxDepth: 5 };

describe('FlutterDetector.quickProbe', () => {
  it('returns true when pubspec.yaml exists', async () => {
    const fix = await createFixture({ 'pubspec.yaml': 'name: my_app' });
    try {
      expect(await new FlutterDetector().quickProbe(fix.path)).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('returns false when pubspec.yaml is absent', async () => {
    const fix = await createFixture({ 'package.json': '{}' });
    try {
      expect(await new FlutterDetector().quickProbe(fix.path)).toBe(false);
    } finally {
      await fix.rm();
    }
  });
});

describe('FlutterDetector.analyze — null cases', () => {
  it('returns null when pubspec.yaml is absent', async () => {
    const fix = await createFixture({ 'README.md': 'hello' });
    try {
      expect(await new FlutterDetector().analyze(fix.path, ctx)).toBeNull();
    } finally {
      await fix.rm();
    }
  });
});

describe('FlutterDetector.analyze — metadata', () => {
  it('returns type=flutter', async () => {
    const fix = await createFixture({ 'pubspec.yaml': 'name: my_app' });
    try {
      const result = await new FlutterDetector().analyze(fix.path, ctx);
      expect(result?.type).toBe('flutter');
    } finally {
      await fix.rm();
    }
  });

  it('reads name from pubspec.yaml', async () => {
    const fix = await createFixture({ 'pubspec.yaml': 'name: awesome_app\nversion: 1.0.0' });
    try {
      const result = await new FlutterDetector().analyze(fix.path, ctx);
      expect(result?.name).toBe('awesome_app');
    } finally {
      await fix.rm();
    }
  });

  it('name is undefined when pubspec.yaml has no name field', async () => {
    const fix = await createFixture({ 'pubspec.yaml': 'version: 1.0.0' });
    try {
      const result = await new FlutterDetector().analyze(fix.path, ctx);
      expect(result?.name).toBeUndefined();
    } finally {
      await fix.rm();
    }
  });
});

describe('FlutterDetector.analyze — cleanable items', () => {
  const BUILD_DIRS = ['build', '.dart_tool'];

  for (const dir of BUILD_DIRS) {
    it(`detects ${dir}/ as Yellow`, async () => {
      const fix = await createFixture({
        'pubspec.yaml': 'name: app',
        [`${dir}/flutter_build/cache`]: 'data',
      });
      try {
        const result = await new FlutterDetector().analyze(fix.path, ctx);
        const item = result?.items.find((i) => i.path === join(fix.path, dir));
        expect(item, `expected ${dir} to be detected`).toBeDefined();
        expect(item?.risk).toBe(RiskTier.Yellow);
      } finally {
        await fix.rm();
      }
    });
  }

  it('returns empty items when no build dirs exist', async () => {
    const fix = await createFixture({ 'pubspec.yaml': 'name: app' });
    try {
      const result = await new FlutterDetector().analyze(fix.path, ctx);
      expect(result?.items).toHaveLength(0);
    } finally {
      await fix.rm();
    }
  });
});

describe('FlutterDetector.scanGlobal', () => {
  it('returns Green item for ~/.pub-cache when it exists', async () => {
    const home = await createFixture({ '.pub-cache/hosted/pub.dev/pkg/lib.dart': 'code' });
    try {
      const detector = new FlutterDetector({ homeDir: home.path });
      const items = await detector.scanGlobal(ctx);
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.risk).toBe(RiskTier.Green);
        expect(item.detector).toBe('flutter');
      }
    } finally {
      await home.rm();
    }
  });

  it('returns Green item for ~/.fvm/versions when it exists', async () => {
    const home = await createFixture({ '.fvm/versions/3.16.0/bin/flutter': 'bin' });
    try {
      const detector = new FlutterDetector({ homeDir: home.path });
      const items = await detector.scanGlobal(ctx);
      const fvmItem = items.find((i) => i.path.includes('.fvm'));
      expect(fvmItem).toBeDefined();
      expect(fvmItem?.risk).toBe(RiskTier.Green);
    } finally {
      await home.rm();
    }
  });

  it('returns empty array when no global caches exist', async () => {
    const home = await createFixture({});
    try {
      const detector = new FlutterDetector({ homeDir: home.path });
      const items = await detector.scanGlobal(ctx);
      expect(items).toHaveLength(0);
    } finally {
      await home.rm();
    }
  });
});
