import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import fg from 'fast-glob';
import { RiskTier } from '../safety/risk-tiers.js';
import type { CleanableItem, DetectedProject } from '../types.js';
import { BaseDetector, type DetectorContext } from './detector.js';

export interface DatabaseDetectorOptions {
  /** Override filesystem root for testability (default: '/') */
  readonly rootDir?: string;
}

export class DatabaseDetector extends BaseDetector {
  readonly id = 'database';
  readonly displayName = 'Database';

  private readonly rootDir: string;

  constructor(opts: DatabaseDetectorOptions = {}) {
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
      this.checkMysqlBinlogs(),
      this.checkPostgresWal(),
      this.checkMongoDbDiagnostic(),
    ]);
    return results.flat();
  }

  private async checkMysqlBinlogs(): Promise<CleanableItem[]> {
    const mysqlDir = join(this.rootDir, 'var/lib/mysql');
    if (!(await this.dirExists(mysqlDir))) return [];

    let binlogs: string[] = [];
    try {
      const entries = await readdir(mysqlDir, { withFileTypes: true, encoding: 'utf-8' });
      binlogs = entries
        .filter((e) => e.isFile() && /^mysql-bin\.\d+$/.test(e.name))
        .map((e) => e.name);
    } catch {
      return [];
    }
    if (binlogs.length === 0) return [];

    let totalBytes = 0;
    for (const name of binlogs) {
      totalBytes += await this.computeSize(join(mysqlDir, name));
    }

    // path uses a virtual identifier (not the mysql dir) — prevents SafetyChecker
    // from trashing the entire database directory if detectOnly is ever ignored.
    return [
      {
        id: 'global::database::mysql-binlogs',
        path: `binlogs::${mysqlDir}`,
        detector: this.id,
        risk: RiskTier.Red,
        sizeBytes: totalBytes,
        lastModified: await this.getLastModified(mysqlDir),
        description: `MySQL binary logs (${binlogs.length} files in ${mysqlDir}) — DO NOT delete manually. Use: PURGE BINARY LOGS BEFORE DATE_SUB(NOW(), INTERVAL 7 DAY);`,
        metadata: { kind: 'mysql-binlogs', detectOnly: true, count: binlogs.length } as Record<
          string,
          unknown
        >,
      },
    ];
  }

  private async checkPostgresWal(): Promise<CleanableItem[]> {
    const pgBase = join(this.rootDir, 'var/lib/postgresql');
    if (!(await this.dirExists(pgBase))) return [];

    // Search for pg_wal dirs under any version/cluster: postgresql/*/main/pg_wal
    let walDirs: string[];
    try {
      walDirs = await fg('*/main/pg_wal', {
        cwd: pgBase,
        onlyDirectories: true,
        absolute: true,
        deep: 3,
      });
    } catch {
      return [];
    }

    if (walDirs.length === 0) return [];

    const items: CleanableItem[] = [];
    for (const walDir of walDirs) {
      let hasFiles = false;
      try {
        const entries = await readdir(walDir, { withFileTypes: true, encoding: 'utf-8' });
        hasFiles = entries.some((e) => e.isFile());
      } catch {
        continue;
      }
      if (!hasFiles) continue;

      items.push({
        id: `global::database::postgresql-wal::${walDir}`,
        path: walDir,
        detector: this.id,
        risk: RiskTier.Red,
        sizeBytes: await this.computeSize(walDir),
        lastModified: await this.getLastModified(walDir),
        description:
          'PostgreSQL WAL directory — DO NOT delete manually. Check replication lag first; use pg_archivecleanup if archiving is configured.',
        metadata: { kind: 'postgresql-wal', detectOnly: true },
      });
    }

    return items;
  }

  private async checkMongoDbDiagnostic(): Promise<CleanableItem[]> {
    const diagDir = join(this.rootDir, 'var/lib/mongodb/diagnostic.data');
    if (!(await this.dirExists(diagDir))) return [];
    return [
      {
        id: 'global::database::mongodb-diagnostic',
        path: diagDir,
        detector: this.id,
        risk: RiskTier.Red,
        sizeBytes: await this.computeSize(diagDir),
        lastModified: await this.getLastModified(diagDir),
        description:
          'MongoDB diagnostic.data — DO NOT delete manually. Safe to truncate via MongoDB shell: db.adminCommand({setParameter:1,diagnosticDataCollectionEnabled:false})',
        metadata: { kind: 'mongodb-diagnostic', detectOnly: true },
      },
    ];
  }
}
