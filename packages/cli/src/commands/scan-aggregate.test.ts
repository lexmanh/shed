/**
 * Tests for scan-aggregate pure helpers used by `shed scan` compact output.
 *
 * Aggregation collapses many sibling items (same parent dir + same metadata.kind)
 * into one display row to keep default scan output readable on real systems
 * (dogfood manhlx-vpt-01 found 797 lines for 291 items — bug #6/#7).
 */

import { type CleanableItem, RiskTier } from '@lexmanh/shed-core';
import { describe, expect, it } from 'vitest';
import { AGGREGATE_THRESHOLD, aggregateForDisplay, selectTopGroups } from './scan-aggregate.js';

const mkItem = (overrides: Partial<CleanableItem> = {}): CleanableItem => ({
  id: 'test',
  path: '/tmp/file',
  detector: 'webserver',
  risk: RiskTier.Green,
  sizeBytes: 1000,
  lastModified: 0,
  description: 'test item',
  ...overrides,
});

// ─── aggregateForDisplay ─────────────────────────────────────────────────────

describe('aggregateForDisplay', () => {
  it('returns empty for empty input', () => {
    expect(aggregateForDisplay([])).toEqual([]);
  });

  it('returns single group for one item', () => {
    const item = mkItem({ id: 'a', path: '/foo/a' });
    const groups = aggregateForDisplay([item]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.type).toBe('single');
    expect(groups[0]?.itemCount).toBe(1);
    expect(groups[0]?.totalBytes).toBe(1000);
  });

  it('aggregates ≥ THRESHOLD siblings sharing parent dir + metadata.kind', () => {
    const items = Array.from({ length: AGGREGATE_THRESHOLD }, (_, i) =>
      mkItem({
        id: `gz-${i}`,
        path: `/var/log/apache2/access.log.${i}.gz`,
        sizeBytes: 100,
        metadata: { kind: 'rotated-log', server: 'apache2' },
      }),
    );
    const groups = aggregateForDisplay(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.type).toBe('aggregate');
    expect(groups[0]?.itemCount).toBe(AGGREGATE_THRESHOLD);
    expect(groups[0]?.totalBytes).toBe(100 * AGGREGATE_THRESHOLD);
    expect(groups[0]?.displayPath).toBe('/var/log/apache2');
    expect(groups[0]?.items).toHaveLength(AGGREGATE_THRESHOLD);
  });

  it('keeps siblings below THRESHOLD as individual singles', () => {
    const items = Array.from({ length: AGGREGATE_THRESHOLD - 1 }, (_, i) =>
      mkItem({
        id: `gz-${i}`,
        path: `/var/log/nginx/access.log.${i}.gz`,
        metadata: { kind: 'rotated-log', server: 'nginx' },
      }),
    );
    const groups = aggregateForDisplay(items);
    expect(groups).toHaveLength(AGGREGATE_THRESHOLD - 1);
    for (const g of groups) expect(g.type).toBe('single');
  });

  it('does not merge items in different dirs even if same kind', () => {
    const items = [
      ...Array.from({ length: AGGREGATE_THRESHOLD }, (_, i) =>
        mkItem({
          id: `apache-${i}`,
          path: `/var/log/apache2/access.log.${i}.gz`,
          metadata: { kind: 'rotated-log', server: 'apache2' },
        }),
      ),
      ...Array.from({ length: AGGREGATE_THRESHOLD }, (_, i) =>
        mkItem({
          id: `nginx-${i}`,
          path: `/var/log/nginx/access.log.${i}.gz`,
          metadata: { kind: 'rotated-log', server: 'nginx' },
        }),
      ),
    ];
    const groups = aggregateForDisplay(items);
    expect(groups).toHaveLength(2);
    const dirs = groups.map((g) => g.displayPath).sort();
    expect(dirs).toEqual(['/var/log/apache2', '/var/log/nginx']);
  });

  it('does not merge items with different metadata.kind in same dir', () => {
    // Hypothetical: same dir, different "kind" values → distinct groups
    const items = [
      mkItem({ id: '1', path: '/var/log/x/a.gz', metadata: { kind: 'rotated-log' } }),
      mkItem({ id: '2', path: '/var/log/x/b.gz', metadata: { kind: 'rotated-log' } }),
      mkItem({ id: '3', path: '/var/log/x/c.gz', metadata: { kind: 'rotated-log' } }),
      mkItem({ id: '4', path: '/var/log/x/d.dump', metadata: { kind: 'crash-dump' } }),
      mkItem({ id: '5', path: '/var/log/x/e.dump', metadata: { kind: 'crash-dump' } }),
      mkItem({ id: '6', path: '/var/log/x/f.dump', metadata: { kind: 'crash-dump' } }),
    ];
    const groups = aggregateForDisplay(items);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.itemCount === 3 && g.type === 'aggregate')).toBeDefined();
  });

  it('items without metadata.kind are never aggregated (each becomes single)', () => {
    // IDE caches, gradle caches, etc. don't share a "kind" → individual rows
    const items = Array.from({ length: 5 }, (_, i) =>
      mkItem({
        id: `ide-${i}`,
        path: `/home/u/.cache/JetBrains/Rider202${i}.1`,
        // metadata absent
      }),
    );
    const groups = aggregateForDisplay(items);
    expect(groups).toHaveLength(5);
    for (const g of groups) expect(g.type).toBe('single');
  });

  it('aggregate description includes the item count', () => {
    const items = Array.from({ length: 14 }, (_, i) =>
      mkItem({
        id: `gz-${i}`,
        path: `/var/log/apache2/x.${i}.gz`,
        metadata: { kind: 'rotated-log' },
      }),
    );
    const groups = aggregateForDisplay(items);
    expect(groups[0]?.description).toMatch(/14/);
    expect(groups[0]?.description).toMatch(/rotated-log/);
  });

  // Bug #8 (dogfood beta.5): Docker items use volume names / container IDs as
  // path (not filesystem paths), so dirname() returns ".". Showing "." in the
  // aggregate row is confusing — fall back to the kind for a meaningful label.
  it('uses kind as displayPath when items have no meaningful parent dir', () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      mkItem({
        id: `vol-${i}`,
        path: `myapp_data_${i}`, // bare volume name → dirname is "."
        detector: 'docker',
        metadata: { kind: 'orphan-volume' },
      }),
    );
    const groups = aggregateForDisplay(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.type).toBe('aggregate');
    expect(groups[0]?.displayPath).not.toBe('.');
    expect(groups[0]?.displayPath).toBe('orphan-volume');
  });
});

