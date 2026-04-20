/**
 * Tests for AndroidDetector.
 * Per CLAUDE.md rule 3: tests written BEFORE implementation.
 */

import { join } from 'node:path';
import { createFixture } from 'fs-fixture';
import { describe, expect, it } from 'vitest';
import { RiskTier } from '../safety/risk-tiers.js';
import { AndroidDetector } from './android-detector.js';
import type { DetectorContext } from './detector.js';

const ctx: DetectorContext = { scanRoot: '/', maxDepth: 5 };

describe('AndroidDetector.quickProbe', () => {
  it('returns true when build.gradle exists', async () => {
    const fix = await createFixture({ 'build.gradle': 'android {}' });
    try {
      expect(await new AndroidDetector().quickProbe(fix.path)).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('returns true when build.gradle.kts exists', async () => {
    const fix = await createFixture({ 'build.gradle.kts': 'android {}' });
    try {
      expect(await new AndroidDetector().quickProbe(fix.path)).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('returns true when settings.gradle exists', async () => {
    const fix = await createFixture({ 'settings.gradle': 'rootProject.name = "MyApp"' });
    try {
      expect(await new AndroidDetector().quickProbe(fix.path)).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('returns false when no marker exists', async () => {
    const fix = await createFixture({ 'package.json': '{}' });
    try {
      expect(await new AndroidDetector().quickProbe(fix.path)).toBe(false);
    } finally {
      await fix.rm();
    }
  });
});

describe('AndroidDetector.analyze', () => {
  it('returns null when no Android markers found', async () => {
    const fix = await createFixture({ 'README.md': 'hello' });
    try {
      expect(await new AndroidDetector().analyze(fix.path, ctx)).toBeNull();
    } finally {
      await fix.rm();
    }
  });

  it('returns type=android', async () => {
    const fix = await createFixture({ 'build.gradle': 'android {}' });
    try {
      const result = await new AndroidDetector().analyze(fix.path, ctx);
      expect(result?.type).toBe('android');
    } finally {
      await fix.rm();
    }
  });

  it('detects .gradle/ as Yellow', async () => {
    const fix = await createFixture({
      'build.gradle': 'android {}',
      '.gradle/caches/modules/files/lib.jar': 'data',
    });
    try {
      const result = await new AndroidDetector().analyze(fix.path, ctx);
      const item = result?.items.find((i) => i.path === join(fix.path, '.gradle'));
      expect(item).toBeDefined();
      expect(item?.risk).toBe(RiskTier.Yellow);
    } finally {
      await fix.rm();
    }
  });

  it('detects build/ as Yellow', async () => {
    const fix = await createFixture({
      'build.gradle': 'android {}',
      'build/outputs/apk/release.apk': 'data',
    });
    try {
      const result = await new AndroidDetector().analyze(fix.path, ctx);
      const item = result?.items.find((i) => i.path === join(fix.path, 'build'));
      expect(item).toBeDefined();
      expect(item?.risk).toBe(RiskTier.Yellow);
    } finally {
      await fix.rm();
    }
  });

  it('returns empty items when nothing to clean', async () => {
    const fix = await createFixture({ 'build.gradle': 'android {}' });
    try {
      const result = await new AndroidDetector().analyze(fix.path, ctx);
      expect(result?.items).toHaveLength(0);
    } finally {
      await fix.rm();
    }
  });
});

describe('AndroidDetector.scanGlobal', () => {
  it('returns Green items for ~/.gradle/caches', async () => {
    const home = await createFixture({ '.gradle/caches/modules-2/files/lib.jar': 'data' });
    try {
      const detector = new AndroidDetector({ homeDir: home.path });
      const items = await detector.scanGlobal(ctx);
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.risk).toBe(RiskTier.Green);
        expect(item.detector).toBe('android');
      }
    } finally {
      await home.rm();
    }
  });

  it('returns empty array when no global caches exist', async () => {
    const home = await createFixture({});
    try {
      const detector = new AndroidDetector({ homeDir: home.path });
      const items = await detector.scanGlobal(ctx);
      expect(items).toHaveLength(0);
    } finally {
      await home.rm();
    }
  });
});
