import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { RiskTier } from '../safety/risk-tiers.js';
import type { CleanableItem, DetectedProject } from '../types.js';
import { BaseDetector, type DetectorContext } from './detector.js';

export interface WebserverDetectorOptions {
  /** Override filesystem root for testability (default: '/') */
  readonly rootDir?: string;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export class WebserverDetector extends BaseDetector {
  readonly id = 'webserver';
  readonly displayName = 'Web Server';

  private readonly rootDir: string;

  constructor(opts: WebserverDetectorOptions = {}) {
    super();
    this.rootDir = opts.rootDir ?? '/';
  }

  async quickProbe(_dir: string): Promise<boolean> {
    return false;
  }

  async analyze(_dir: string, _ctx: DetectorContext): Promise<DetectedProject | null> {
    return null;
  }

  override async scanGlobal(_ctx: DetectorContext): Promise<readonly CleanableItem[]> {
    if (process.platform === 'win32') return [];
    const results = await Promise.all([
      this.checkLogDir(join(this.rootDir, 'var/log/nginx'), 'nginx'),
      this.checkLogDir(join(this.rootDir, 'var/log/apache2'), 'apache2'),
      this.checkLogDir(join(this.rootDir, 'var/log/httpd'), 'httpd'),
    ]);
    return results.flat();
  }

  // Returns one CleanableItem per old .gz file so SafetyChecker operates on the
  // exact file path rather than the whole directory (which would delete active logs).
  private async checkLogDir(dir: string, server: string): Promise<CleanableItem[]> {
    if (!(await this.dirExists(dir))) return [];

    let entries: import('node:fs').Dirent<string>[];
    try {
      entries = await readdir(dir, { withFileTypes: true, encoding: 'utf-8' });
    } catch {
      return [];
    }

    const items: CleanableItem[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.gz')) continue;
      const fullPath = join(dir, entry.name);
      try {
        const s = await stat(fullPath);
        if (Date.now() - s.mtimeMs > THIRTY_DAYS_MS) {
          items.push({
            id: `global::webserver::${server}::${entry.name}`,
            path: fullPath,
            detector: this.id,
            risk: RiskTier.Green,
            sizeBytes: s.size,
            lastModified: s.mtimeMs,
            description: `Rotated ${server} log (${entry.name}) — older than 30 days, already archived by logrotate`,
            metadata: { kind: 'rotated-log', server, filename: entry.name },
          });
        }
      } catch {
        /* skip unreadable files */
      }
    }
    return items;
  }
}
