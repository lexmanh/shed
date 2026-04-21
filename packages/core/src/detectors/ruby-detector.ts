import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { RiskTier } from '../safety/risk-tiers.js';
import type { CleanableItem, DetectedProject } from '../types.js';
import { BaseDetector, type DetectorContext } from './detector.js';

export interface RubyDetectorOptions {
  readonly homeDir?: string;
}

export class RubyDetector extends BaseDetector {
  readonly id = 'ruby';
  readonly displayName = 'Ruby';

  private readonly homeDir: string;

  constructor(options: RubyDetectorOptions = {}) {
    super();
    this.homeDir = options.homeDir ?? homedir();
  }

  async quickProbe(dir: string): Promise<boolean> {
    try {
      await access(join(dir, 'Gemfile'));
      return true;
    } catch {
      return false;
    }
  }

  async analyze(dir: string, _ctx: DetectorContext): Promise<DetectedProject | null> {
    try {
      await access(join(dir, 'Gemfile'));
    } catch {
      return null;
    }

    const items: CleanableItem[] = [];

    // vendor/bundle — bundler installs gems here with `bundle install --path vendor/bundle`
    const vendorBundlePath = join(dir, 'vendor', 'bundle');
    if (await this.dirExists(vendorBundlePath)) {
      items.push({
        id: `${dir}::vendor-bundle`,
        path: vendorBundlePath,
        detector: this.id,
        risk: RiskTier.Yellow,
        sizeBytes: await this.computeSize(vendorBundlePath),
        lastModified: await this.getLastModified(vendorBundlePath),
        description: 'Bundler vendor gems — regenerate with `bundle install`',
        projectRoot: dir,
      });
    }

    return {
      root: dir,
      type: 'ruby',
      lastModified: await this.getLastModified(dir),
      hasGit: await this.dirExists(join(dir, '.git')),
      items,
    };
  }

  override async scanGlobal(_ctx: DetectorContext): Promise<readonly CleanableItem[]> {
    const items: CleanableItem[] = [];
    // ~/.bundle/cache — bundler global cache (not user gems, safe to clear)
    const bundleCachePath = join(this.homeDir, '.bundle', 'cache');

    if (await this.dirExists(bundleCachePath)) {
      items.push({
        id: 'global::ruby::bundle-cache',
        path: bundleCachePath,
        detector: this.id,
        risk: RiskTier.Green,
        sizeBytes: await this.computeSize(bundleCachePath),
        lastModified: await this.getLastModified(bundleCachePath),
        description: 'Bundler global cache — regenerate automatically on next `bundle install`',
      });
    }

    return items;
  }
}
