/**
 * Tests for CocoaPodsDetector.
 * Per CLAUDE.md rule 3: tests written BEFORE implementation.
 */

import { join } from 'node:path';
import { createFixture } from 'fs-fixture';
import { describe, expect, it } from 'vitest';
import { RiskTier } from '../safety/risk-tiers.js';
import { CocoaPodsDetector } from './cocoapods-detector.js';
import type { DetectorContext } from './detector.js';

const ctx: DetectorContext = { scanRoot: '/', maxDepth: 5 };

describe('CocoaPodsDetector.quickProbe', () => {
  it('returns true when Podfile exists', async () => {
    const fix = await createFixture({ Podfile: "platform :ios, '15.0'" });
    try {
      expect(await new CocoaPodsDetector().quickProbe(fix.path)).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('returns true when Podfile.lock exists', async () => {
    const fix = await createFixture({ 'Podfile.lock': 'PODS: []' });
    try {
      expect(await new CocoaPodsDetector().quickProbe(fix.path)).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('returns false when no CocoaPods markers found', async () => {
    const fix = await createFixture({ 'package.json': '{}' });
    try {
      expect(await new CocoaPodsDetector().quickProbe(fix.path)).toBe(false);
    } finally {
      await fix.rm();
    }
  });
});

describe('CocoaPodsDetector.analyze', () => {
  it('returns null when no CocoaPods markers found', async () => {
    const fix = await createFixture({ 'README.md': 'hello' });
    try {
      expect(await new CocoaPodsDetector().analyze(fix.path, ctx)).toBeNull();
    } finally {
      await fix.rm();
    }
  });

  it('returns type=cocoapods', async () => {
    const fix = await createFixture({ Podfile: "platform :ios, '15.0'" });
    try {
      const result = await new CocoaPodsDetector().analyze(fix.path, ctx);
      expect(result?.type).toBe('cocoapods');
    } finally {
      await fix.rm();
    }
  });

  it('detects Pods/ as Yellow', async () => {
    const fix = await createFixture({
      Podfile: "platform :ios, '15.0'",
      'Pods/Alamofire/Alamofire.swift': 'data',
    });
    try {
      const result = await new CocoaPodsDetector().analyze(fix.path, ctx);
      const item = result?.items.find((i) => i.path === join(fix.path, 'Pods'));
      expect(item).toBeDefined();
      expect(item?.risk).toBe(RiskTier.Yellow);
    } finally {
      await fix.rm();
    }
  });

  it('returns empty items when nothing to clean', async () => {
    const fix = await createFixture({ Podfile: "platform :ios, '15.0'" });
    try {
      const result = await new CocoaPodsDetector().analyze(fix.path, ctx);
      expect(result?.items).toHaveLength(0);
    } finally {
      await fix.rm();
    }
  });
});

describe('CocoaPodsDetector.scanGlobal', () => {
  it('returns Green items for ~/.cocoapods/repos', async () => {
    const home = await createFixture({
      '.cocoapods/repos/trunk/Specs/a/b/SomeLib/1.0.0/SomeLib.podspec.json': '{}',
    });
    try {
      const detector = new CocoaPodsDetector({ homeDir: home.path });
      const items = await detector.scanGlobal(ctx);
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.risk).toBe(RiskTier.Green);
        expect(item.detector).toBe('cocoapods');
      }
    } finally {
      await home.rm();
    }
  });

  it('returns empty array when no global caches exist', async () => {
    const home = await createFixture({});
    try {
      const detector = new CocoaPodsDetector({ homeDir: home.path });
      const items = await detector.scanGlobal(ctx);
      expect(items).toHaveLength(0);
    } finally {
      await home.rm();
    }
  });
});
