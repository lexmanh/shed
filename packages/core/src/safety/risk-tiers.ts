/**
 * Risk tier classification for cleanup operations.
 *
 * Every cleanable item is assigned a tier. Tiers determine default
 * behavior, confirmation requirements, and whether `--include-red`
 * flag is needed.
 *
 * See CLAUDE.md section 2 for the non-negotiable rules around these tiers.
 */

export const RiskTier = {
  /** Regeneratable caches, no user data. Safe to delete with bulk confirmation. */
  Green: 'green',
  /** Context-dependent. Requires safety checks (git, process, age) before deletion. */
  Yellow: 'yellow',
  /** Stateful or semi-permanent data. Opt-in via --include-red flag AND per-item confirmation. */
  Red: 'red',
} as const;

export type RiskTier = (typeof RiskTier)[keyof typeof RiskTier];

export interface TierPolicy {
  /** Can run non-interactively (for CI / --yes mode)? */
  readonly allowNonInteractive: boolean;
  /** Default: move to Trash vs. hard delete */
  readonly defaultToTrash: boolean;
  /** Requires explicit flag to even show in results */
  readonly requiresOptIn: boolean;
  /** Requires per-item confirmation when interactive */
  readonly perItemConfirmation: boolean;
  /** Maximum size per operation before extra warning (bytes) */
  readonly sizeWarningThreshold: number;
}

export const TIER_POLICIES: Record<RiskTier, TierPolicy> = {
  [RiskTier.Green]: {
    allowNonInteractive: true,
    defaultToTrash: true,
    requiresOptIn: false,
    perItemConfirmation: false,
    sizeWarningThreshold: 10 * 1024 * 1024 * 1024, // 10GB
  },
  [RiskTier.Yellow]: {
    allowNonInteractive: false,
    defaultToTrash: true,
    requiresOptIn: false,
    perItemConfirmation: false,
    sizeWarningThreshold: 5 * 1024 * 1024 * 1024, // 5GB
  },
  [RiskTier.Red]: {
    allowNonInteractive: false,
    defaultToTrash: true,
    requiresOptIn: true,
    perItemConfirmation: true,
    sizeWarningThreshold: 1 * 1024 * 1024 * 1024, // 1GB
  },
};

/**
 * Examples of path patterns and their tier assignments.
 * Used for documentation and as reference for detectors.
 *
 * DO NOT use this as a lookup table for actual classification —
 * each detector is responsible for classifying its own items with
 * context-aware logic (e.g., node_modules in a git-dirty repo is
 * higher risk than one with no git).
 */
export const TIER_EXAMPLES = {
  green: [
    '~/.npm',
    '~/.cache/pip',
    '~/.cargo/registry/cache',
    'Docker dangling images',
    '~/Library/Caches/Homebrew',
  ],
  yellow: [
    'project/node_modules (age > 30d, git clean)',
    'project/target (Rust, git clean)',
    'project/venv (not active)',
    'project/.dart_tool',
  ],
  red: [
    '~/Library/Developer/CoreSimulator/Devices (contains user data)',
    '~/Library/Developer/Xcode/Archives (release builds)',
    'package-lock.json (tracked by git)',
    'System logs',
    'Time Machine local snapshots',
  ],
} as const;
