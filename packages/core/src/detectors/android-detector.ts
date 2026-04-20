/**
 * AndroidDetector — detects Android/Gradle projects and their cleanable artifacts.
 *
 * Handles:
 * - Project-level: .gradle/, build/
 * - Global: ~/.gradle/caches (Gradle dependency cache)
 *
 * Risk classification:
 * - .gradle/, build/: Yellow
 * - ~/.gradle/caches: Green
 */

import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { RiskTier } from '../safety/risk-tiers.js';
import type { CleanableItem, DetectedProject } from '../types.js';
import { BaseDetector, type DetectorContext } from './detector.js';

const MARKERS = ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'];

const PROJECT_DIRS = [
  { dir: '.gradle', description: 'Gradle project cache — regenerated on next build' },
  { dir: 'build', description: 'Android build output — regenerate with `./gradlew build`' },
];

export interface AndroidDetectorOptions {
  readonly homeDir?: string;
}

export class AndroidDetector extends BaseDetector {
  readonly id = 'android';
  readonly displayName = 'Android';

  private readonly homeDir: string;

  constructor(options: AndroidDetectorOptions = {}) {
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

    for (const { dir: projDir, description } of PROJECT_DIRS) {
      const targetPath = join(dir, projDir);
      if (await this.dirExists(targetPath)) {
        items.push({
          id: `${dir}::${projDir}`,
          path: targetPath,
          detector: this.id,
          risk: RiskTier.Yellow,
          sizeBytes: await this.computeSize(targetPath),
          lastModified: await this.getLastModified(targetPath),
          description,
          projectRoot: dir,
        });
      }
    }

    return {
      root: dir,
      type: 'android',
      lastModified: await this.getLastModified(dir),
      hasGit: await this.dirExists(join(dir, '.git')),
      items,
    };
  }

  override async scanGlobal(_ctx: DetectorContext): Promise<readonly CleanableItem[]> {
    const items: CleanableItem[] = [];

    const caches = [
      {
        cachePath: join(this.homeDir, '.gradle', 'caches'),
        description: 'Gradle dependency cache — re-downloaded automatically',
      },
    ];

    for (const { cachePath, description } of caches) {
      if (await this.dirExists(cachePath)) {
        items.push({
          id: `global::android::${cachePath}`,
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
