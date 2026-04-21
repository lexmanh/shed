import { join } from 'node:path';
import { createFixture } from 'fs-fixture';
import { describe, expect, it } from 'vitest';
import { RiskTier } from '../safety/risk-tiers.js';
import type { DetectorContext } from './detector.js';
import { JavaMavenDetector } from './java-maven-detector.js';

const ctx: DetectorContext = { scanRoot: '/', maxDepth: 5 };

const MINIMAL_POM = `<?xml version="1.0"?>
<project>
  <groupId>com.example</groupId>
  <artifactId>my-app</artifactId>
  <version>1.0</version>
</project>`;

describe('JavaMavenDetector.quickProbe', () => {
  it('returns true when pom.xml exists', async () => {
    const fix = await createFixture({ 'pom.xml': MINIMAL_POM });
    try {
      expect(await new JavaMavenDetector().quickProbe(fix.path)).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('returns false when pom.xml absent', async () => {
    const fix = await createFixture({ 'build.gradle': '' });
    try {
      expect(await new JavaMavenDetector().quickProbe(fix.path)).toBe(false);
    } finally {
      await fix.rm();
    }
  });
});

describe('JavaMavenDetector.analyze', () => {
  it('returns null when pom.xml absent', async () => {
    const fix = await createFixture({});
    try {
      expect(await new JavaMavenDetector().analyze(fix.path, ctx)).toBeNull();
    } finally {
      await fix.rm();
    }
  });

  it('returns null when pom.xml is not valid XML', async () => {
    const fix = await createFixture({ 'pom.xml': 'not xml at all' });
    try {
      expect(await new JavaMavenDetector().analyze(fix.path, ctx)).toBeNull();
    } finally {
      await fix.rm();
    }
  });

  it('returns type=java-maven', async () => {
    const fix = await createFixture({ 'pom.xml': MINIMAL_POM });
    try {
      expect((await new JavaMavenDetector().analyze(fix.path, ctx))?.type).toBe('java-maven');
    } finally {
      await fix.rm();
    }
  });

  it('extracts artifactId as name', async () => {
    const fix = await createFixture({ 'pom.xml': MINIMAL_POM });
    try {
      expect((await new JavaMavenDetector().analyze(fix.path, ctx))?.name).toBe('my-app');
    } finally {
      await fix.rm();
    }
  });

  it('returns target/ as Yellow when present', async () => {
    const fix = await createFixture({
      'pom.xml': MINIMAL_POM,
      'target/my-app-1.0.jar': '',
    });
    try {
      const result = await new JavaMavenDetector().analyze(fix.path, ctx);
      const target = result?.items.find((i) => i.path === join(fix.path, 'target'));
      expect(target?.risk).toBe(RiskTier.Yellow);
    } finally {
      await fix.rm();
    }
  });

  it('returns no items when target absent', async () => {
    const fix = await createFixture({ 'pom.xml': MINIMAL_POM });
    try {
      expect((await new JavaMavenDetector().analyze(fix.path, ctx))?.items).toHaveLength(0);
    } finally {
      await fix.rm();
    }
  });
});

describe('JavaMavenDetector.scanGlobal', () => {
  it('returns .m2/repository as Green when present', async () => {
    const fix = await createFixture({ '.m2/repository/com/example/app.jar': '' });
    try {
      const items = await new JavaMavenDetector({ homeDir: fix.path }).scanGlobal(ctx);
      expect(items.length).toBeGreaterThan(0);
      expect(items[0]?.risk).toBe(RiskTier.Green);
    } finally {
      await fix.rm();
    }
  });

  it('returns empty when .m2 absent', async () => {
    const fix = await createFixture({});
    try {
      expect(await new JavaMavenDetector({ homeDir: fix.path }).scanGlobal(ctx)).toHaveLength(0);
    } finally {
      await fix.rm();
    }
  });
});
