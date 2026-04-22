/**
 * AndroidDetector — detects Android/Gradle projects and their cleanable artifacts.
 *
 * Handles project-level: .gradle/, build/ (Yellow).
 *
 * Global ~/.gradle/caches is owned by JavaGradleDetector to avoid double-counting
 * — see scanGlobal() for context.
 */

import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { RiskTier } from '../safety/risk-tiers.js';
import type { CleanableItem, DetectedProject } from '../types.js';
import { BaseDetector, type DetectorContext } from './detector.js';

const MARKERS = ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'];

const PROJECT_DIRS = [
  { dir: '.gradle', description: 'Gradle project cache — regenerated on next build' },
  { dir: 'build', description: 'Android build output — regenerate with `./gradlew build`' },
];

export class AndroidDetector extends BaseDetector {
  readonly id = 'android';
  readonly displayName = 'Android';

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

  // ~/.gradle/caches is shared with pure-Java Gradle projects; JavaGradleDetector
  // owns it. Returning it here too caused a double-count in dogfood scans
  // (manhlx-vpt-01, 2026-04-22): both detectors reported the same 12.65 GB.
  override async scanGlobal(_ctx: DetectorContext): Promise<readonly CleanableItem[]> {
    return [];
  }
}
