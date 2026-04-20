/**
 * Tests for XcodeDetector.
 *
 * Per CLAUDE.md rule 3: tests written BEFORE implementation.
 *
 * Safety constraints (CLAUDE.md rule 4):
 * - Archives (~/.../Xcode/Archives/) MUST NEVER appear in items
 * - CoreSimulator/Devices MUST NEVER appear in items
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createFixture } from 'fs-fixture';
import { describe, expect, it } from 'vitest';
import { RiskTier } from '../safety/risk-tiers.js';
import type { DetectorContext } from './detector.js';
import { XcodeDetector } from './xcode-detector.js';

const ctx: DetectorContext = { scanRoot: '/', maxDepth: 5 };

// ─── quickProbe ──────────────────────────────────────────────────────────────

describe('XcodeDetector.quickProbe', () => {
  it('returns true when .xcodeproj directory exists', async () => {
    const fix = await createFixture({ 'MyApp.xcodeproj/project.pbxproj': 'content' });
    try {
      expect(await new XcodeDetector().quickProbe(fix.path)).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('returns true when .xcworkspace directory exists', async () => {
    const fix = await createFixture({ 'MyApp.xcworkspace/contents.xcworkspacedata': 'content' });
    try {
      expect(await new XcodeDetector().quickProbe(fix.path)).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('returns false when neither exists', async () => {
    const fix = await createFixture({ 'README.md': 'hello' });
    try {
      expect(await new XcodeDetector().quickProbe(fix.path)).toBe(false);
    } finally {
      await fix.rm();
    }
  });
});

// ─── analyze — null / metadata ────────────────────────────────────────────────

describe('XcodeDetector.analyze', () => {
  it('returns null when no Xcode markers found', async () => {
    const fix = await createFixture({ 'Package.swift': 'content' });
    try {
      expect(await new XcodeDetector().analyze(fix.path, ctx)).toBeNull();
    } finally {
      await fix.rm();
    }
  });

  it('returns type=xcode', async () => {
    const fix = await createFixture({ 'MyApp.xcodeproj/project.pbxproj': 'content' });
    try {
      const result = await new XcodeDetector().analyze(fix.path, ctx);
      expect(result?.type).toBe('xcode');
    } finally {
      await fix.rm();
    }
  });

  it('reads name from .xcodeproj directory name', async () => {
    const fix = await createFixture({ 'CoolApp.xcodeproj/project.pbxproj': 'content' });
    try {
      const result = await new XcodeDetector().analyze(fix.path, ctx);
      expect(result?.name).toBe('CoolApp');
    } finally {
      await fix.rm();
    }
  });

  it('returns empty items (DerivedData is global, not per-project)', async () => {
    const fix = await createFixture({ 'MyApp.xcodeproj/project.pbxproj': 'content' });
    try {
      const result = await new XcodeDetector().analyze(fix.path, ctx);
      expect(result?.items).toHaveLength(0);
    } finally {
      await fix.rm();
    }
  });
});

// ─── scanGlobal — DerivedData ─────────────────────────────────────────────────

describe('XcodeDetector.scanGlobal — DerivedData', () => {
  it('returns Yellow items for each DerivedData subfolder', async () => {
    const home = await createFixture({
      'Library/Developer/Xcode/DerivedData/MyApp-abc123/Build/Products/index.o': 'obj',
      'Library/Developer/Xcode/DerivedData/OtherApp-xyz789/Build/Products/main.o': 'obj',
    });
    try {
      const detector = new XcodeDetector({
        xcodeDevDir: join(home.path, 'Library', 'Developer', 'Xcode'),
      });
      const items = await detector.scanGlobal(ctx);
      expect(items.length).toBe(2);
      for (const item of items) {
        expect(item.risk).toBe(RiskTier.Yellow);
        expect(item.detector).toBe('xcode');
        expect(item.path).toContain('DerivedData');
      }
    } finally {
      await home.rm();
    }
  });

  it('returns empty array when DerivedData dir does not exist', async () => {
    const home = await createFixture({});
    try {
      const detector = new XcodeDetector({
        xcodeDevDir: join(home.path, 'Library', 'Developer', 'Xcode'),
      });
      const items = await detector.scanGlobal(ctx);
      expect(items).toHaveLength(0);
    } finally {
      await home.rm();
    }
  });

  it('returns empty array when DerivedData is empty', async () => {
    const home = await createFixture({});
    try {
      await mkdir(join(home.path, 'Library', 'Developer', 'Xcode', 'DerivedData'), {
        recursive: true,
      });
      const detector = new XcodeDetector({
        xcodeDevDir: join(home.path, 'Library', 'Developer', 'Xcode'),
      });
      const items = await detector.scanGlobal(ctx);
      expect(items).toHaveLength(0);
    } finally {
      await home.rm();
    }
  });

  it('sizeBytes > 0 for DerivedData folders with content', async () => {
    const home = await createFixture({
      'Library/Developer/Xcode/DerivedData/MyApp-abc/Build/main.o': 'x'.repeat(4096),
    });
    try {
      const detector = new XcodeDetector({
        xcodeDevDir: join(home.path, 'Library', 'Developer', 'Xcode'),
      });
      const items = await detector.scanGlobal(ctx);
      expect(items[0]?.sizeBytes).toBeGreaterThan(0);
    } finally {
      await home.rm();
    }
  });
});

// ─── SAFETY: Archives and Simulators MUST NEVER be returned ──────────────────

describe('XcodeDetector — safety: never return Archives or Simulators', () => {
  it('NEVER includes Xcode Archives in scan results', async () => {
    const home = await createFixture({
      'Library/Developer/Xcode/Archives/2024-01-01/MyApp.xcarchive/Products/main': 'binary',
      'Library/Developer/Xcode/DerivedData/MyApp-abc/Build/main.o': 'obj',
    });
    try {
      const detector = new XcodeDetector({
        xcodeDevDir: join(home.path, 'Library', 'Developer', 'Xcode'),
      });
      const items = await detector.scanGlobal(ctx);
      const archiveItems = items.filter((i) => i.path.includes('Archives'));
      expect(archiveItems).toHaveLength(0);
    } finally {
      await home.rm();
    }
  });

  it('NEVER includes CoreSimulator Devices in scan results', async () => {
    const home = await createFixture({
      'Library/Developer/CoreSimulator/Devices/device-uuid/data/app.bundle': 'app',
      'Library/Developer/Xcode/DerivedData/MyApp-abc/Build/main.o': 'obj',
    });
    try {
      const detector = new XcodeDetector({
        xcodeDevDir: join(home.path, 'Library', 'Developer', 'Xcode'),
      });
      const items = await detector.scanGlobal(ctx);
      const simItems = items.filter((i) => i.path.includes('CoreSimulator'));
      expect(simItems).toHaveLength(0);
    } finally {
      await home.rm();
    }
  });
});
