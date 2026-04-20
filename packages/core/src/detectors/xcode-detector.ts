/**
 * XcodeDetector — detects Xcode projects and their cleanable artifacts.
 *
 * Handles:
 * - Project-level: quickProbe/analyze for .xcodeproj / .xcworkspace
 * - Global: ~/Library/Developer/Xcode/DerivedData (per-project build cache)
 *
 * SAFETY (CLAUDE.md rule 4 — these are NEVER returned):
 * - ~/Library/Developer/Xcode/Archives/ — release builds needed for crash symbolication
 * - ~/Library/Developer/CoreSimulator/Devices/ — contains user data for simulator apps
 *
 * Risk classification:
 * - DerivedData entries: Yellow — fully regeneratable with Cmd+B
 */

import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { RiskTier } from '../safety/risk-tiers.js';
import type { CleanableItem, DetectedProject } from '../types.js';
import { BaseDetector, type DetectorContext } from './detector.js';

export interface XcodeDetectorOptions {
  /** Override Xcode developer directory for testability. Defaults to ~/Library/Developer/Xcode. */
  readonly xcodeDevDir?: string;
}

export class XcodeDetector extends BaseDetector {
  readonly id = 'xcode';
  readonly displayName = 'Xcode';

  private readonly xcodeDevDir: string;

  constructor(options: XcodeDetectorOptions = {}) {
    super();
    this.xcodeDevDir = options.xcodeDevDir ?? join(homedir(), 'Library', 'Developer', 'Xcode');
  }

  async quickProbe(dir: string): Promise<boolean> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return entries.some(
        (e) =>
          e.isDirectory() && (e.name.endsWith('.xcodeproj') || e.name.endsWith('.xcworkspace')),
      );
    } catch {
      return false;
    }
  }

  async analyze(dir: string, _ctx: DetectorContext): Promise<DetectedProject | null> {
    if (!(await this.quickProbe(dir))) return null;

    const entries = await readdir(dir, { withFileTypes: true });
    const marker = entries.find(
      (e) => e.isDirectory() && (e.name.endsWith('.xcodeproj') || e.name.endsWith('.xcworkspace')),
    );
    const name = marker?.name.replace(/\.(xcodeproj|xcworkspace)$/, '');

    return {
      root: dir,
      type: 'xcode',
      name,
      lastModified: await this.getLastModified(dir),
      hasGit: await this.dirExists(join(dir, '.git')),
      // DerivedData is global, not per-project dir — no items here
      items: [],
    };
  }

  override async scanGlobal(_ctx: DetectorContext): Promise<readonly CleanableItem[]> {
    const derivedDataDir = join(this.xcodeDevDir, 'DerivedData');
    if (!(await this.dirExists(derivedDataDir))) return [];

    const items: CleanableItem[] = [];
    let entries: Dirent[];
    try {
      entries = (await readdir(derivedDataDir, { withFileTypes: true })) as Dirent[];
    } catch {
      return [];
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Skip the manifest file (ModuleCache, info.plist etc at root level)
      if (!entry.name.includes('-')) continue;

      const entryPath = join(derivedDataDir, entry.name);
      // Strip the hash suffix for display name: "MyApp-abc123def" → "MyApp"
      const projectName = entry.name.replace(/-[a-z0-9]+$/i, '');

      items.push({
        id: `xcode::derived::${entry.name}`,
        path: entryPath,
        detector: this.id,
        risk: RiskTier.Yellow,
        sizeBytes: await this.computeSize(entryPath),
        lastModified: await this.getLastModified(entryPath),
        description: `Xcode DerivedData for "${projectName}" — regenerate with Cmd+B`,
      });
    }

    return items;
  }
}
