/**
 * CocoaPodsDetector — detects CocoaPods projects and their cleanable artifacts.
 *
 * Handles:
 * - Project-level: Pods/ directory (installed dependencies)
 * - Global: ~/.cocoapods/repos (spec repository mirror)
 *
 * SAFETY:
 * - Podfile.lock is a lock file — NEVER returned as a cleanable item (CLAUDE.md rule 4)
 *
 * Risk classification:
 * - Pods/: Yellow — regenerate with `pod install`
 * - ~/.cocoapods/repos: Green — re-fetched automatically on next `pod install`
 */

import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { RiskTier } from '../safety/risk-tiers.js';
import type { CleanableItem, DetectedProject } from '../types.js';
import { BaseDetector, type DetectorContext } from './detector.js';

const MARKERS = ['Podfile', 'Podfile.lock'];

export interface CocoaPodsDetectorOptions {
  readonly homeDir?: string;
}

export class CocoaPodsDetector extends BaseDetector {
  readonly id = 'cocoapods';
  readonly displayName = 'CocoaPods';

  private readonly homeDir: string;

  constructor(options: CocoaPodsDetectorOptions = {}) {
    super();
    this.homeDir = options.homeDir ?? homedir();
  }

  async quickProbe(dir: string): Promise<boolean> {
    for (const marker of MARKERS) {
      try {
        await access(join(dir, marker));
        return true;
      } catch {
        /* continue */
      }
    }
    return false;
  }

  async analyze(dir: string, _ctx: DetectorContext): Promise<DetectedProject | null> {
    if (!(await this.quickProbe(dir))) return null;

    const items: CleanableItem[] = [];
    const podsPath = join(dir, 'Pods');

    if (await this.dirExists(podsPath)) {
      items.push({
        id: `${dir}::Pods`,
        path: podsPath,
        detector: this.id,
        risk: RiskTier.Yellow,
        sizeBytes: await this.computeSize(podsPath),
        lastModified: await this.getLastModified(podsPath),
        description: 'CocoaPods installed dependencies — regenerate with `pod install`',
        projectRoot: dir,
      });
    }

    return {
      root: dir,
      type: 'cocoapods',
      lastModified: await this.getLastModified(dir),
      hasGit: await this.dirExists(join(dir, '.git')),
      items,
    };
  }

  override async scanGlobal(_ctx: DetectorContext): Promise<readonly CleanableItem[]> {
    const items: CleanableItem[] = [];

    const caches = [
      {
        cachePath: join(this.homeDir, '.cocoapods', 'repos'),
        description: 'CocoaPods spec repository mirror — re-fetched on next `pod install`',
      },
    ];

    for (const { cachePath, description } of caches) {
      if (await this.dirExists(cachePath)) {
        items.push({
          id: `global::cocoapods::${cachePath}`,
          path: cachePath,
          detector: this.id,
          risk: RiskTier.Green,
          sizeBytes: await this.computeSize(cachePath),
          lastModified: await this.getLastModified(cachePath),
          description,
        });
      }
    }

    return items;
  }
}
