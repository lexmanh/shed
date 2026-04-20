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
