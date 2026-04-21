import { homedir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { RiskTier } from '../safety/risk-tiers.js';
import type { CleanableItem, DetectedProject } from '../types.js';
import { BaseDetector, type DetectorContext } from './detector.js';

export interface DotnetDetectorOptions {
  readonly homeDir?: string;
}

const DOTNET_EXTENSIONS = new Set(['.csproj', '.fsproj', '.vbproj', '.sln']);

export class DotnetDetector extends BaseDetector {
  readonly id = 'dotnet';
  readonly displayName = '.NET';

  private readonly homeDir: string;

  constructor(options: DotnetDetectorOptions = {}) {
    super();
    this.homeDir = options.homeDir ?? homedir();
  }

  async quickProbe(dir: string): Promise<boolean> {
    const { readdir } = await import('node:fs/promises');
    try {
      const entries = await readdir(dir);
      return entries.some(e => DOTNET_EXTENSIONS.has(extname(e)));
    } catch {
      return false;
    }
  }

  async analyze(dir: string, _ctx: DetectorContext): Promise<DetectedProject | null> {
    const { readdir } = await import('node:fs/promises');
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return null;
    }

    const projectFile = entries.find(e => DOTNET_EXTENSIONS.has(extname(e)));
    if (!projectFile) return null;

    // Use filename without extension as project name (.sln files keep full name)
    const projectName = extname(projectFile) === '.sln'
      ? basename(projectFile, '.sln')
      : basename(projectFile, extname(projectFile));

    const items: CleanableItem[] = [];

    const binPath = join(dir, 'bin');
    if (await this.dirExists(binPath)) {
      items.push({
        id: `${dir}::bin`,
        path: binPath,
        detector: this.id,
        risk: RiskTier.Yellow,
        sizeBytes: await this.computeSize(binPath),
        lastModified: await this.getLastModified(binPath),
        description: '.NET build output — regenerate with `dotnet build`',
        projectRoot: dir,
      });
    }

    const objPath = join(dir, 'obj');
    if (await this.dirExists(objPath)) {
      items.push({
        id: `${dir}::obj`,
        path: objPath,
        detector: this.id,
        risk: RiskTier.Yellow,
        sizeBytes: await this.computeSize(objPath),
        lastModified: await this.getLastModified(objPath),
        description: '.NET intermediate build files — regenerate with `dotnet build`',
        projectRoot: dir,
      });
    }

    return {
      root: dir,
      type: 'dotnet',
      name: projectName,
      lastModified: await this.getLastModified(dir),
      hasGit: await this.dirExists(join(dir, '.git')),
      items,
    };
  }

  override async scanGlobal(_ctx: DetectorContext): Promise<readonly CleanableItem[]> {
    const items: CleanableItem[] = [];
    const nugetPath = join(this.homeDir, '.nuget', 'packages');

    if (await this.dirExists(nugetPath)) {
      items.push({
        id: 'global::dotnet::nuget-packages',
        path: nugetPath,
        detector: this.id,
        risk: RiskTier.Green,
        sizeBytes: await this.computeSize(nugetPath),
        lastModified: await this.getLastModified(nugetPath),
        description: 'NuGet global package cache — regenerate automatically on next build',
      });
    }

    return items;
  }
}
