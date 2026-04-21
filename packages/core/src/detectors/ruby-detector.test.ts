import { join } from 'node:path';
import { createFixture } from 'fs-fixture';
import { describe, expect, it } from 'vitest';
import { RiskTier } from '../safety/risk-tiers.js';
import type { DetectorContext } from './detector.js';
import { RubyDetector } from './ruby-detector.js';

const ctx: DetectorContext = { scanRoot: '/', maxDepth: 5 };

describe('RubyDetector.quickProbe', () => {
  it('returns true when Gemfile exists', async () => {
    const fix = await createFixture({ Gemfile: 'source "https://rubygems.org"' });
    try {
      expect(await new RubyDetector().quickProbe(fix.path)).toBe(true);
    } finally {
      await fix.rm();
    }
  });

  it('returns false when Gemfile absent', async () => {
    const fix = await createFixture({ 'package.json': '{}' });
    try {
      expect(await new RubyDetector().quickProbe(fix.path)).toBe(false);
    } finally {
      await fix.rm();
    }
  });
});

describe('RubyDetector.analyze', () => {
  it('returns null when Gemfile absent', async () => {
    const fix = await createFixture({});
    try {
      expect(await new RubyDetector().analyze(fix.path, ctx)).toBeNull();
    } finally {
      await fix.rm();
    }
  });

  it('returns type=ruby', async () => {
    const fix = await createFixture({ Gemfile: 'source "https://rubygems.org"' });
    try {
      expect((await new RubyDetector().analyze(fix.path, ctx))?.type).toBe('ruby');
    } finally {
      await fix.rm();
    }
  });

  it('returns vendor/bundle as Yellow when present', async () => {
    const fix = await createFixture({
      Gemfile: 'source "https://rubygems.org"',
      'vendor/bundle/ruby/3.2.0/gems/rack-3.0.0/rack.gemspec': '',
    });
    try {
      const result = await new RubyDetector().analyze(fix.path, ctx);
      const vendor = result?.items.find((i) => i.path === join(fix.path, 'vendor', 'bundle'));
      expect(vendor?.risk).toBe(RiskTier.Yellow);
    } finally {
      await fix.rm();
    }
  });

  it('returns no items when vendor/bundle absent', async () => {
    const fix = await createFixture({ Gemfile: 'source "https://rubygems.org"' });
    try {
      expect((await new RubyDetector().analyze(fix.path, ctx))?.items).toHaveLength(0);
    } finally {
      await fix.rm();
    }
  });
});

describe('RubyDetector.scanGlobal', () => {
  it('returns .bundle/cache as Green when present', async () => {
    const fix = await createFixture({ '.bundle/cache/compact_index/rubygems.org/info/rack': '' });
    try {
      const items = await new RubyDetector({ homeDir: fix.path }).scanGlobal(ctx);
      expect(items.length).toBeGreaterThan(0);
      expect(items[0]?.risk).toBe(RiskTier.Green);
    } finally {
      await fix.rm();
    }
  });

  it('returns empty when cache absent', async () => {
    const fix = await createFixture({});
    try {
      expect(await new RubyDetector({ homeDir: fix.path }).scanGlobal(ctx)).toHaveLength(0);
    } finally {
      await fix.rm();
    }
  });
});
