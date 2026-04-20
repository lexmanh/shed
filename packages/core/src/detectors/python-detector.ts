/**
 * PythonDetector — detects Python projects and their cleanable artifacts.
 *
 * Handles:
 * - Project-level: venv/, .venv/, env/, __pycache__/, .pytest_cache/,
 *   .mypy_cache/, .ruff_cache/, *.egg-info/
 * - Global: ~/.cache/pip, ~/Library/Caches/pip (macOS), poetry cache
 *
 * Risk classification:
 * - Virtual envs / build artifacts: Yellow
 * - Global pip/poetry caches: Green
 */

import { access, readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { gitStatusPorcelain } from '../safety/git.js';
import { RiskTier } from '../safety/risk-tiers.js';
import type { CleanableItem, DetectedProject } from '../types.js';
import { BaseDetector, type DetectorContext } from './detector.js';

/** Files whose presence indicates a Python project. */
const MARKERS = ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt'];

const VENV_DIRS = [
  { dir: 'venv', description: 'Python virtual environment — recreate with `python -m venv venv`' },
  {
    dir: '.venv',
    description: 'Python virtual environment — recreate with `python -m venv .venv`',
  },
  { dir: 'env', description: 'Python virtual environment — recreate with `python -m venv env`' },
];

const CACHE_DIRS = [
  { dir: '__pycache__', description: 'Python bytecode cache — regenerated automatically' },
  { dir: '.pytest_cache', description: 'pytest cache — regenerated on next test run' },
  { dir: '.mypy_cache', description: 'mypy type-check cache — regenerated automatically' },
  { dir: '.ruff_cache', description: 'Ruff linter cache — regenerated automatically' },
];

export interface PythonDetectorOptions {
  readonly homeDir?: string;
}

export class PythonDetector extends BaseDetector {
  readonly id = 'python';
  readonly displayName = 'Python';

  private readonly homeDir: string;

  constructor(options: PythonDetectorOptions = {}) {
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
    const hasMarker = await this.quickProbe(dir);
    if (!hasMarker) return null;

    const name = await this.readProjectName(dir);
    const items: CleanableItem[] = [];

    for (const { dir: venvDir, description } of VENV_DIRS) {
      const venvPath = join(dir, venvDir);
      if (await this.dirExists(venvPath)) {
        items.push({
          id: `${dir}::${venvDir}`,
          path: venvPath,
          detector: this.id,
          risk: RiskTier.Yellow,
          sizeBytes: await this.computeSize(venvPath),
          lastModified: await this.getLastModified(venvPath),
          description,
          projectRoot: dir,
        });
      }
    }

    for (const { dir: cacheDir, description } of CACHE_DIRS) {
      const cachePath = join(dir, cacheDir);
      if (await this.dirExists(cachePath)) {
        items.push({
          id: `${dir}::${cacheDir}`,
          path: cachePath,
          detector: this.id,
          risk: RiskTier.Yellow,
          sizeBytes: await this.computeSize(cachePath),
          lastModified: await this.getLastModified(cachePath),
          description,
          projectRoot: dir,
        });
      }
    }

    // *.egg-info directories
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.endsWith('.egg-info')) {
          const eggPath = join(dir, entry.name);
          items.push({
            id: `${dir}::${entry.name}`,
            path: eggPath,
            detector: this.id,
            risk: RiskTier.Yellow,
            sizeBytes: await this.computeSize(eggPath),
            lastModified: await this.getLastModified(eggPath),
            description: 'Egg build metadata — regenerate with `pip install -e .`',
            projectRoot: dir,
          });
        }
      }
    } catch {
      /* skip on read error */
    }

    const hasGit = await this.dirExists(join(dir, '.git'));
    let gitClean: boolean | undefined;
    if (hasGit) {
      const porcelain = await gitStatusPorcelain(dir);
      gitClean = porcelain !== null ? porcelain.trim() === '' : undefined;
    }

    return {
      root: dir,
      type: 'python',
      name,
      lastModified: await this.getLastModified(dir),
      hasGit,
      gitClean,
      items,
    };
  }

  override async scanGlobal(_ctx: DetectorContext): Promise<readonly CleanableItem[]> {
    const items: CleanableItem[] = [];

    const globalCaches = this.getGlobalCachePaths();
    for (const { cachePath, description } of globalCaches) {
      if (await this.dirExists(cachePath)) {
        items.push({
          id: `global::python::${cachePath}`,
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

  private getGlobalCachePaths(): ReadonlyArray<{ cachePath: string; description: string }> {
    const result: Array<{ cachePath: string; description: string }> = [
      {
        cachePath: join(this.homeDir, '.cache', 'pip'),
        description: 'pip download cache — regenerated automatically',
      },
    ];

    if (process.platform === 'darwin') {
      result.push({
        cachePath: join(this.homeDir, 'Library', 'Caches', 'pip'),
        description: 'pip download cache (macOS) — regenerated automatically',
      });
    }

    // Poetry cache
    const poetryCache =
      process.platform === 'darwin'
        ? join(this.homeDir, 'Library', 'Caches', 'pypoetry')
        : join(this.homeDir, '.cache', 'pypoetry');
    result.push({
      cachePath: poetryCache,
      description: 'Poetry package cache — regenerated automatically',
    });

    return result;
  }

  private async readProjectName(dir: string): Promise<string | undefined> {
    try {
      const content = await readFile(join(dir, 'pyproject.toml'), 'utf-8');
      const match = /^\[project\][\s\S]*?^name\s*=\s*["']?([^"'\n]+)["']?/m.exec(content);
      return match?.[1]?.trim() || undefined;
    } catch {
      return undefined;
    }
  }
}
