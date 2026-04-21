import { join } from 'node:path';
import { createFixture } from 'fs-fixture';
import { describe, expect, it } from 'vitest';
import { RiskTier } from '../safety/risk-tiers.js';
import type { DetectorContext } from './detector.js';
import { JavaGradleDetector } from './java-gradle-detector.js';

const ctx: DetectorContext = { scanRoot: '/', maxDepth: 5 };

describe('JavaGradleDetector.quickProbe', () => {
  it('returns true when build.gradle exists', async () => {
    const fix = await createFixture({ 'build.gradle': 'plugins { id "java" }' });
    try {
      expect(await new JavaGradleDetector().quickProbe(fix.path)).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('returns true when build.gradle.kts exists', async () => {
    const fix = await createFixture({ 'build.gradle.kts': 'plugins { java }' });
    try {
      expect(await new JavaGradleDetector().quickProbe(fix.path)).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('returns true when settings.gradle exists', async () => {
    const fix = await createFixture({ 'settings.gradle': 'rootProject.name = "app"' });
    try {
      expect(await new JavaGradleDetector().quickProbe(fix.path)).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('returns false when no Gradle files exist', async () => {
    const fix = await createFixture({ 'pom.xml': '' });
    try {
      expect(await new JavaGradleDetector().quickProbe(fix.path)).toBe(false);
    } finally {
      await fix.rm();
    }
  });
});

describe('JavaGradleDetector.analyze', () => {
  it('returns null when no Gradle files found', async () => {
    const fix = await createFixture({});
    try {
      expect(await new JavaGradleDetector().analyze(fix.path, ctx)).toBeNull();
    } finally {
      await fix.rm();
    }
  });

  it('returns type=java-gradle', async () => {
    const fix = await createFixture({ 'build.gradle': '' });
    try {
      expect((await new JavaGradleDetector().analyze(fix.path, ctx))?.type).toBe('java-gradle');
    } finally {
      await fix.rm();
    }
  });

  it('returns build/ as Yellow when present', async () => {
    const fix = await createFixture({
      'build.gradle': '',
      'build/libs/app.jar': '',
    });
    try {
      const result = await new JavaGradleDetector().analyze(fix.path, ctx);
      const build = result?.items.find((i) => i.path === join(fix.path, 'build'));
      expect(build?.risk).toBe(RiskTier.Yellow);
    } finally {
      await fix.rm();
    }
  });

  it('returns .gradle/ as Yellow when present', async () => {
    const fix = await createFixture({
      'build.gradle': '',
      '.gradle/8.0/checksums': '',
    });
    try {
      const result = await new JavaGradleDetector().analyze(fix.path, ctx);
      const gradleCache = result?.items.find((i) => i.path === join(fix.path, '.gradle'));
      expect(gradleCache?.risk).toBe(RiskTier.Yellow);
    } finally {
      await fix.rm();
    }
  });

  it('returns no items when build dirs absent', async () => {
    const fix = await createFixture({ 'build.gradle': '' });
    try {
      expect((await new JavaGradleDetector().analyze(fix.path, ctx))?.items).toHaveLength(0);
    } finally {
      await fix.rm();
    }
  });
});

describe('JavaGradleDetector.scanGlobal', () => {
  it('returns ~/.gradle/caches as Green when present', async () => {
    const fix = await createFixture({ '.gradle/caches/modules-2/lock': '' });
    try {
      const items = await new JavaGradleDetector({ homeDir: fix.path }).scanGlobal(ctx);
      expect(items.length).toBeGreaterThan(0);
      expect(items[0]?.risk).toBe(RiskTier.Green);
    } finally {
      await fix.rm();
    }
  });

  it('returns empty when .gradle/caches absent', async () => {
    const fix = await createFixture({});
    try {
      expect(await new JavaGradleDetector({ homeDir: fix.path }).scanGlobal(ctx)).toHaveLength(0);
    } finally {
      await fix.rm();
    }
  });
});
