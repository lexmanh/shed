/**
 * Aggregation helpers for `shed scan` compact output.
 *
 * Detectors emit one CleanableItem per file for safety (so SafetyChecker can
 * delete each file precisely — webserver-detector.ts has a comment explaining
 * why per-file is required). That's correct for cleanup but produces 700+
 * lines on real systems (dogfood manhlx-vpt-01: 14 rotated-log items in one
 * apache2 dir, each 500B–7KB).
 *
 * This module collapses sibling items at display time only. The underlying
 * CleanableItems remain available via DisplayGroup.items for `--all` mode and
 * downstream cleanup.
 */

import { dirname } from 'node:path';
import type { CleanableItem, RiskTier } from '@lexmanh/shed-core';

export const AGGREGATE_THRESHOLD = 3;

export interface DisplayGroup {
  readonly type: 'single' | 'aggregate';
  readonly risk: RiskTier;
  readonly displayPath: string;
  readonly description: string;
  readonly totalBytes: number;
  readonly detector: string;
  readonly itemCount: number;
  readonly items: readonly CleanableItem[];
}

export interface TopSelection {
  readonly shown: readonly DisplayGroup[];
  readonly hidden: {
    readonly groupCount: number;
    readonly itemCount: number;
    readonly totalBytes: number;
  };
}

export function aggregateForDisplay(items: readonly CleanableItem[]): DisplayGroup[] {
  // Bucket items by (parentDir, detector, kind). Items without metadata.kind
  // are emitted as singles — they typically come from detectors that already
  // surface one row per logical artifact (IDE caches, gradle caches, etc.).
  const buckets = new Map<string, CleanableItem[]>();
  const singles: CleanableItem[] = [];

  for (const item of items) {
    const kind = (item.metadata?.kind as string | undefined) ?? null;
    if (!kind) {
      singles.push(item);
      continue;
    }
    const key = `${dirname(item.path)}::${item.detector}::${kind}`;
    const arr = buckets.get(key) ?? [];
    arr.push(item);
    buckets.set(key, arr);
  }

  const result: DisplayGroup[] = [];

  for (const arr of buckets.values()) {
    if (arr.length >= AGGREGATE_THRESHOLD) {
      const first = arr[0];
      if (!first) continue;
      const totalBytes = arr.reduce((s, i) => s + i.sizeBytes, 0);
      const kind = first.metadata?.kind as string;
      // Bug #8 (dogfood beta.5): Docker items use volume names / container IDs
      // as path (not filesystem paths), so dirname() returns ".". Fall back to
      // the kind for a meaningful label instead of showing a literal ".".
      const parentDir = dirname(first.path);
      const displayPath = parentDir === '.' ? kind : parentDir;
      result.push({
        type: 'aggregate',
        risk: first.risk,
        displayPath,
        description: `${arr.length} ${kind} files`,
        totalBytes,
        detector: first.detector,
        itemCount: arr.length,
        items: arr,
      });
    } else {
      for (const item of arr) result.push(toSingle(item));
    }
  }

  for (const item of singles) result.push(toSingle(item));

  return result;
}

function toSingle(item: CleanableItem): DisplayGroup {
  return {
    type: 'single',
    risk: item.risk,
    displayPath: item.path,
    description: item.description,
    totalBytes: item.sizeBytes,
    detector: item.detector,
    itemCount: 1,
    items: [item],
  };
}

export function selectTopGroups(groups: readonly DisplayGroup[], topN: number): TopSelection {
  const sorted = [...groups].sort((a, b) => b.totalBytes - a.totalBytes);
  const shown = sorted.slice(0, topN);
  const rest = sorted.slice(topN);
  return {
    shown,
    hidden: {
      groupCount: rest.length,
      itemCount: rest.reduce((s, g) => s + g.itemCount, 0),
      totalBytes: rest.reduce((s, g) => s + g.totalBytes, 0),
    },
  };
}
