/**
 * Sacred paths — NEVER touched by Shed, regardless of flags.
 *
 * This list is CODE-LEVEL, not config-level. Users cannot override.
 * Adding to this list requires approval from maintainer (see CLAUDE.md rule 5).
 *
 * Patterns support `~` expansion and glob-like wildcards.
 */

import { realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, sep } from 'node:path';

/** Absolute path patterns that are always off-limits. */
export const SACRED_USER_PATHS = [
  '~/.ssh',
  '~/.gnupg',
  '~/.aws',
  '~/.kube',
  '~/.docker/config.json',
  '~/.git',
  '~/.gitconfig',
  '~/.netrc',
  '~/.pgpass',
  '~/.config/gcloud',
  '~/.1password',
  '~/.keychain',
] as const;

/** System paths that are always off-limits. */
export const SACRED_SYSTEM_PATHS = [
  '/etc',
  '/boot',
  '/System',
  '/Library/Keychains',
  '/private/var/db',
  '/usr/local/etc',
  'C:\\Windows',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\ProgramData',
] as const;

/** Patterns inside a project that are always off-limits. */
export const SACRED_PROJECT_PATTERNS = [
  '.git',
  '.env',
  '.env.local',
  '.env.production',
  'secrets',
  'credentials.json',
  'service-account.json',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  'id_rsa*',
] as const;

/**
 * Expand `~` in a path to the user's home directory.
 */
export function expandHome(path: string): string {
  if (path === '~' || path.startsWith(`~${sep}`) || path.startsWith('~/')) {
    return resolve(homedir(), path.slice(2));
  }
  return path;
}

/**
 * Detect Windows-style drive-letter paths (e.g. `C:\Windows`, `c:/Program Files`).
 * Used so the sacred check works for Windows patterns even when the
 * test suite runs on Unix.
 */
function isWindowsStylePath(path: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(path);
}

function normalizeWindows(path: string): string {
  return path.toLowerCase().replace(/\//g, '\\');
}

function matchesWindowsSacred(path: string): boolean {
  const normalized = normalizeWindows(path);
  for (const sacred of SACRED_SYSTEM_PATHS) {
    if (!isWindowsStylePath(sacred)) continue;
    const sacredNorm = normalizeWindows(sacred);
    if (normalized === sacredNorm) return true;
    if (normalized.startsWith(`${sacredNorm}\\`)) return true;
  }
  return false;
}

/**
 * Check if a given absolute path matches any sacred path pattern.
 *
 * This is a synchronous string/path match — it does NOT resolve
 * symlinks. Use {@link isSacredPathResolved} when the caller wants
 * symlink-following behavior (e.g., macOS `/etc` → `/private/etc`).
 *
 * @returns `true` if the path should NEVER be touched.
 */
export function isSacredPath(absolutePath: string): boolean {
  if (isWindowsStylePath(absolutePath)) {
    // Check Windows system paths (C:\Windows, C:\Program Files, etc.)
    if (matchesWindowsSacred(absolutePath)) return true;
    // Also check user sacred paths expanded to the Windows home directory
    // (e.g. ~/.ssh → C:\Users\runneradmin\.ssh)
    const normalizedInput = normalizeWindows(absolutePath);
    for (const p of SACRED_USER_PATHS) {
      const expanded = expandHome(p);
      if (!isWindowsStylePath(expanded)) continue;
      const norm = normalizeWindows(expanded);
      if (normalizedInput === norm) return true;
      if (normalizedInput.startsWith(`${norm}\\`)) return true;
    }
    return false;
  }

  const normalized = resolve(absolutePath);
  const posixSacred = [
    ...SACRED_USER_PATHS,
    ...SACRED_SYSTEM_PATHS.filter((p) => !isWindowsStylePath(p)),
  ].map(expandHome);

  for (const sacred of posixSacred) {
    const resolvedSacred = resolve(sacred);
    if (normalized === resolvedSacred) return true;
    if (normalized.startsWith(resolvedSacred + sep)) return true;
  }

  return false;
}

let cachedResolvedSacred: readonly string[] | null = null;

async function getResolvedSacredPaths(): Promise<readonly string[]> {
  if (cachedResolvedSacred) return cachedResolvedSacred;
  const posix = [
    ...SACRED_USER_PATHS,
    ...SACRED_SYSTEM_PATHS.filter((p) => !isWindowsStylePath(p)),
  ].map(expandHome);
  const resolved: string[] = [];
  for (const p of posix) {
    const abs = resolve(p);
    resolved.push(abs);
    try {
      const real = await realpath(abs);
      if (real !== abs) resolved.push(real);
    } catch {
      // Path doesn't exist on this host — keep the string-level entry only.
    }
  }
  cachedResolvedSacred = resolved;
  return resolved;
}

/**
 * Symlink-aware sacred check.
 *
 * In addition to the synchronous string match of {@link isSacredPath},
 * this version compares against the `realpath` of each sacred directory,
 * so paths that resolve into a sacred location are caught even when
 * the sacred directory is itself a symlink (common on macOS where
 * `/etc` links to `/private/etc`).
 *
 * Callers typically run this twice: once with the original path and
 * once with {@link resolveToRealPath}(path), to cover both directions.
 */
export async function isSacredPathResolved(absolutePath: string): Promise<boolean> {
  if (isSacredPath(absolutePath)) return true;
  // Windows paths are fully handled by the sync isSacredPath above.
  // Skip the async realpath check to avoid cross-platform path confusion.
  if (isWindowsStylePath(absolutePath)) return false;
  const normalized = resolve(absolutePath);
  const sacred = await getResolvedSacredPaths();
  for (const s of sacred) {
    if (normalized === s) return true;
    if (normalized.startsWith(s + sep)) return true;
  }
  return false;
}

/**
 * Resolve a path through any symlinks to its real filesystem target.
 *
 * If the path does not exist or cannot be resolved (permissions,
 * broken symlink), returns the original string so callers can still
 * apply name-based sacred checks without needing to handle errors.
 */
export async function resolveToRealPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return path;
  }
}

/**
 * Check if a path within a project matches a sacred project pattern.
 */
export function isSacredProjectFile(_relativePath: string): boolean {
  // TODO: implement glob matching against SACRED_PROJECT_PATTERNS
  // This function is a stub — implement with tests first (see CLAUDE.md rule 3)
  throw new Error('isSacredProjectFile not yet implemented — see CLAUDE.md rule 3');
}
