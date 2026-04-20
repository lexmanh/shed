/**
 * NodeDetector — detects Node.js projects and their cleanable artifacts.
 *
 * Handles:
 * - Project-level: node_modules/, .next/, dist/, build/, .turbo/, .nuxt/
 * - Global: ~/.npm, ~/.yarn, ~/.pnpm-store, ~/.bun
 *
 * Risk classification:
 * - node_modules in git-clean project, age > 30d: Yellow
 * - node_modules in git-dirty project: blocked by SafetyChecker
 * - Global package manager caches: Green
 * - Lock files (package-lock.json, etc.): Red (never auto-delete)
 */

import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { RiskTier } from '../safety/risk-tiers.js';
import type { CleanableItem, DetectedProject } from '../types.js';
import { BaseDetector, type DetectorContext } from './detector.js';

export class NodeDetector extends BaseDetector {
  readonly id = 'node';
  readonly displayName = 'Node.js';

  async quickProbe(dir: string): Promise<boolean> {
    try {
      await access(join(dir, 'package.json'));
      return true;
    } catch {
      return false;
    }
  }

  async analyze(dir: string, _ctx: DetectorContext): Promise<DetectedProject | null> {
    const pkgJsonPath = join(dir, 'package.json');
    let pkgJson: { name?: string } = {};
    try {
      pkgJson = JSON.parse(await readFile(pkgJsonPath, 'utf-8')) as { name?: string };
    } catch {
      return null;
    }

    const items: CleanableItem[] = [];

    // node_modules
    const nodeModules = join(dir, 'node_modules');
    if (await this.dirExists(nodeModules)) {
      items.push({
        id: `${dir}::node_modules`,
        path: nodeModules,
        detector: this.id,
        risk: RiskTier.Yellow,
        sizeBytes: await this.computeSize(nodeModules),
        lastModified: await this.getLastModified(nodeModules),
        description: 'Installed npm packages — regenerate with `npm install`',
        projectRoot: dir,
      });
    }

    // TODO: .next, dist, build, .turbo, .nuxt, etc.
    // Implementation deferred — tests first.

    return {
      root: dir,
      type: 'node',
      name: pkgJson.name,
      lastModified: await this.getLastModified(dir),
      hasGit: await this.dirExists(join(dir, '.git')),
      items,
    };
  }

  override async scanGlobal(_ctx: DetectorContext): Promise<readonly CleanableItem[]> {
    // TODO: ~/.npm, ~/.yarn/cache, ~/.pnpm-store, ~/.bun caches
    return [];
  }

  private async dirExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }
}
