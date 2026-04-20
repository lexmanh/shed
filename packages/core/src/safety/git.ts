/**
 * Git state helpers used by the safety layer.
 *
 * Split into its own module so tests can mock it cleanly via
 * `vi.mock('./git.js')` without mocking all of `execa`.
 */

import { execa } from 'execa';

/**
 * Run `git status --porcelain` in `cwd` and return its stdout.
 *
 * Returns `null` if:
 *   - `cwd` is not inside a git repo (git exits non-zero with no stdout)
 *   - `git` binary is not installed (execa throws ENOENT)
 *   - `cwd` does not exist or is not readable
 *
 * Never throws — all failures are mapped to `null` so callers can
 * treat "no git info" uniformly.
 */
/**
 * Returns true if `path` contains any git-tracked files.
 * Gitignored paths (node_modules, build/, target/, etc.) return false.
 *
 * Uses `git ls-files` which respects .gitignore — if the path is fully
 * ignored, stdout will be empty and we return false (safe to delete).
 */
export async function gitHasTrackedFiles(itemPath: string, cwd: string): Promise<boolean> {
  try {
    const { stdout, exitCode } = await execa(
      'git',
      ['ls-files', '--error-unmatch', '--', itemPath],
      { cwd, reject: false, timeout: 5000 },
    );
    if (exitCode === 0 && stdout.trim().length > 0) return true;
    // ls-files with a directory: check if any tracked files exist inside
    const { stdout: lsOut, exitCode: lsExit } = await execa('git', ['ls-files', '--', itemPath], {
      cwd,
      reject: false,
      timeout: 5000,
    });
    return lsExit === 0 && lsOut.trim().length > 0;
  } catch {
    return false;
  }
}

export async function gitStatusPorcelain(cwd: string): Promise<string | null> {
  try {
    const { stdout, exitCode } = await execa('git', ['status', '--porcelain'], {
      cwd,
      reject: false,
      timeout: 5000,
    });
    if (exitCode !== 0) return null;
    return stdout;
  } catch {
    return null;
  }
}
