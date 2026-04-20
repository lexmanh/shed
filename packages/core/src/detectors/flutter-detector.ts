/**
 * FlutterDetector — detects Flutter/Dart projects and their cleanable artifacts.
 *
 * Handles:
 * - Project-level: build/, .dart_tool/
 * - Global: ~/.pub-cache (Dart package cache), ~/.fvm/versions (FVM SDK cache)
 *
 * Risk classification:
 * - build/, .dart_tool/: Yellow — regenerate with `flutter build` / `flutter pub get`
 * - ~/.pub-cache, ~/.fvm/versions: Green — re-downloaded automatically
 */

import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { RiskTier } from '../safety/risk-tiers.js';
import type { CleanableItem, DetectedProject } from '../types.js';
import { BaseDetector, type DetectorContext } from './detector.js';

const BUILD_DIRS = [
  { dir: 'build', description: 'Flutter build output — regenerate with `flutter build`' },
  { dir: '.dart_tool', description: 'Dart tool cache — regenerate with `flutter pub get`' },
];

export interface FlutterDetectorOptions {
  readonly homeDir?: string;
}

export class FlutterDetector extends BaseDetector {
  readonly id = 'flutter';
  readonly displayName = 'Flutter';

  private readonly homeDir: string;

  constructor(options: FlutterDetectorOptions = {}) {
    super();
    this.homeDir = options.homeDir ?? homedir();
  }

  async quickProbe(dir: string): Promise<boolean> {
    try {
      await access(join(dir, 'pubspec.yaml'));
      return true;
    } catch {
      return false;
    }
  }

  async analyze(dir: string, _ctx: DetectorContext): Promise<DetectedProject | null> {
    if (!(await this.quickProbe(dir))) return null;

    const name = await this.readPubspecName(dir);
    const items: CleanableItem[] = [];

    for (const { dir: buildDir, description } of BUILD_DIRS) {
      const buildPath = join(dir, buildDir);
      if (await this.dirExists(buildPath)) {
        items.push({
          id: `${dir}::${buildDir}`,
          path: buildPath,
          detector: this.id,
          risk: RiskTier.Yellow,
          sizeBytes: await this.computeSize(buildPath),
          lastModified: await this.getLastModified(buildPath),
          description,
          projectRoot: dir,
        });
      }
    }

    return {
      root: dir,
      type: 'flutter',
      name,
      lastModified: await this.getLastModified(dir),
      hasGit: await this.dirExists(join(dir, '.git')),
      items,
    };
  }

  override async scanGlobal(_ctx: DetectorContext): Promise<readonly CleanableItem[]> {
    const items: CleanableItem[] = [];

    const caches = [
      {
        cachePath: join(this.homeDir, '.pub-cache'),
        description: 'Dart pub package cache — re-downloaded automatically',
      },
      {
        cachePath: join(this.homeDir, '.fvm', 'versions'),
        description: 'FVM Flutter SDK versions — reinstall with `fvm install`',
      },
    ];

    for (const { cachePath, description } of caches) {
      if (await this.dirExists(cachePath)) {
        items.push({
          id: `global::flutter::${cachePath}`,
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

  private async readPubspecName(dir: string): Promise<string | undefined> {
    try {
      const content = await readFile(join(dir, 'pubspec.yaml'), 'utf-8');
      const match = /^name:\s*(\S+)/m.exec(content);
      return match?.[1]?.trim();
    } catch {
      return undefined;
    }
  }
}
