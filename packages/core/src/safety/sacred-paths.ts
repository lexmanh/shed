/**
 * Sacred paths — NEVER touched by Shed, regardless of flags.
 *
 * This list is CODE-LEVEL, not config-level. Users cannot override.
 * Adding to this list requires approval from maintainer (see CLAUDE.md rule 5).
 *
 * Patterns support `~` expansion and glob-like wildcards.
 */

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
 * Check if a given absolute path matches any sacred path pattern.
 *
 * @returns `true` if the path should NEVER be touched.
 */
export function isSacredPath(absolutePath: string): boolean {
  const normalized = resolve(absolutePath);
  const allSacred = [...SACRED_USER_PATHS, ...SACRED_SYSTEM_PATHS].map(expandHome);

  for (const sacred of allSacred) {
    const resolvedSacred = resolve(sacred);
    if (normalized === resolvedSacred) return true;
    // Check if path is inside a sacred directory
    if (normalized.startsWith(resolvedSacred + sep)) return true;
  }

  return false;
}

/**
 * Check if a path within a project matches a sacred project pattern.
 */
export function isSacredProjectFile(relativePath: string): boolean {
  // TODO: implement glob matching against SACRED_PROJECT_PATTERNS
  // This function is a stub — implement with tests first (see CLAUDE.md rule 3)
  throw new Error('isSacredProjectFile not yet implemented — see CLAUDE.md rule 3');
}
