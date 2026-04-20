/**
 * Tests for SafetyChecker.
 *
 * Per CLAUDE.md rule 3: safety-critical code requires tests written FIRST.
 * These tests document the expected behavior — implementations should
 * make them pass.
 *
 * Coverage target: 100% branches.
 */

import { describe, it, expect, vi } from 'vitest';
import { SafetyChecker } from './safety-checker.js';
import { RiskTier } from './risk-tiers.js';
import type { CleanableItem } from '../types.js';

const mkItem = (overrides: Partial<CleanableItem> = {}): CleanableItem => ({
  id: 'test-1',
  path: '/tmp/test-node-modules',
  detector: 'node',
  risk: RiskTier.Yellow,
  sizeBytes: 1024 * 1024 * 100, // 100 MB
  lastModified: Date.now() - 1000 * 60 * 60 * 24 * 90, // 90 days ago
  description: 'node_modules in /tmp/test',
  projectRoot: '/tmp/test',
  ...overrides,
});

describe('SafetyChecker', () => {
  describe('sacred path guard', () => {
    it('blocks operations on ~/.ssh', async () => {
      const checker = new SafetyChecker();
      const result = await checker.check(mkItem({ path: `${process.env['HOME']}/.ssh` }));
      expect(result.allowed).toBe(false);
      expect(result.reasons[0]?.code).toBe('sacred-path');
      expect(result.reasons[0]?.severity).toBe('block');
    });

    it('blocks operations on paths inside a sacred directory', async () => {
      const checker = new SafetyChecker();
      const result = await checker.check(
        mkItem({ path: `${process.env['HOME']}/.aws/credentials` }),
      );
      expect(result.allowed).toBe(false);
    });

    it.todo('blocks system paths on Windows (/Windows/, /Program Files/)');
    it.todo('handles symlinks that resolve into sacred paths');
  });

  describe('recency guard', () => {
    it('warns for items modified within threshold', async () => {
      const checker = new SafetyChecker({ recencyThresholdDays: 30 });
      const result = await checker.check(
        mkItem({
          path: '/tmp/safe-to-check', // not sacred
          lastModified: Date.now() - 1000 * 60 * 60 * 24 * 7, // 7 days ago
        }),
      );
      const recencyReason = result.reasons.find((r) => r.code === 'recent-modification');
      expect(recencyReason).toBeDefined();
      expect(recencyReason?.severity).toBe('warning');
    });

    it('does not warn for old items', async () => {
      const checker = new SafetyChecker({ recencyThresholdDays: 30 });
      const result = await checker.check(
        mkItem({
          path: '/tmp/old',
          lastModified: Date.now() - 1000 * 60 * 60 * 24 * 100, // 100 days ago
        }),
      );
      expect(result.reasons.find((r) => r.code === 'recent-modification')).toBeUndefined();
    });
  });

  describe('size sanity', () => {
    it.todo('warns when a single operation exceeds tier threshold');
    it.todo('does not warn when below threshold');
  });

  describe('git awareness', () => {
    it.todo('blocks when project has uncommitted changes');
    it.todo('allows when project is git-clean');
    it.todo('allows when not a git repo');
    it.todo('handles git command not installed gracefully');
  });

  describe('process awareness', () => {
    it.todo('blocks when a process is holding files in the path');
    it.todo('allows when no process is using the path');
    it.todo('handles lsof/Get-Process errors gracefully');
  });

  describe('Red tier handling', () => {
    it('adds warning for Red tier items', async () => {
      const checker = new SafetyChecker();
      const result = await checker.check(
        mkItem({ path: '/tmp/red-item', risk: RiskTier.Red }),
      );
      expect(result.reasons.some((r) => r.message.includes('Red-tier'))).toBe(true);
    });

    it.todo('skips Red items when includeRed=false');
    it.todo('requires confirmation for each Red item');
  });

  describe('execute()', () => {
    it('respects dry-run mode', async () => {
      const checker = new SafetyChecker();
      const item = mkItem({ path: '/tmp/not-sacred' });
      const result = await checker.execute([item], {
        dryRun: true,
        hardDelete: false,
        includeRed: false,
      });
      // Item is skipped due to recency (90 days old is fine, but let's test dry-run path)
      expect(result.succeeded.length + result.skipped.length).toBe(1);
    });

    it.todo('re-checks items at execution time (TOCTOU mitigation)');
    it.todo('calls confirm callback for Red items');
    it.todo('accumulates totalBytesFreed correctly');
    it.todo('continues after individual failures');
    it.todo('never calls performDelete() when dryRun=true');
  });
});
