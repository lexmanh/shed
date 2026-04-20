/**
 * SafetyChecker — single enforcement point for all destructive operations.
 *
 * Per CLAUDE.md rule 1: NO destructive filesystem operation in Shed
 * may be performed outside this class. The CI safety-audit job greps
 * for violations.
 *
 * This is SAFETY-CRITICAL code. Tests MUST be written before implementation
 * (CLAUDE.md rule 3).
 */

import { execa } from 'execa';
import type {
  CleanableItem,
  ExecuteOptions,
  ExecuteResult,
  SafetyCheckResult,
  SafetyReason,
} from '../types.js';
import { DryRunViolation, SafetyViolationError } from '../errors.js';
import { RiskTier, TIER_POLICIES } from './risk-tiers.js';
import { isSacredPath } from './sacred-paths.js';

export interface SafetyCheckerOptions {
  /** Age threshold in days — items modified more recently are skipped */
  readonly recencyThresholdDays: number;
  /** Absolute size threshold for extra warning (bytes) */
  readonly sizeWarningBytes: number;
  /** Verify git state before touching paths inside repos */
  readonly gitAware: boolean;
  /** Check lsof/Get-Process before deletion */
  readonly processAware: boolean;
}

export const DEFAULT_SAFETY_OPTIONS: SafetyCheckerOptions = {
  recencyThresholdDays: 30,
  sizeWarningBytes: 10 * 1024 * 1024 * 1024,
  gitAware: true,
  processAware: true,
};

export class SafetyChecker {
  private readonly options: SafetyCheckerOptions;

  constructor(options: Partial<SafetyCheckerOptions> = {}) {
    this.options = { ...DEFAULT_SAFETY_OPTIONS, ...options };
  }

  // ---------------------------------------------------------------------------
  // Pre-flight checks — pure, side-effect-free (except read-only fs/git calls)
  // ---------------------------------------------------------------------------

  /**
   * Run all pre-flight safety checks on a single item.
   *
   * This is the entry point used before any destructive operation.
   * Returns an object describing whether the operation is allowed and
   * a list of reasons (info/warning/block severity).
   */
  async check(item: CleanableItem): Promise<SafetyCheckResult> {
    const reasons: SafetyReason[] = [];

    // 1. Sacred path guard (CLAUDE.md rule 4) — absolute block
    if (isSacredPath(item.path)) {
      return {
        allowed: false,
        reasons: [
          {
            code: 'sacred-path',
            severity: 'block',
            message: `${item.path} is a sacred path and cannot be touched.`,
            suggestion: 'This path is protected at the code level. See CLAUDE.md section 2 rule 4.',
          },
        ],
      };
    }

    // 2. Git awareness
    if (this.options.gitAware && item.projectRoot) {
      const gitCheck = await this.checkGitState(item.projectRoot);
      if (gitCheck) reasons.push(gitCheck);
    }

    // 3. Process awareness
    if (this.options.processAware) {
      const procCheck = await this.checkProcessHoldingPath(item.path);
      if (procCheck) reasons.push(procCheck);
    }

    // 4. Recency guard
    const recencyCheck = this.checkRecency(item);
    if (recencyCheck) reasons.push(recencyCheck);

    // 5. Size sanity
    const sizeCheck = this.checkSize(item);
    if (sizeCheck) reasons.push(sizeCheck);

    // 6. Tier opt-in (Red requires explicit inclusion)
    if (item.risk === RiskTier.Red) {
      reasons.push({
        code: 'unknown-project',
        severity: 'warning',
        message: 'Red-tier operation requires --include-red flag and per-item confirmation.',
      });
    }

    const blocked = reasons.some((r) => r.severity === 'block');
    return { allowed: !blocked, reasons };
  }

  // ---------------------------------------------------------------------------
  // Individual check implementations
  // ---------------------------------------------------------------------------

  /**
   * Check if a project directory has uncommitted changes.
   * Returns a SafetyReason if dirty, undefined if clean or not a git repo.
   *
   * TODO: implement with tests first.
   */
  private async checkGitState(projectRoot: string): Promise<SafetyReason | undefined> {
    try {
      const { stdout } = await execa('git', ['status', '--porcelain'], {
        cwd: projectRoot,
        reject: false,
      });
      if (stdout.trim().length > 0) {
        return {
          code: 'git-dirty',
          severity: 'block',
          message: `Git repo at ${projectRoot} has uncommitted changes.`,
          suggestion: 'Commit, stash, or discard changes before cleanup.',
        };
      }
      return undefined;
    } catch {
      // Not a git repo, or git not installed — not a blocker by itself
      return undefined;
    }
  }

