import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { RiskTier } from '../safety/risk-tiers.js';
import type { CleanableItem, DetectedProject } from '../types.js';
import { BaseDetector, type DetectorContext } from './detector.js';

export interface JavaGradleDetectorOptions {
  readonly homeDir?: string;
}

const GRADLE_SIGNATURES = [
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
];

export class JavaGradleDetector extends BaseDetector {
  readonly id = 'java-gradle';
  readonly displayName = 'Java (Gradle)';

  private readonly homeDir: string;

  constructor(options: JavaGradleDetectorOptions = {}) {
    super();
    this.homeDir = options.homeDir ?? homedir();
  }

  async quickProbe(dir: string): Promise<boolean> {
    for (const sig of GRADLE_SIGNATURES) {
      try {
        await access(join(dir, sig));
        return true;
      } catch {
        // try next
      }
    }
    return false;
  }

  async analyze(dir: string, _ctx: DetectorContext): Promise<DetectedProject | null> {
    // Confirm at least one Gradle signature exists
    let found = false;
    let projectName: string | undefined;
    for (const sig of GRADLE_SIGNATURES) {
      try {
        await access(join(dir, sig));
        found = true;
        if (sig.startsWith('settings.gradle')) {
          // Best-effort: extract rootProject.name from settings file
          const { readFile } = await import('node:fs/promises');
          const content = await readFile(join(dir, sig), 'utf-8').catch(() => '');
          projectName = content.match(/rootProject\.name\s*=\s*["']([^"']+)["']/)?.[1];
        }
        break;
      } catch {
        // continue
      }
    }
    if (!found) return null;

    const items: CleanableItem[] = [];

    const buildPath = join(dir, 'build');
    if (await this.dirExists(buildPath)) {
      items.push({
        id: `${dir}::gradle::build`,
        path: buildPath,
        detector: this.id,
        risk: RiskTier.Yellow,
        sizeBytes: await this.computeSize(buildPath),
        lastModified: await this.getLastModified(buildPath),
        description: 'Gradle build output — regenerate with `./gradlew build`',
        projectRoot: dir,
      });
    }

    // Local Gradle wrapper cache (.gradle/ inside the project)
    const localGradlePath = join(dir, '.gradle');
    if (await this.dirExists(localGradlePath)) {
      items.push({
        id: `${dir}::gradle::local-cache`,
        path: localGradlePath,
        detector: this.id,
        risk: RiskTier.Yellow,
        sizeBytes: await this.computeSize(localGradlePath),
        lastModified: await this.getLastModified(localGradlePath),
        description: 'Gradle local project cache — regenerate on next build',
        projectRoot: dir,
      });
    }

    return {
      root: dir,
      type: 'java-gradle',
      name: projectName,
      lastModified: await this.getLastModified(dir),
      hasGit: await this.dirExists(join(dir, '.git')),
      items,
    };
  }

  override async scanGlobal(_ctx: DetectorContext): Promise<readonly CleanableItem[]> {
    const items: CleanableItem[] = [];
    const gradleCachePath = join(this.homeDir, '.gradle', 'caches');

    if (await this.dirExists(gradleCachePath)) {
      items.push({
        id: 'global::java-gradle::caches',
        path: gradleCachePath,
        detector: this.id,
        risk: RiskTier.Green,
        sizeBytes: await this.computeSize(gradleCachePath),
        lastModified: await this.getLastModified(gradleCachePath),
        description: 'Gradle global dependency cache — regenerate automatically on next build',
      });
    }

    return items;
  }
}
