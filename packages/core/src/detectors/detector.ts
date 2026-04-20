/**
 * ProjectDetector — plugin interface for detecting project types.
 *
 * Each runtime/tool (Node, Python, Rust, Docker, Xcode, ...) has its own
 * detector implementation. Detectors are registered in `index.ts` and
 * invoked by the scanner.
 *
 * Detectors MUST be pure — no side effects beyond read-only filesystem
 * and subprocess calls. All destructive operations go through SafetyChecker.
 */

import type { CleanableItem, DetectedProject } from '../types.js';

export interface DetectorContext {
  /** Root directory being scanned */
  readonly scanRoot: string;
  /** User-specified max depth for filesystem traversal */
  readonly maxDepth: number;
  /** Signal for cancellation */
  readonly signal?: AbortSignal;
}

export interface ProjectDetector {
  /** Stable identifier, e.g. "node", "python", "xcode" */
  readonly id: string;

  /** Human-readable name, e.g. "Node.js" */
  readonly displayName: string;

  /**
   * Quickly check if a given directory might be a project this detector handles.
   * Should be cheap — typically just `fs.access(path + '/package.json')`.
   */
  quickProbe(dir: string): Promise<boolean>;

  /**
   * Full analysis of a directory believed to be a project.
   * Returns null if the directory is not actually a project this detector handles.
   */
  analyze(dir: string, ctx: DetectorContext): Promise<DetectedProject | null>;

  /**
   * Scan for global/system-level cleanable items not tied to a project.
   * Examples: ~/.npm cache, Docker dangling images, Homebrew cleanup.
   * Called once per scan, separately from project analysis.
   */
  scanGlobal(ctx: DetectorContext): Promise<readonly CleanableItem[]>;
}

/**
 * Base class providing common utilities for detectors.
 * Detectors can extend this or implement ProjectDetector directly.
 */
export abstract class BaseDetector implements ProjectDetector {
  abstract readonly id: string;
  abstract readonly displayName: string;
  abstract quickProbe(dir: string): Promise<boolean>;
  abstract analyze(dir: string, ctx: DetectorContext): Promise<DetectedProject | null>;

  async scanGlobal(_ctx: DetectorContext): Promise<readonly CleanableItem[]> {
    return [];
  }

  /**
   * Compute directory size in bytes.
   * Uses `du` on Unix, native recursion on Windows.
   *
   * TODO: implement efficiently — this is called frequently.
   */
  protected async computeSize(_path: string): Promise<number> {
    return 0; // stub
  }

  /**
   * Get last-modified timestamp of the most recently changed file in a directory.
   */
  protected async getLastModified(_path: string): Promise<number> {
    return Date.now(); // stub
  }
}
