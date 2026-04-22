/**
 * Tests for the canonical detector registry.
 *
 * Bug #9 (dogfood beta.7): CLI `clean` and agent had hand-rolled detector
 * lists that drifted out of sync with `scan` over time. These tests are the
 * regression bar — anyone adding a new detector must register it in
 * defaultDetectors() AND list its id in the assertions below.
 */

import { describe, expect, it } from 'vitest';
import { defaultDetectors } from './index.js';

describe('defaultDetectors', () => {
  it('returns fresh instances each call (no shared state)', () => {
    const a = defaultDetectors();
    const b = defaultDetectors();
    expect(a).not.toBe(b);
    expect(a[0]).not.toBe(b[0]);
  });

  it('every detector has a unique id', () => {
    const ids = defaultDetectors().map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Snapshot of the exact id set. If a detector is added, removed, or
  // renamed, update this list — that's the explicit decision moment.
  it('matches the expected detector id set', () => {
    const ids = defaultDetectors()
      .map((d) => d.id)
      .sort();
    expect(ids).toEqual(
      [
        'android',
        'cocoapods',
        'database',
        'docker',
        'dotnet',
        'flutter',
        'go',
        'ide',
        'java-gradle',
        'java-maven',
        'node',
        'python',
        'ruby',
        'rust',
        'system',
        'webserver',
        'xcode',
      ].sort(),
    );
  });

  // Bug #9 specifically: these 8 were missing from CLI clean and agent
  // tool-executor. Explicit assertion so a future drift is caught loudly.
  it('includes Linux server / cross-stack detectors that bug #9 silently dropped', () => {
    const ids = defaultDetectors().map((d) => d.id);
    expect(ids).toContain('go');
    expect(ids).toContain('java-maven');
    expect(ids).toContain('java-gradle');
    expect(ids).toContain('ruby');
    expect(ids).toContain('dotnet');
    expect(ids).toContain('system');
    expect(ids).toContain('webserver');
    expect(ids).toContain('database');
  });
});
