/**
 * RustDetector — detects Rust projects and their cleanable artifacts.
 *
 * Handles:
 * - Project-level: target/ (build output)
 * - Global: ~/.cargo/registry, ~/.cargo/git (download caches only — NOT ~/.cargo/bin)
 *
 * Risk classification:
 * - target/: Yellow — large, fully regeneratable with `cargo build`
 * - Cargo registry/git caches: Green — re-downloaded automatically
 */

import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { gitStatusPorcelain } from '../safety/git.js';
import { RiskTier } from '../safety/risk-tiers.js';
import type { CleanableItem, DetectedProject } from '../types.js';
import { BaseDetector, type DetectorContext } from './detector.js';

export interface RustDetectorOptions {
  readonly homeDir?: string;
}

export class RustDetector extends BaseDetector {
  readonly id = 'rust';
  readonly displayName = 'Rust';

  private readonly homeDir: string;

  constructor(options: RustDetectorOptions = {}) {
    super();
    this.homeDir = options.homeDir ?? homedir();
  }

  async quickProbe(dir: string): Promise<boolean> {
    try {
      await access(join(dir, 'Cargo.toml'));
      return true;
    } catch {
      return false;
    }
  }

  async analyze(dir: string, _ctx: DetectorContext): Promise<DetectedProject | null> {
    if (!(await this.quickProbe(dir))) return null;

    const name = await this.readCrateName(dir);
    const items: CleanableItem[] = [];

    const targetPath = join(dir, 'target');
    if (await this.dirExists(targetPath)) {
      items.push({
        id: `${dir}::target`,
        path: targetPath,
        detector: this.id,
        risk: RiskTier.Yellow,
        sizeBytes: await this.computeSize(targetPath),
        lastModified: await this.getLastModified(targetPath),
        description: 'Rust build output — regenerate with `cargo build`',
        projectRoot: dir,
      });
    }

    const hasGit = await this.dirExists(join(dir, '.git'));
    let gitClean: boolean | undefined;
    if (hasGit) {
      const porcelain = await gitStatusPorcelain(dir);
      gitClean = porcelain !== null ? porcelain.trim() === '' : undefined;
    }

    return {
      root: dir,
      type: 'rust',
      name,
      lastModified: await this.getLastModified(dir),
      hasGit,
      gitClean,
      items,
    };
  }

  override async scanGlobal(_ctx: DetectorContext): Promise<readonly CleanableItem[]> {
    const items: CleanableItem[] = [];

    const caches = [
      {
        cachePath: join(this.homeDir, '.cargo', 'registry'),
        description: 'Cargo registry download cache — re-downloaded automatically',
      },
      {
        cachePath: join(this.homeDir, '.cargo', 'git'),
        description: 'Cargo git source cache — re-downloaded automatically',
      },
    ];

    for (const { cachePath, description } of caches) {
      if (await this.dirExists(cachePath)) {
        items.push({
          id: `global::rust::${cachePath}`,
          path: cachePath,
          detector: this.id,
          risk: RiskTier.Green,
          sizeBytes: await this.computeSize(cachePath),
          lastModified: await this.getLastModified(cachePath),
          description,
        });
      }
    }

    return items;
  }

  private async readCrateName(dir: string): Promise<string | undefined> {
    try {
      const content = await readFile(join(dir, 'Cargo.toml'), 'utf-8');
      const match = /^\[package\][\s\S]*?^name\s*=\s*["']?([^"'\n]+)["']?/m.exec(content);
      return match?.[1]?.trim() || undefined;
    } catch {
      return undefined;
    }
  }
}
