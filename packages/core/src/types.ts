/**
 * Shared types for @lxmanh/shed-core.
 */

import type { RiskTier } from './safety/risk-tiers.js';

/**
 * A cleanable artifact found by a detector.
 * Examples: a node_modules directory, a Docker dangling image, an Xcode DerivedData folder.
 */
export interface CleanableItem {
  /** Stable identifier for this item */
  readonly id: string;
  /** Absolute path to the artifact */
  readonly path: string;
  /** Which detector found this item */
  readonly detector: string;
  /** Risk classification */
  readonly risk: RiskTier;
  /** Size in bytes (may be estimated) */
  readonly sizeBytes: number;
  /** Last-modified timestamp (ms since epoch) */
  readonly lastModified: number;
  /** Human-readable description */
  readonly description: string;
  /** Optional: related project root (if this item belongs to a project) */
  readonly projectRoot?: string;
  /** Detector-specific metadata */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * A project detected on the filesystem.
 * Projects can have multiple CleanableItems associated with them.
 */
export interface DetectedProject {
  readonly root: string;
  readonly type: ProjectType;
  readonly name?: string;
  readonly lastModified: number;
  readonly hasGit: boolean;
  readonly gitClean?: boolean;
  readonly packageManager?: string;
  readonly items: readonly CleanableItem[];
}

export type ProjectType =
  | 'node'
  | 'python'
  | 'rust'
  | 'go'
  | 'ruby'
  | 'flutter'
  | 'xcode'
  | 'android'
  | 'java-maven'
  | 'java-gradle'
  | 'dotnet'
  | 'docker'
  | 'unknown';

/**
 * Result of a safety pre-flight check for a single item.
 */
export interface SafetyCheckResult {
  readonly allowed: boolean;
  readonly reasons: readonly SafetyReason[];
}

export interface SafetyReason {
  readonly code: SafetyCode;
  readonly severity: 'info' | 'warning' | 'block';
  readonly message: string;
  readonly suggestion?: string;
}

export type SafetyCode =
  | 'git-dirty'
  | 'git-untracked'
  | 'process-holding-file'
  | 'recent-modification'
  | 'sacred-path'
  | 'lockfile-tracked'
  | 'size-exceeds-threshold'
  | 'symlink-escape'
  | 'permission-denied'
  | 'unknown-project';

/**
 * Options for a cleanup execution.
 */
export interface ExecuteOptions {
  /** If true, only log what would be done — don't actually delete */
  readonly dryRun: boolean;
  /** If true, hard-delete instead of moving to Trash */
  readonly hardDelete: boolean;
  /** If true, allow Red-tier operations */
  readonly includeRed: boolean;
  /** User-supplied confirmation callback for destructive ops */
  readonly confirm?: (item: CleanableItem) => Promise<boolean>;
}

/**
 * Result of executing a cleanup plan.
 */
export interface ExecuteResult {
  readonly succeeded: readonly CleanableItem[];
  readonly skipped: readonly { item: CleanableItem; reason: string }[];
  readonly failed: readonly { item: CleanableItem; error: string }[];
  readonly totalBytesFreed: number;
}
