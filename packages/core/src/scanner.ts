/**
 * Scanner — walks a directory tree and delegates to registered detectors.
 *
 * Algorithm:
 * 1. BFS from rootDir up to maxDepth.
 * 2. At each directory, run all detectors' quickProbe in parallel.
 * 3. For each probe hit, run analyze; collect DetectedProject.
 * 4. Do NOT recurse into a directory that was detected (avoids scanning
 *    node_modules/ contents, etc.).
 * 5. Always skip well-known noise dirs: node_modules, .git, .svn, target,
 *    venv, .venv, env, __pycache__, dist, build.
 */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProjectDetector } from './detectors/detector.js';
import type { CleanableItem, DetectedProject } from './types.js';

export interface ScanOptions {
  readonly maxDepth?: number;
  readonly signal?: AbortSignal;
}

/** Directory names that are never recursed into during filesystem walk. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'target',
  'venv',
  '.venv',
  'env',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.next',
  '.nuxt',
  '.turbo',
  'dist',
  'build',
  'out',
  '.svelte-kit',
  '.parcel-cache',
  '.dart_tool',
  '.gradle',
]);

export class Scanner {
  private readonly detectors: readonly ProjectDetector[];

  constructor(detectors: readonly ProjectDetector[]) {
    this.detectors = detectors;
  }

  /**
   * Walk rootDir and return all detected projects.
   */
  async scan(rootDir: string, opts: ScanOptions = {}): Promise<readonly DetectedProject[]> {
    const maxDepth = opts.maxDepth ?? 8;
    const signal = opts.signal;
    const results: DetectedProject[] = [];

    // BFS queue: [dir, depth]
    const queue: Array<[string, number]> = [[rootDir, 0]];

    while (queue.length > 0) {
      if (signal?.aborted) break;
      const entry = queue.shift();
      if (!entry) break;
      const [dir, depth] = entry;

      // Run all detectors' quickProbe in parallel
      const probeResults = await Promise.all(
        this.detectors.map(async (d) => ({ detector: d, hit: await d.quickProbe(dir) })),
      );

      const hittingDetectors = probeResults.filter((r) => r.hit).map((r) => r.detector);

      if (hittingDetectors.length > 0) {
        // Analyze with all hitting detectors — don't recurse into this dir
        const ctx = { scanRoot: rootDir, maxDepth, signal };
        const analyses = await Promise.all(hittingDetectors.map((d) => d.analyze(dir, ctx)));
        for (const project of analyses) {
          if (project !== null) results.push(project);
        }
        // Do not recurse into a detected project root
        continue;
      }

      // No detector matched — recurse into subdirs (if within depth limit)
      if (depth >= maxDepth) continue;

      try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          if (!e.isDirectory()) continue;
          if (SKIP_DIRS.has(e.name)) continue;
          queue.push([join(dir, e.name), depth + 1]);
        }
      } catch {
        /* permission denied or broken symlink — skip */
      }
    }

    return results;
  }

  /**
   * Collect global (non-project) cleanable items from all detectors.
   */
  async scanGlobal(ctx: { scanRoot: string; maxDepth: number; signal?: AbortSignal }): Promise<
    readonly CleanableItem[]
  > {
    const allItems = await Promise.all(this.detectors.map((d) => d.scanGlobal(ctx)));
    return allItems.flat();
  }
}
