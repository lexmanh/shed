import { createFixture } from 'fs-fixture';
import { describe, expect, it } from 'vitest';
import { RiskTier } from '../safety/risk-tiers.js';
import { DatabaseDetector } from './database-detector.js';
import type { DetectorContext } from './detector.js';

const ctx: DetectorContext = { scanRoot: '/', maxDepth: 5 };

// ─── quickProbe / analyze ─────────────────────────────────────────────────────

describe('DatabaseDetector.quickProbe', () => {
  it('always returns false', async () => {
    expect(await new DatabaseDetector().quickProbe('/any/path')).toBe(false);
  });
});

describe('DatabaseDetector.analyze', () => {
  it('always returns null', async () => {
    expect(await new DatabaseDetector().analyze('/any/path', ctx)).toBeNull();
  });
});

// ─── MySQL binary logs ────────────────────────────────────────────────────────

describe('DatabaseDetector.scanGlobal — MySQL binary logs', () => {
  it('returns a Red detect-only item when mysql-bin.* files exist', async () => {
    const fix = await createFixture({
      'var/lib/mysql/mysql-bin.000001': '',
      'var/lib/mysql/mysql-bin.000002': '',
      'var/lib/mysql/mysql-bin.index': '',
    });
    try {
      const items = await new DatabaseDetector({ rootDir: fix.path }).scanGlobal(ctx);
      const mysql = items.find((i) => i.metadata?.kind === 'mysql-binlogs');
      expect(mysql).toBeDefined();
      expect(mysql?.risk).toBe(RiskTier.Red);
      expect(mysql?.metadata?.detectOnly).toBe(true);
      // path must be a virtual identifier, NOT the raw mysql dir — prevents accidental db deletion
      expect(mysql?.path).toMatch(/^binlogs::/);
    } finally {
      await fix.rm();
    }
  });

  it('skips when no mysql-bin.* files exist', async () => {
    const fix = await createFixture({ 'var/lib/mysql/ibdata1': '' });
    try {
      const items = await new DatabaseDetector({ rootDir: fix.path }).scanGlobal(ctx);
      expect(items.find((i) => i.metadata?.kind === 'mysql-binlogs')).toBeUndefined();
    } finally {
      await fix.rm();
    }
  });

  it('skips when /var/lib/mysql is absent', async () => {
    const fix = await createFixture({});
    try {
      const items = await new DatabaseDetector({ rootDir: fix.path }).scanGlobal(ctx);
      expect(items.find((i) => i.metadata?.kind === 'mysql-binlogs')).toBeUndefined();
    } finally {
      await fix.rm();
    }
  });
});

// ─── PostgreSQL WAL ───────────────────────────────────────────────────────────

describe('DatabaseDetector.scanGlobal — PostgreSQL WAL', () => {
  it('returns a Red detect-only item when pg_wal directory has files', async () => {
    const fix = await createFixture({
      'var/lib/postgresql/14/main/pg_wal/000000010000000000000001': '',
    });
    try {
      const items = await new DatabaseDetector({ rootDir: fix.path }).scanGlobal(ctx);
      const pgwal = items.find((i) => i.metadata?.kind === 'postgresql-wal');
      expect(pgwal).toBeDefined();
      expect(pgwal?.risk).toBe(RiskTier.Red);
      expect(pgwal?.metadata?.detectOnly).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('skips when pg_wal is absent', async () => {
    const fix = await createFixture({ 'var/lib/postgresql/14/main/global/pg_control': '' });
    try {
      const items = await new DatabaseDetector({ rootDir: fix.path }).scanGlobal(ctx);
      expect(items.find((i) => i.metadata?.kind === 'postgresql-wal')).toBeUndefined();
    } finally {
      await fix.rm();
    }
  });
});

// ─── MongoDB diagnostic data ──────────────────────────────────────────────────

describe('DatabaseDetector.scanGlobal — MongoDB diagnostic', () => {
  it('returns a Red detect-only item when diagnostic.data directory exists', async () => {
    const fix = await createFixture({
      'var/lib/mongodb/diagnostic.data/metrics.2024-01-01T00-00-00Z-00000': '',
    });
    try {
      const items = await new DatabaseDetector({ rootDir: fix.path }).scanGlobal(ctx);
      const mongo = items.find((i) => i.metadata?.kind === 'mongodb-diagnostic');
      expect(mongo).toBeDefined();
      expect(mongo?.risk).toBe(RiskTier.Red);
      expect(mongo?.metadata?.detectOnly).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('skips when diagnostic.data is absent', async () => {
    const fix = await createFixture({ 'var/lib/mongodb/mongod.lock': '' });
    try {
      const items = await new DatabaseDetector({ rootDir: fix.path }).scanGlobal(ctx);
      expect(items.find((i) => i.metadata?.kind === 'mongodb-diagnostic')).toBeUndefined();
    } finally {
      await fix.rm();
    }
  });
});
