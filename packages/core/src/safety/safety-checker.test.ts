/**
 * Tests for SafetyChecker.
 *
 * Per CLAUDE.md rule 3: safety-critical code requires tests written FIRST.
 * These tests document the expected behavior — implementations should
 * make them pass.
 *
 * Coverage target: 100% branches.
 */

import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { createFixture } from 'fs-fixture';
import { describe, expect, it, vi } from 'vitest';
import type { PlatformApi } from '../platform/index.js';
import type { CleanableItem } from '../types.js';
import { gitStatusPorcelain } from './git.js';
import { RiskTier } from './risk-tiers.js';
import { SafetyChecker } from './safety-checker.js';

/**
 * Initialize a git repo in `cwd`. Creates a default committer identity
 * and (optionally) an initial empty commit so `git status` has a HEAD.
 */
async function initGit(cwd: string, { makeCommit = true }: { makeCommit?: boolean } = {}) {
  await execa('git', ['init', '-q', '-b', 'main'], { cwd });
  await execa('git', ['config', 'user.email', 'test@shed.test'], { cwd });
  await execa('git', ['config', 'user.name', 'Shed Test'], { cwd });
  await execa('git', ['config', 'commit.gpgsign', 'false'], { cwd });
  if (makeCommit) {
    await execa('git', ['commit', '--allow-empty', '-q', '-m', 'init'], { cwd });
  }
}

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
      const result = await checker.check(mkItem({ path: `${process.env.HOME}/.ssh` }));
      expect(result.allowed).toBe(false);
      expect(result.reasons[0]?.code).toBe('sacred-path');
      expect(result.reasons[0]?.severity).toBe('block');
    });

    it('blocks operations on paths inside a sacred directory', async () => {
      const checker = new SafetyChecker();
      const result = await checker.check(mkItem({ path: `${process.env.HOME}/.aws/credentials` }));
      expect(result.allowed).toBe(false);
    });

    it('blocks system paths on Windows (C:\\Windows, C:\\Program Files)', async () => {
      const checker = new SafetyChecker();

      const windows = await checker.check(mkItem({ path: 'C:\\Windows\\System32\\kernel32.dll' }));
      expect(windows.allowed).toBe(false);
      expect(windows.reasons[0]?.code).toBe('sacred-path');

      const programFiles = await checker.check(
        mkItem({ path: 'C:\\Program Files\\vendor\\app.exe' }),
      );
      expect(programFiles.allowed).toBe(false);
      expect(programFiles.reasons[0]?.code).toBe('sacred-path');

      const programFilesX86 = await checker.check(
        mkItem({ path: 'c:/Program Files (x86)/vendor/app.exe' }),
      );
      expect(programFilesX86.allowed).toBe(false);
      expect(programFilesX86.reasons[0]?.code).toBe('sacred-path');
    });

    it.skipIf(process.platform === 'win32')(
      'handles symlinks that resolve into sacred paths',
      async () => {
        const fixture = await createFixture({});
        try {
          const linkPath = join(fixture.path, 'innocent-cache');
          await symlink('/etc', linkPath);
          const checker = new SafetyChecker();
          const result = await checker.check(mkItem({ path: linkPath }));
          expect(result.allowed).toBe(false);
          expect(result.reasons[0]?.code).toBe('sacred-path');
        } finally {
          await fixture.rm();
        }
      },
    );
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
    it('warns when a single operation exceeds tier threshold', async () => {
      const checker = new SafetyChecker();
      const result = await checker.check(
        mkItem({
          path: '/tmp/big-yellow',
          risk: RiskTier.Yellow,
          sizeBytes: 6 * 1024 * 1024 * 1024, // 6 GB exceeds Yellow 5 GB threshold
        }),
      );
      const reason = result.reasons.find((r) => r.code === 'size-exceeds-threshold');
      expect(reason).toBeDefined();
      expect(reason?.severity).toBe('warning');
    });

    it('does not warn when below threshold', async () => {
      const checker = new SafetyChecker();
      const result = await checker.check(
        mkItem({
          path: '/tmp/small',
          risk: RiskTier.Yellow,
          sizeBytes: 100 * 1024 * 1024, // 100 MB, well under 5 GB
        }),
      );
      expect(result.reasons.find((r) => r.code === 'size-exceeds-threshold')).toBeUndefined();
    });
  });

  describe('git awareness', () => {
    it('blocks when project has uncommitted changes', async () => {
      const fixture = await createFixture({ 'untracked.txt': 'hi' });
      try {
        await initGit(fixture.path);
        const checker = new SafetyChecker();
        const result = await checker.check(
          mkItem({ path: '/tmp/yellow-item', projectRoot: fixture.path }),
        );
        expect(result.allowed).toBe(false);
        const reason = result.reasons.find((r) => r.code === 'git-dirty');
        expect(reason).toBeDefined();
        expect(reason?.severity).toBe('block');
      } finally {
        await fixture.rm();
      }
    });

    it('allows when project is git-clean', async () => {
      const fixture = await createFixture({});
      try {
        await initGit(fixture.path);
        const checker = new SafetyChecker();
        const result = await checker.check(
          mkItem({ path: '/tmp/yellow-item', projectRoot: fixture.path }),
        );
        expect(result.reasons.find((r) => r.code === 'git-dirty')).toBeUndefined();
      } finally {
        await fixture.rm();
      }
    });

    it('allows when not a git repo', async () => {
      const fixture = await createFixture({});
      try {
        // No `git init` → gitStatusPorcelain returns null → no reason attached.
        const checker = new SafetyChecker();
        const result = await checker.check(
          mkItem({ path: '/tmp/yellow-item', projectRoot: fixture.path }),
        );
        expect(result.reasons.find((r) => r.code === 'git-dirty')).toBeUndefined();
      } finally {
        await fixture.rm();
      }
    });

    it('handles git command not installed gracefully', async () => {
      // The graceful fallback lives in gitStatusPorcelain: any exception
      // (ENOENT from missing `git` binary, missing cwd, etc.) is absorbed
      // and mapped to `null`. The SafetyChecker then treats null as
      // "no git info available" and adds no blocking reason.
      const helperResult = await gitStatusPorcelain('/absolutely/does/not/exist/nowhere');
      expect(helperResult).toBeNull();

      const checker = new SafetyChecker();
      const result = await checker.check(
        mkItem({ path: '/tmp/safe', projectRoot: '/absolutely/does/not/exist/nowhere' }),
      );
      expect(result.reasons.find((r) => r.code === 'git-dirty')).toBeUndefined();
    });
  });

  describe('process awareness', () => {
    it('blocks when a process is holding files in the path', async () => {
      const platform: PlatformApi = {
        async isPathHeldByProcess() {
          return { pid: 12345, command: 'node' };
        },
      };
      const checker = new SafetyChecker({ platform });
      const result = await checker.check(mkItem({ path: '/tmp/busy-dir' }));
      expect(result.allowed).toBe(false);
      const reason = result.reasons.find((r) => r.code === 'process-holding-file');
      expect(reason).toBeDefined();
      expect(reason?.severity).toBe('block');
      expect(reason?.message).toContain('node');
      expect(reason?.message).toContain('12345');
    });

    it('allows when no process is using the path', async () => {
      const platform: PlatformApi = {
        async isPathHeldByProcess() {
          return null;
        },
      };
      const checker = new SafetyChecker({ platform });
      const result = await checker.check(mkItem({ path: '/tmp/free-dir' }));
      expect(result.reasons.find((r) => r.code === 'process-holding-file')).toBeUndefined();
    });

    it('handles lsof/Get-Process errors gracefully', async () => {
      const platform: PlatformApi = {
        async isPathHeldByProcess() {
          throw new Error('lsof blew up');
        },
      };
      const checker = new SafetyChecker({ platform });
      const result = await checker.check(mkItem({ path: '/tmp/err-dir' }));
      // Error is absorbed in checkProcessHoldingPath → no reason added,
      // no propagated throw.
      expect(result.reasons.find((r) => r.code === 'process-holding-file')).toBeUndefined();
    });
  });

  describe('Red tier handling', () => {
    it('adds warning for Red tier items', async () => {
      const checker = new SafetyChecker();
      const result = await checker.check(mkItem({ path: '/tmp/red-item', risk: RiskTier.Red }));
      expect(result.reasons.some((r) => r.message.includes('Red-tier'))).toBe(true);
    });

    it('skips Red items when includeRed=false', async () => {
      const checker = new SafetyChecker();
      const redItem = mkItem({ path: '/tmp/red-item', risk: RiskTier.Red });
      const result = await checker.execute([redItem], {
        dryRun: true,
        hardDelete: false,
        includeRed: false,
      });
      expect(result.succeeded.length).toBe(0);
      expect(result.skipped.length).toBe(1);
      expect(result.skipped[0]?.reason).toContain('Red-tier');
    });

    it('requires confirmation for each Red item', async () => {
      const checker = new SafetyChecker();
      const redItems = [
        mkItem({ id: 'r1', path: '/tmp/red-a', risk: RiskTier.Red }),
        mkItem({ id: 'r2', path: '/tmp/red-b', risk: RiskTier.Red }),
      ];
      const confirmedIds: string[] = [];
      const confirm = async (item: CleanableItem) => {
        confirmedIds.push(item.id);
        return true;
      };
      const result = await checker.execute(redItems, {
        dryRun: true,
        hardDelete: false,
        includeRed: true,
        confirm,
      });
      expect(confirmedIds).toEqual(['r1', 'r2']);
      expect(result.succeeded.length).toBe(2);
    });
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

    it('re-checks items at execution time (TOCTOU mitigation)', async () => {
      const checker = new SafetyChecker();
      const spy = vi.spyOn(checker, 'check');
      const items = [mkItem({ id: 'a', path: '/tmp/a' }), mkItem({ id: 'b', path: '/tmp/b' })];
      await checker.execute(items, { dryRun: true, hardDelete: false, includeRed: false });
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy.mock.calls[0]?.[0].id).toBe('a');
      expect(spy.mock.calls[1]?.[0].id).toBe('b');
    });

    it('calls confirm callback only for Red items, not Yellow/Green', async () => {
      const checker = new SafetyChecker();
      const confirm = vi.fn(async () => true);
      const items = [
        mkItem({ id: 'g', path: '/tmp/g', risk: RiskTier.Green }),
        mkItem({ id: 'y', path: '/tmp/y', risk: RiskTier.Yellow }),
        mkItem({ id: 'r', path: '/tmp/r', risk: RiskTier.Red }),
      ];
      await checker.execute(items, {
        dryRun: true,
        hardDelete: false,
        includeRed: true,
        confirm,
      });
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(confirm.mock.calls[0]?.[0].id).toBe('r');
    });

    it('accumulates totalBytesFreed correctly', async () => {
      const checker = new SafetyChecker();
      const items = [
        mkItem({ id: 'a', path: '/tmp/a', sizeBytes: 1000 }),
        mkItem({ id: 'b', path: '/tmp/b', sizeBytes: 2000 }),
        mkItem({ id: 'c', path: '/tmp/c', sizeBytes: 3000 }),
      ];
      const result = await checker.execute(items, {
        dryRun: true,
        hardDelete: false,
        includeRed: false,
      });
      expect(result.succeeded.length).toBe(3);
      expect(result.totalBytesFreed).toBe(6000);
    });

    it('continues after individual failures', async () => {
      // In non-dryRun mode `performDelete` throws (not yet implemented).
      // Each item should fail independently — execute() must not abort the
      // whole batch on the first failure.
      const checker = new SafetyChecker();
      const items = [
        mkItem({ id: 'a', path: '/tmp/a' }),
        mkItem({ id: 'b', path: '/tmp/b' }),
        mkItem({ id: 'c', path: '/tmp/c' }),
      ];
      const result = await checker.execute(items, {
        dryRun: false,
        hardDelete: false,
        includeRed: false,
      });
      expect(result.failed.length).toBe(3);
      expect(result.succeeded.length).toBe(0);
      expect(result.failed.map((f) => f.item.id)).toEqual(['a', 'b', 'c']);
    });

    it('never calls performDelete() when dryRun=true', async () => {
      const checker = new SafetyChecker();
      // Access the private method via bracket-indexed cast to satisfy TS.
      const perfSpy = vi.spyOn(
        checker as unknown as { performDelete: (p: string, h: boolean) => Promise<void> },
        'performDelete',
      );
      await checker.execute([mkItem({ path: '/tmp/dry' })], {
        dryRun: true,
        hardDelete: false,
        includeRed: false,
      });
      expect(perfSpy).not.toHaveBeenCalled();
    });
  });
});
