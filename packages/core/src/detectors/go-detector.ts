import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { RiskTier } from '../safety/risk-tiers.js';
import type { CleanableItem, DetectedProject } from '../types.js';
import { BaseDetector, type DetectorContext } from './detector.js';

export interface GoDetectorOptions {
  readonly homeDir?: string;
}

export class GoDetector extends BaseDetector {
  readonly id = 'go';
  readonly displayName = 'Go';

  private readonly homeDir: string;

  constructor(options: GoDetectorOptions = {}) {
    super();
    this.homeDir = options.homeDir ?? homedir();
  }

  async quickProbe(dir: string): Promise<boolean> {
    try {
      await access(join(dir, 'go.mod'));
      return true;
    } catch {
      return false;
    }
  }

  async analyze(dir: string, _ctx: DetectorContext): Promise<DetectedProject | null> {
    let content: string;
    try {
      content = await readFile(join(dir, 'go.mod'), 'utf-8');
    } catch {
      return null;
    }

    const moduleName = content.match(/^module\s+(\S+)/m)?.[1];
    const items: CleanableItem[] = [];

    const vendorPath = join(dir, 'vendor');
    if (await this.dirExists(vendorPath)) {
      items.push({
        id: `${dir}::vendor`,
        path: vendorPath,
        detector: this.id,
        risk: RiskTier.Yellow,
        sizeBytes: await this.computeSize(vendorPath),
        lastModified: await this.getLastModified(vendorPath),
        description: 'Go vendor directory — regenerate with `go mod vendor`',
        projectRoot: dir,
      });
    }

    return {
      root: dir,
      type: 'go',
      name: moduleName,
      lastModified: await this.getLastModified(dir),
      hasGit: await this.dirExists(join(dir, '.git')),
      items,
    };
  }

  override async scanGlobal(_ctx: DetectorContext): Promise<readonly CleanableItem[]> {
    const items: CleanableItem[] = [];
    // GOPATH/pkg/mod — defaults to ~/go/pkg/mod when GOPATH is not set
    const gopath = process.env.GOPATH ?? join(this.homeDir, 'go');
    const modCachePath = join(gopath, 'pkg', 'mod');

    if (await this.dirExists(modCachePath)) {
      items.push({
        id: 'global::go::mod-cache',
        path: modCachePath,
        detector: this.id,
        risk: RiskTier.Green,
        sizeBytes: await this.computeSize(modCachePath),
        lastModified: await this.getLastModified(modCachePath),
        description: 'Go module cache — regenerate automatically with `go get`',
      });
    }

    return items;
  }
}
