/**
 * Windows platform implementation — STUB.
 *
 * Reliable process-holder detection on Windows requires one of:
 *   (a) Sysinternals `handle.exe` (external binary, restrictive EULA)
 *   (b) PowerShell + `Get-CimInstance Win32_Process` + NtQuerySystemInformation
 *       (fragile, needs admin for many paths)
 *   (c) Attempt exclusive open via `CreateFile` with `FILE_SHARE_NONE`
 *       and treat `ERROR_SHARING_VIOLATION` as "in use"
 *
 * Evaluating these is a Phase 1 task. For Phase 0 this returns `null`
 * (= "no detected conflict"). The safety layer still applies sacred-path,
 * git-state, recency, and size guards on Windows, and `performDelete`
 * is not yet implemented on any platform, so returning `null` here
 * cannot cause unsafe deletion.
 */

import type { PlatformApi, ProcessHolder } from './index.js';

export const win32Platform: PlatformApi = {
  async isPathHeldByProcess(_path: string): Promise<ProcessHolder | null> {
    return null;
  },
};