// ─── selectTopGroups ─────────────────────────────────────────────────────────

describe('selectTopGroups', () => {
  it('returns empty selection for empty input', () => {
    const sel = selectTopGroups([], 10);
    expect(sel.shown).toEqual([]);
    expect(sel.hidden).toEqual({ groupCount: 0, itemCount: 0, totalBytes: 0 });
  });

  it('shows everything when topN exceeds group count', () => {
    const groups = aggregateForDisplay([
      mkItem({ id: 'a', path: '/a', sizeBytes: 100 }),
      mkItem({ id: 'b', path: '/b', sizeBytes: 200 }),
    ]);
    const sel = selectTopGroups(groups, 10);
    expect(sel.shown).toHaveLength(2);
    expect(sel.hidden.groupCount).toBe(0);
  });

  it('sorts groups by totalBytes desc', () => {
    const groups = aggregateForDisplay([
      mkItem({ id: 's', path: '/small', sizeBytes: 50 }),
      mkItem({ id: 'b', path: '/big', sizeBytes: 5000 }),
      mkItem({ id: 'm', path: '/med', sizeBytes: 500 }),
    ]);
    const sel = selectTopGroups(groups, 10);
    expect(sel.shown[0]?.totalBytes).toBe(5000);
    expect(sel.shown[1]?.totalBytes).toBe(500);
    expect(sel.shown[2]?.totalBytes).toBe(50);
  });

  it('summarizes hidden tail (group count, item count, bytes)', () => {
    const groups = aggregateForDisplay([
      mkItem({ id: 'a', path: '/a', sizeBytes: 5000 }),
      mkItem({ id: 'b', path: '/b', sizeBytes: 4000 }),
      mkItem({ id: 'c', path: '/c', sizeBytes: 300 }),
      mkItem({ id: 'd', path: '/d', sizeBytes: 200 }),
      mkItem({ id: 'e', path: '/e', sizeBytes: 100 }),
    ]);
    const sel = selectTopGroups(groups, 2);
    expect(sel.shown).toHaveLength(2);
    expect(sel.hidden.groupCount).toBe(3);
    expect(sel.hidden.itemCount).toBe(3);
    expect(sel.hidden.totalBytes).toBe(600);
  });

  it('hidden itemCount sums underlying items, not just group count, for aggregates', () => {
    // A hidden aggregate of 14 rotated logs counts as 14 hidden items, not 1
    const items = [
      mkItem({ id: 'big', path: '/big', sizeBytes: 99999 }),
      ...Array.from({ length: 14 }, (_, i) =>
        mkItem({
          id: `tiny-${i}`,
          path: `/var/log/x/y.${i}.gz`,
          sizeBytes: 100,
          metadata: { kind: 'rotated-log' },
        }),
      ),
    ];
    const groups = aggregateForDisplay(items);
    expect(groups).toHaveLength(2); // /big + the rotated-log aggregate
    const sel = selectTopGroups(groups, 1);
    expect(sel.shown).toHaveLength(1);
    expect(sel.hidden.groupCount).toBe(1);
    expect(sel.hidden.itemCount).toBe(14); // the aggregate's underlying items
  });
});