  /**
   * Check if any process is currently holding a file within the path.
   * Uses `lsof` on Unix, `handle.exe` or similar on Windows.
   *
   * TODO: implement. This is platform-specific.
   */
  private async checkProcessHoldingPath(_path: string): Promise<SafetyReason | undefined> {
    // Stub: implement in Phase 0
    return undefined;
  }

  /**
   * Check if item was modified too recently.
   */
  private checkRecency(item: CleanableItem): SafetyReason | undefined {
    const ageDays = (Date.now() - item.lastModified) / (1000 * 60 * 60 * 24);
    if (ageDays < this.options.recencyThresholdDays) {
      return {
        code: 'recent-modification',
        severity: 'warning',
        message: `Modified ${Math.floor(ageDays)} days ago (threshold: ${this.options.recencyThresholdDays}).`,
        suggestion: `Use --max-age ${Math.floor(ageDays)} to override, or wait.`,
      };
    }
    return undefined;
  }

  /**
   * Check if size exceeds warning threshold.
   */
  private checkSize(item: CleanableItem): SafetyReason | undefined {
    const policy = TIER_POLICIES[item.risk];
    if (item.sizeBytes > policy.sizeWarningThreshold) {
      return {
        code: 'size-exceeds-threshold',
        severity: 'warning',
        message: `Large operation: ${formatBytes(item.sizeBytes)} will be freed.`,
      };
    }
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Execution — the ONLY place destructive calls should happen
  // ---------------------------------------------------------------------------

  /**
   * Execute a cleanup plan for multiple items.
   *
   * Respects dryRun, hardDelete, includeRed flags.
   * Each item is re-checked at execution time (TOCTOU mitigation).
   *
   * TODO: implement actual deletion via `trash` package (soft) or
   * `fs.rm` (hard). Full implementation deferred to Phase 1.
   */
  async execute(
    items: readonly CleanableItem[],
    options: ExecuteOptions,
  ): Promise<ExecuteResult> {
    const succeeded: CleanableItem[] = [];
    const skipped: { item: CleanableItem; reason: string }[] = [];
    const failed: { item: CleanableItem; error: string }[] = [];
    let totalBytesFreed = 0;

    for (const item of items) {
      // Re-check at execution time (files may have changed since planning)
      const check = await this.check(item);

      if (!check.allowed) {
        skipped.push({
          item,
          reason: check.reasons.map((r) => r.message).join('; '),
        });
        continue;
      }

      if (item.risk === RiskTier.Red && !options.includeRed) {
        skipped.push({ item, reason: 'Red-tier excluded (no --include-red flag)' });
        continue;
      }

      if (item.risk === RiskTier.Red && options.confirm) {
        const confirmed = await options.confirm(item);
        if (!confirmed) {
          skipped.push({ item, reason: 'User declined confirmation' });
          continue;
        }
      }

      if (options.dryRun) {
        // Dry run: log what would happen but don't touch filesystem
        succeeded.push(item);
        totalBytesFreed += item.sizeBytes;
        continue;
      }

      try {
        await this.performDelete(item.path, options.hardDelete);
        succeeded.push(item);
        totalBytesFreed += item.sizeBytes;
      } catch (err) {
        failed.push({
          item,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { succeeded, skipped, failed, totalBytesFreed };
  }

  /**
   * The ONE place where Shed performs actual deletion.
   * CLAUDE.md rule 1: no other code may call fs.rm or rimraf directly.
   *
   * TODO: implement with `trash` package (soft) and `fs.rm` (hard).
   * Implementation deferred — write tests first.
   */
  private async performDelete(path: string, hardDelete: boolean): Promise<void> {
    if (hardDelete) {
      // await fs.rm(path, { recursive: true, force: true });
      throw new DryRunViolation(`Hard delete not yet implemented: ${path}`);
    } else {
      // const { default: trash } = await import('trash');
      // await trash(path);
      throw new DryRunViolation(`Trash deletion not yet implemented: ${path}`);
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// Re-export for test access
export { SafetyViolationError };
