/**
 * IdeDetector — detects IDE cache directories (global-only, no per-project items).
 *
 * Handles:
 * - JetBrains IDEs: ~/Library/Caches/JetBrains/* (macOS)
 *                   ~/.cache/JetBrains/* (Linux)
 *                   %LOCALAPPDATA%/JetBrains/* (Windows)
 * - VSCode:         ~/Library/Application Support/Code/User/workspaceStorage (macOS)
 *                   ~/.config/Code/User/workspaceStorage (Linux)
 *                   %APPDATA%/Code/User/workspaceStorage (Windows)
 *
 * Risk classification:
 * - All items: Green — entirely regeneratable, IDEs rebuild on next launch
 */

import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { RiskTier } from '../safety/risk-tiers.js';
import type { CleanableItem } from '../types.js';
import { BaseDetector, type DetectorContext } from './detector.js';

export interface IdeDetectorOptions {
  readonly homeDir?: string;
  readonly platform?: NodeJS.Platform;
}

export class IdeDetector extends BaseDetector {
  readonly id = 'ide';
  readonly displayName = 'IDE Caches';

  private readonly homeDir: string;
  private readonly platform: NodeJS.Platform;

  constructor(options: IdeDetectorOptions = {}) {
    super();
    this.homeDir = options.homeDir ?? homedir();
    this.platform = options.platform ?? process.platform;
  }

  async quickProbe(_dir: string): Promise<boolean> {
    return false;
  }

  async analyze(_dir: string, _ctx: DetectorContext) {
    return null;
  }

  override async scanGlobal(_ctx: DetectorContext): Promise<readonly CleanableItem[]> {
    const items: CleanableItem[] = [];

    await Promise.all([this.collectJetBrainsItems(items), this.collectVSCodeItems(items)]);

    return items;
  }

  private jetBrainsCacheDir(): string | null {
    const home = this.homeDir;
    if (this.platform === 'darwin') return join(home, 'Library', 'Caches', 'JetBrains');
    if (this.platform === 'linux') return join(home, '.cache', 'JetBrains');
    if (this.platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA;
      return localAppData ? join(localAppData, 'JetBrains') : null;
    }
    return null;
  }

  private vsCodeStorageDir(): string | null {
    const home = this.homeDir;
    if (this.platform === 'darwin') {
      return join(home, 'Library', 'Application Support', 'Code', 'User', 'workspaceStorage');
    }
    if (this.platform === 'linux') {
      return join(home, '.config', 'Code', 'User', 'workspaceStorage');
    }
    if (this.platform === 'win32') {
      const appData = process.env.APPDATA;
      return appData ? join(appData, 'Code', 'User', 'workspaceStorage') : null;
    }
    return null;
  }

  private async collectJetBrainsItems(items: CleanableItem[]): Promise<void> {
    const cacheDir = this.jetBrainsCacheDir();
    if (!cacheDir || !(await this.dirExists(cacheDir))) return;

    let entries: Dirent[];
    try {
      entries = (await readdir(cacheDir, { withFileTypes: true })) as Dirent[];
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const entryPath = join(cacheDir, entry.name);
      items.push({
        id: `global::ide::jetbrains::${entry.name}`,
        path: entryPath,
        detector: this.id,
        risk: RiskTier.Green,
        sizeBytes: await this.computeSize(entryPath),
        lastModified: await this.getLastModified(entryPath),
        description: `JetBrains ${entry.name} system cache — rebuilt automatically on IDE launch`,
      });
    }
  }

  private async collectVSCodeItems(items: CleanableItem[]): Promise<void> {
    const storageDir = this.vsCodeStorageDir();
    if (!storageDir || !(await this.dirExists(storageDir))) return;

    items.push({
      id: 'global::ide::vscode::workspaceStorage',
      path: storageDir,
      detector: this.id,
      risk: RiskTier.Green,
      sizeBytes: await this.computeSize(storageDir),
      lastModified: await this.getLastModified(storageDir),
      description: 'VSCode workspaceStorage — per-workspace extension data, safe to clear',
    });
  }
}
