/**
 * NodeDetector — detects Node.js projects and their cleanable artifacts.
 *
 * Handles:
 * - Project-level: node_modules/, .next/, dist/, build/, .turbo/, .nuxt/,
 *   out/, .svelte-kit/, .parcel-cache/
 * - Global: ~/.npm, ~/.yarn/cache, ~/.pnpm-store, ~/.bun
 *
 * Risk classification:
 * - node_modules / build dirs: Yellow
 * - Global package manager caches: Green
 * - Lock files: never auto-deleted (CLAUDE.md rule 4)
 */

import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { gitStatusPorcelain } from '../safety/git.js';
import { RiskTier } from '../safety/risk-tiers.js';
import type { CleanableItem, DetectedProject } from '../types.js';
import { BaseDetector, type DetectorContext } from './detector.js';

const BUILD_DIRS: ReadonlyArray<{ dir: string; description: string }> = [
  { dir: '.next', description: 'Next.js build output — regenerate with `next build`' },
  { dir: '.nuxt', description: 'Nuxt.js build output — regenerate with `nuxt build`' },
  { dir: '.turbo', description: 'Turborepo cache — regenerate on next build' },
  { dir: 'dist', description: 'Build output — regenerate with build script' },
  { dir: 'build', description: 'Build output — regenerate with build script' },
  { dir: 'out', description: 'Build output — regenerate with build script' },
  { dir: '.svelte-kit', description: 'SvelteKit build output — regenerate with `vite build`' },
  { dir: '.parcel-cache', description: 'Parcel cache — regenerate on next build' },
];

const GLOBAL_CACHES: ReadonlyArray<{ subpath: string; description: string }> = [
  { subpath: '.npm', description: 'npm global cache — regenerate automatically' },
  { subpath: join('.yarn', 'cache'), description: 'Yarn cache — regenerate automatically' },
  { subpath: '.pnpm-store', description: 'pnpm store — regenerate automatically' },
  { subpath: '.bun', description: 'Bun cache — regenerate automatically' },
];

export interface NodeDetectorOptions {
  /** Override home directory for testability. Defaults to os.homedir(). */
  readonly homeDir?: string;
}

export class NodeDetector extends BaseDetector {
  readonly id = 'node';
  readonly displayName = 'Node.js';

  private readonly homeDir: string;

  constructor(options: NodeDetectorOptions = {}) {
    super();
    this.homeDir = options.homeDir ?? homedir();
  }

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
    let pkgJson: { name?: string; workspaces?: unknown } = {};
    try {
      pkgJson = JSON.parse(await readFile(pkgJsonPath, 'utf-8')) as { name?: string; workspaces?: unknown };
    } catch {
      return null;
    }

    const items: CleanableItem[] = [];

    // node_modules
    const nodeModulesPath = join(dir, 'node_modules');
    if (await this.dirExists(nodeModulesPath)) {
      const isWorkspaceRoot = await this.detectWorkspaceRoot(dir, pkgJson);
      const description = isWorkspaceRoot
        ? 'Installed npm packages (workspace root) — all packages will need reinstall with `npm install`'
        : 'Installed npm packages — regenerate with `npm install`';
      items.push({
        id: `${dir}::node_modules`,
        path: nodeModulesPath,
        detector: this.id,
        risk: RiskTier.Yellow,
        sizeBytes: await this.computeSize(nodeModulesPath),
        lastModified: await this.getLastModified(nodeModulesPath),
        description,
        projectRoot: dir,
      });
    }

    // Build output directories
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

    const hasGit = await this.dirExists(join(dir, '.git'));
    let gitClean: boolean | undefined;
    if (hasGit) {
      const porcelain = await gitStatusPorcelain(dir);
      gitClean = porcelain !== null ? porcelain.trim() === '' : undefined;
    }

    return {
      root: dir,
      type: 'node',
      name: pkgJson.name,
      lastModified: await this.getLastModified(dir),
      hasGit,
      gitClean,
      items,
    };
  }

  private async detectWorkspaceRoot(
    dir: string,
    pkgJson: { workspaces?: unknown },
  ): Promise<boolean> {
    if (pkgJson.workspaces) return true;
    for (const marker of ['pnpm-workspace.yaml', 'nx.json', 'turbo.json']) {
      try {
        await access(join(dir, marker));
        return true;
      } catch {
        /* not found */
      }
    }
    return false;
  }

  override async scanGlobal(_ctx: DetectorContext): Promise<readonly CleanableItem[]> {
    const items: CleanableItem[] = [];

    for (const { subpath, description } of GLOBAL_CACHES) {
      const cachePath = join(this.homeDir, subpath);
      if (await this.dirExists(cachePath)) {
        items.push({
          id: `global::node::${subpath}`,
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
