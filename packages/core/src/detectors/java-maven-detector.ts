import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { RiskTier } from '../safety/risk-tiers.js';
import type { CleanableItem, DetectedProject } from '../types.js';
import { BaseDetector, type DetectorContext } from './detector.js';

export interface JavaMavenDetectorOptions {
  readonly homeDir?: string;
}

export class JavaMavenDetector extends BaseDetector {
  readonly id = 'java-maven';
  readonly displayName = 'Java (Maven)';

  private readonly homeDir: string;

  constructor(options: JavaMavenDetectorOptions = {}) {
    super();
    this.homeDir = options.homeDir ?? homedir();
  }

  async quickProbe(dir: string): Promise<boolean> {
    try {
      await access(join(dir, 'pom.xml'));
      return true;
    } catch {
      return false;
    }
  }

  async analyze(dir: string, _ctx: DetectorContext): Promise<DetectedProject | null> {
    let content: string;
    try {
      content = await readFile(join(dir, 'pom.xml'), 'utf-8');
    } catch {
      return null;
    }

    // Validate it's actually a Maven POM (not just any XML)
    if (!content.includes('<project')) return null;

    const artifactId = content.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1]?.trim();
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
        description: 'Maven build output — regenerate with `mvn package`',
        projectRoot: dir,
      });
    }

    return {
      root: dir,
      type: 'java-maven',
      name: artifactId,
      lastModified: await this.getLastModified(dir),
      hasGit: await this.dirExists(join(dir, '.git')),
      items,
    };
  }

  override async scanGlobal(_ctx: DetectorContext): Promise<readonly CleanableItem[]> {
    const items: CleanableItem[] = [];
    const m2Path = join(this.homeDir, '.m2', 'repository');

    if (await this.dirExists(m2Path)) {
      items.push({
        id: 'global::java-maven::m2-repository',
        path: m2Path,
        detector: this.id,
        risk: RiskTier.Green,
        sizeBytes: await this.computeSize(m2Path),
        lastModified: await this.getLastModified(m2Path),
        description: 'Maven local repository — regenerate automatically on next build',
      });
    }

    return items;
  }
}
