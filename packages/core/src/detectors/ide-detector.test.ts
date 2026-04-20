/**
 * Tests for IdeDetector.
 * Per CLAUDE.md rule 3: tests written BEFORE implementation.
 *
 * IdeDetector is global-only (no per-project markers).
 * Scans JetBrains system caches and VSCode workspaceStorage.
 */

import { createFixture } from 'fs-fixture';
import { describe, expect, it } from 'vitest';
import { RiskTier } from '../safety/risk-tiers.js';
import type { DetectorContext } from './detector.js';
import { IdeDetector } from './ide-detector.js';

const ctx: DetectorContext = { scanRoot: '/', maxDepth: 5 };

describe('IdeDetector.quickProbe', () => {
  it('always returns false (global-only detector)', async () => {
    const fix = await createFixture({ '.idea/workspace.xml': '<project/>' });
    try {
      expect(await new IdeDetector().quickProbe(fix.path)).toBe(false);
    } finally {
      await fix.rm();
    }
  });
});

describe('IdeDetector.analyze', () => {
  it('always returns null (global-only detector)', async () => {
    const fix = await createFixture({ '.idea/workspace.xml': '<project/>' });
    try {
      expect(await new IdeDetector().analyze(fix.path, ctx)).toBeNull();
    } finally {
      await fix.rm();
    }
  });
});

describe('IdeDetector.scanGlobal — JetBrains', () => {
  it('returns Green items for JetBrains system cache dirs (macOS)', async () => {
    const home = await createFixture({
      'Library/Caches/JetBrains/IntelliJIdea2023.3/caches/some.cache': 'data',
    });
    try {
      const detector = new IdeDetector({ homeDir: home.path, platform: 'darwin' });
      const items = await detector.scanGlobal(ctx);
      const jbItem = items.find((i) => i.path.includes('IntelliJIdea2023.3'));
      expect(jbItem).toBeDefined();
      expect(jbItem?.risk).toBe(RiskTier.Green);
      expect(jbItem?.detector).toBe('ide');
    } finally {
      await home.rm();
    }
  });

  it('returns Green items for JetBrains system cache dirs (linux)', async () => {
    const home = await createFixture({
      '.cache/JetBrains/IntelliJIdea2023.3/caches/some.cache': 'data',
    });
    try {
      const detector = new IdeDetector({ homeDir: home.path, platform: 'linux' });
      const items = await detector.scanGlobal(ctx);
      const jbItem = items.find((i) => i.path.includes('IntelliJIdea2023.3'));
      expect(jbItem).toBeDefined();
      expect(jbItem?.risk).toBe(RiskTier.Green);
    } finally {
      await home.rm();
    }
  });

  it('returns Green items for multiple JetBrains IDEs', async () => {
    const home = await createFixture({
      'Library/Caches/JetBrains/WebStorm2024.1/caches/a': 'x',
      'Library/Caches/JetBrains/PyCharm2023.2/caches/b': 'y',
    });
    try {
      const detector = new IdeDetector({ homeDir: home.path, platform: 'darwin' });
      const items = await detector.scanGlobal(ctx);
      const jbItems = items.filter((i) => i.path.includes('JetBrains'));
      expect(jbItems.length).toBe(2);
    } finally {
      await home.rm();
    }
  });

  it('returns empty array when no JetBrains caches exist', async () => {
    const home = await createFixture({});
    try {
      const detector = new IdeDetector({ homeDir: home.path, platform: 'darwin' });
      const items = await detector.scanGlobal(ctx);
      expect(items).toHaveLength(0);
    } finally {
      await home.rm();
    }
  });
});

describe('IdeDetector.scanGlobal — VSCode', () => {
  it('returns Green items for VSCode workspaceStorage', async () => {
    const home = await createFixture({
      'Library/Application Support/Code/User/workspaceStorage/abc123def/workspace.json': '{}',
    });
    try {
      const detector = new IdeDetector({ homeDir: home.path, platform: 'darwin' });
      const items = await detector.scanGlobal(ctx);
      const vsItem = items.find((i) => i.path.includes('workspaceStorage'));
      expect(vsItem).toBeDefined();
      expect(vsItem?.risk).toBe(RiskTier.Green);
      expect(vsItem?.detector).toBe('ide');
    } finally {
      await home.rm();
    }
  });

  it('uses Linux VSCode path when platform is linux', async () => {
    const home = await createFixture({
      '.config/Code/User/workspaceStorage/abc123/workspace.json': '{}',
    });
    try {
      const detector = new IdeDetector({ homeDir: home.path, platform: 'linux' });
      const items = await detector.scanGlobal(ctx);
      const vsItem = items.find((i) => i.path.includes('workspaceStorage'));
      expect(vsItem).toBeDefined();
    } finally {
      await home.rm();
    }
  });
});
