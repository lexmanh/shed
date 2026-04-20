/**
 * Platform abstraction layer.
 *
 * OS-specific code lives in `./darwin.ts`, `./linux.ts`, `./win32.ts`.
 * This file defines the shared interface and dispatches to the right
 * implementation based on `process.platform`.
 *
 * DI seam: SafetyChecker accepts a PlatformApi via constructor options,
 * so tests can inject stubs without mocking modules.
 */

import { darwinPlatform } from './darwin.js';
import { linuxPlatform } from './linux.js';
import { win32Platform } from './win32.js';

/**
 * Information about a process holding a file open.
 */
export interface ProcessHolder {
  /** Process ID */
  readonly pid: number;
  /** Command name (best-effort, may be truncated or 'unknown') */
  readonly command: string;
}

/**
 * Platform-specific operations used by the safety layer.
 *
 * All methods must handle their errors internally and surface
 * `null` / graceful fallbacks — they are called from safety-critical
 * paths and MUST NOT throw.
 */
export interface PlatformApi {
  /**
   * Check whether any running process currently has a file open
   * inside `path`. Returns the first holder found, or `null` if
   * the path is free (or detection is unsupported on this OS).
   */
  isPathHeldByProcess(path: string): Promise<ProcessHolder | null>;
}

/**
 * Return the PlatformApi for the current OS.
 *
 * Unknown platforms get a safe no-op implementation: all checks
 * return `null`, which means "no detected conflict". Callers must
 * still apply their own guards (sacred paths, dry-run, etc.).
 */
export function getPlatform(): PlatformApi {
  switch (process.platform) {
    case 'darwin':
      return darwinPlatform;
    case 'linux':
      return linuxPlatform;
    case 'win32':
      return win32Platform;
    default:
      return fallbackPlatform;
  }
}

const fallbackPlatform: PlatformApi = {
  async isPathHeldByProcess(_path: string): Promise<ProcessHolder | null> {
    return null;
  },
};
