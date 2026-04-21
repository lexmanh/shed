/**
 * Tests for WebserverDetector.
 *
 * Per CLAUDE.md rule 3: tests written BEFORE implementation.
 *
 * Uses createFixture for real filesystem tests. File mtimes are manipulated
 * to simulate old rotated logs (> 30 days) vs. recent ones.
 *
 * Safety: each CleanableItem.path must point to a specific .gz file,
 * NOT the log directory — to prevent SafetyChecker from deleting active logs.
 */

import { utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { createFixture } from 'fs-fixture';
import { describe, expect, it } from 'vitest';
import { RiskTier } from '../safety/risk-tiers.js';
import type { DetectorContext } from './detector.js';
import { WebserverDetector } from './webserver-detector.js';

const ctx: DetectorContext = { scanRoot: '/', maxDepth: 5 };

const THIRTY_ONE_DAYS_AGO = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
const ONE_DAY_AGO = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

// ─── quickProbe / analyze ─────────────────────────────────────────────────────

describe('WebserverDetector.quickProbe', () => {
  it('always returns false', async () => {
    expect(await new WebserverDetector().quickProbe('/any/path')).toBe(false);
  });
});

describe('WebserverDetector.analyze', () => {
  it('always returns null', async () => {
    expect(await new WebserverDetector().analyze('/any/path', ctx)).toBeNull();
  });
});

// ─── nginx rotated logs ────────────────────────────────────────────────────────

describe('WebserverDetector.scanGlobal — nginx', () => {
  it('returns one Green item per old rotated nginx .gz file', async () => {
    const fix = await createFixture({
      'var/log/nginx/access.log.1.gz': '',
      'var/log/nginx/error.log.1.gz': '',
      'var/log/nginx/access.log': '', // active log — must be ignored
    });
    try {
      const gz1 = join(fix.path, 'var/log/nginx/access.log.1.gz');
      const gz2 = join(fix.path, 'var/log/nginx/error.log.1.gz');
      await utimes(gz1, THIRTY_ONE_DAYS_AGO, THIRTY_ONE_DAYS_AGO);
      await utimes(gz2, THIRTY_ONE_DAYS_AGO, THIRTY_ONE_DAYS_AGO);

      const items = await new WebserverDetector({
        rootDir: fix.path,
        platform: 'linux',
      }).scanGlobal(ctx);
      const nginxItems = items.filter((i) => i.metadata?.server === 'nginx');
      expect(nginxItems).toHaveLength(2);
      for (const item of nginxItems) {
        expect(item.risk).toBe(RiskTier.Green);
        // path must be the exact .gz file, not the directory
        expect(item.path).toMatch(/\.gz$/);
        expect(item.metadata?.kind).toBe('rotated-log');
      }
    } finally {
      await fix.rm();
    }
  });

  it('path points to the specific .gz file, never the log directory', async () => {
    const fix = await createFixture({ 'var/log/nginx/access.log.1.gz': '' });
    try {
      const gz = join(fix.path, 'var/log/nginx/access.log.1.gz');
      await utimes(gz, THIRTY_ONE_DAYS_AGO, THIRTY_ONE_DAYS_AGO);

      const items = await new WebserverDetector({
        rootDir: fix.path,
        platform: 'linux',
      }).scanGlobal(ctx);
      const item = items.find((i) => i.metadata?.server === 'nginx');
      expect(item?.path).toBe(gz);
      // must NOT be the parent directory
      expect(item?.path).not.toBe(join(fix.path, 'var/log/nginx'));
    } finally {
      await fix.rm();
    }
  });

  it('skips nginx .gz logs that are less than 30 days old', async () => {
    const fix = await createFixture({ 'var/log/nginx/access.log.1.gz': '' });
    try {
      const gz = join(fix.path, 'var/log/nginx/access.log.1.gz');
      await utimes(gz, ONE_DAY_AGO, ONE_DAY_AGO);

      const items = await new WebserverDetector({
        rootDir: fix.path,
        platform: 'linux',
      }).scanGlobal(ctx);
      expect(items.filter((i) => i.metadata?.server === 'nginx')).toHaveLength(0);
    } finally {
      await fix.rm();
    }
  });

  it('skips non-.gz files in nginx log directory', async () => {
    const fix = await createFixture({
      'var/log/nginx/access.log': '',
      'var/log/nginx/error.log': '',
    });
    try {
      const items = await new WebserverDetector({
        rootDir: fix.path,
        platform: 'linux',
      }).scanGlobal(ctx);
      expect(items.filter((i) => i.metadata?.server === 'nginx')).toHaveLength(0);
    } finally {
      await fix.rm();
    }
  });

  it('returns empty when nginx log dir does not exist', async () => {
    const fix = await createFixture({});
    try {
      const items = await new WebserverDetector({
        rootDir: fix.path,
        platform: 'linux',
      }).scanGlobal(ctx);
      expect(items.filter((i) => i.metadata?.server === 'nginx')).toHaveLength(0);
    } finally {
      await fix.rm();
    }
  });
});

// ─── apache2 rotated logs ─────────────────────────────────────────────────────

describe('WebserverDetector.scanGlobal — apache2', () => {
  it('returns one Green item per old rotated apache2 .gz file', async () => {
    const fix = await createFixture({ 'var/log/apache2/access.log.1.gz': '' });
    try {
      const gz = join(fix.path, 'var/log/apache2/access.log.1.gz');
      await utimes(gz, THIRTY_ONE_DAYS_AGO, THIRTY_ONE_DAYS_AGO);

      const items = await new WebserverDetector({
        rootDir: fix.path,
        platform: 'linux',
      }).scanGlobal(ctx);
      const apache = items.find((i) => i.metadata?.server === 'apache2');
      expect(apache).toBeDefined();
      expect(apache?.risk).toBe(RiskTier.Green);
      expect(apache?.path).toBe(gz);
    } finally {
      await fix.rm();
    }
  });
});

// ─── httpd (RHEL/CentOS) rotated logs ─────────────────────────────────────────

describe('WebserverDetector.scanGlobal — httpd', () => {
  it('returns one Green item per old rotated httpd .gz file', async () => {
    const fix = await createFixture({ 'var/log/httpd/access_log.1.gz': '' });
    try {
      const gz = join(fix.path, 'var/log/httpd/access_log.1.gz');
      await utimes(gz, THIRTY_ONE_DAYS_AGO, THIRTY_ONE_DAYS_AGO);

      const items = await new WebserverDetector({
        rootDir: fix.path,
        platform: 'linux',
      }).scanGlobal(ctx);
      const httpd = items.find((i) => i.metadata?.server === 'httpd');
      expect(httpd).toBeDefined();
      expect(httpd?.risk).toBe(RiskTier.Green);
      expect(httpd?.path).toBe(gz);
    } finally {
      await fix.rm();
    }
  });
});
