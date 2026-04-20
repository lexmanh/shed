/**
 * macOS platform implementation.
 *
 * Process detection uses `lsof +D <path>` — lists open files inside
 * the given directory. `lsof` ships with macOS by default.
 */

import { execa } from 'execa';
import type { PlatformApi, ProcessHolder } from './index.js';

export const darwinPlatform: PlatformApi = {
  async isPathHeldByProcess(path: string): Promise<ProcessHolder | null> {
    try {
      const { stdout, exitCode } = await execa('lsof', ['+D', path], {
        reject: false,
        timeout: 5000,
      });
      if (exitCode !== 0 || !stdout) return null;
      return parseLsofFirst(stdout);
    } catch {
      return null;
    }
  },
};

/**
 * Parse the first data row of `lsof` output into a ProcessHolder.
 * lsof format: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
 */
function parseLsofFirst(stdout: string): ProcessHolder | null {
  const lines = stdout.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;
  const firstDataLine = lines[1];
  if (!firstDataLine) return null;
  const cols = firstDataLine.split(/\s+/);
  const command = cols[0] ?? 'unknown';
  const pid = Number.parseInt(cols[1] ?? '', 10);
  if (Number.isNaN(pid)) return null;
  return { pid, command };
}
