/**
 * Tests for DockerDetector.
 *
 * Per CLAUDE.md rule 3: tests written BEFORE implementation.
 *
 * Docker CLI is not guaranteed to be present in CI, so all docker subprocess
 * calls are mocked via vi.mock. This keeps tests fast and hermetic.
 */

import { describe, expect, it, vi } from 'vitest';
import { RiskTier } from '../safety/risk-tiers.js';
import type { DetectorContext } from './detector.js';
import { DockerDetector } from './docker-detector.js';

// Mock execa so no real Docker CLI is called
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';

const mockExeca = vi.mocked(execa);

const ctx: DetectorContext = { scanRoot: '/', maxDepth: 5 };

// ─── quickProbe / analyze ─────────────────────────────────────────────────────

describe('DockerDetector.quickProbe', () => {
  it('always returns false — Docker has no project dir concept', async () => {
    expect(await new DockerDetector().quickProbe('/any/path')).toBe(false);
  });
});

describe('DockerDetector.analyze', () => {
  it('always returns null', async () => {
    expect(await new DockerDetector().analyze('/any/path', ctx)).toBeNull();
  });
});

// ─── scanGlobal — docker unavailable ─────────────────────────────────────────

describe('DockerDetector.scanGlobal — docker unavailable', () => {
  it('returns empty array when docker CLI is not found', async () => {
    mockExeca.mockRejectedValueOnce(
      Object.assign(new Error('spawn docker ENOENT'), { code: 'ENOENT' }),
    );
    const items = await new DockerDetector().scanGlobal(ctx);
    expect(items).toHaveLength(0);
  });

  it('returns empty array when docker daemon is not running', async () => {
    mockExeca.mockRejectedValueOnce(
      Object.assign(new Error('Cannot connect to the Docker daemon'), { exitCode: 1 }),
    );
    const items = await new DockerDetector().scanGlobal(ctx);
    expect(items).toHaveLength(0);
  });
});

// ─── scanGlobal — dangling images ─────────────────────────────────────────────

describe('DockerDetector.scanGlobal — dangling images', () => {
  it('returns a Green item for each dangling image', async () => {
    mockExeca.mockResolvedValueOnce({
      stdout: JSON.stringify([
        { ID: 'sha256:abc123', Repository: '<none>', Tag: '<none>', Size: '200MB' },
        { ID: 'sha256:def456', Repository: '<none>', Tag: '<none>', Size: '150MB' },
      ]),
      exitCode: 0,
    } as never);
    // second call: stopped containers → empty
    mockExeca.mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as never);
    // third call: build cache → empty
    mockExeca.mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as never);
    // fourth call: orphan volumes ls → empty
    mockExeca.mockResolvedValueOnce({ stdout: '', exitCode: 0 } as never);

    const items = await new DockerDetector().scanGlobal(ctx);
    const imageItems = items.filter((i) => i.metadata?.kind === 'dangling-image');
    expect(imageItems.length).toBe(2);
    for (const item of imageItems) {
      expect(item.risk).toBe(RiskTier.Green);
      expect(item.detector).toBe('docker');
    }
  });

  it('skips images that are not dangling (have a tag)', async () => {
    mockExeca.mockResolvedValueOnce({
      stdout: JSON.stringify([
        { ID: 'sha256:abc123', Repository: 'nginx', Tag: 'latest', Size: '200MB' },
      ]),
      exitCode: 0,
    } as never);
    mockExeca.mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as never);
    mockExeca.mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as never);
    mockExeca.mockResolvedValueOnce({ stdout: '', exitCode: 0 } as never);

    const items = await new DockerDetector().scanGlobal(ctx);
    expect(items.filter((i) => i.metadata?.kind === 'dangling-image')).toHaveLength(0);
  });
});

// ─── scanGlobal — stopped containers ─────────────────────────────────────────

describe('DockerDetector.scanGlobal — stopped containers', () => {
  it('returns a Green item for each stopped container', async () => {
    mockExeca.mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as never); // images
    mockExeca.mockResolvedValueOnce({
      stdout: JSON.stringify([
        { ID: 'c1abc', Names: 'my_app', Size: '50MB', Status: 'Exited (0) 3 days ago' },
      ]),
      exitCode: 0,
    } as never);
    mockExeca.mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as never); // build cache
    mockExeca.mockResolvedValueOnce({ stdout: '', exitCode: 0 } as never); // volumes

    const items = await new DockerDetector().scanGlobal(ctx);
    const containerItems = items.filter((i) => i.metadata?.kind === 'stopped-container');
    expect(containerItems).toHaveLength(1);
    expect(containerItems[0]?.risk).toBe(RiskTier.Green);
  });
});

// ─── scanGlobal — build cache ─────────────────────────────────────────────────

describe('DockerDetector.scanGlobal — build cache', () => {
  it('returns a single Green item summarising total build cache', async () => {
    mockExeca.mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as never); // images
    mockExeca.mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as never); // containers
    mockExeca.mockResolvedValueOnce({
      stdout: JSON.stringify([
        { ID: 'b1', Type: 'regular', Size: '300MB', InUse: false },
        { ID: 'b2', Type: 'regular', Size: '100MB', InUse: false },
      ]),
      exitCode: 0,
    } as never);
    mockExeca.mockResolvedValueOnce({ stdout: '', exitCode: 0 } as never); // volumes

    const items = await new DockerDetector().scanGlobal(ctx);
    const cacheItems = items.filter((i) => i.metadata?.kind === 'build-cache');
    expect(cacheItems).toHaveLength(1);
    expect(cacheItems[0]?.risk).toBe(RiskTier.Green);
  });

  it('skips build cache entries that are in use', async () => {
    mockExeca.mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as never);
    mockExeca.mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as never);
    mockExeca.mockResolvedValueOnce({
      stdout: JSON.stringify([{ ID: 'b1', Type: 'regular', Size: '300MB', InUse: true }]),
      exitCode: 0,
    } as never);
    mockExeca.mockResolvedValueOnce({ stdout: '', exitCode: 0 } as never); // volumes

    const items = await new DockerDetector().scanGlobal(ctx);
    expect(items.filter((i) => i.metadata?.kind === 'build-cache')).toHaveLength(0);
  });
});

// ─── scanGlobal — orphan volumes ──────────────────────────────────────────────

describe('DockerDetector.scanGlobal — orphan volumes', () => {
  const OLD_DATE = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  const NEW_DATE = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

  it('returns a Yellow item for orphan volumes older than 30 days', async () => {
    mockExeca.mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as never); // images
    mockExeca.mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as never); // containers
    mockExeca.mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as never); // build cache
    // volumes ls
    mockExeca.mockResolvedValueOnce({
      stdout: JSON.stringify([{ Name: 'myapp_data', Driver: 'local', Scope: 'local' }]),
      exitCode: 0,
    } as never);
    // volumes inspect
    mockExeca.mockResolvedValueOnce({
      stdout: JSON.stringify([
        {
          Name: 'myapp_data',
          Mountpoint: '/var/lib/docker/volumes/myapp_data/_data',
          CreatedAt: OLD_DATE,
        },
      ]),
      exitCode: 0,
    } as never);

    const items = await new DockerDetector().scanGlobal(ctx);
    const vol = items.find((i) => i.metadata?.kind === 'orphan-volume');
    expect(vol).toBeDefined();
    expect(vol?.risk).toBe(RiskTier.Yellow);
    expect(vol?.metadata?.volumeName).toBe('myapp_data');
    // path must be volume name, NOT mountpoint — prevents direct filesystem deletion
    expect(vol?.path).toBe('myapp_data');
  });

  it('skips orphan volumes newer than 30 days', async () => {
    mockExeca.mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as never);
    mockExeca.mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as never);
    mockExeca.mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as never);
    mockExeca.mockResolvedValueOnce({
      stdout: JSON.stringify([{ Name: 'fresh_vol', Driver: 'local', Scope: 'local' }]),
      exitCode: 0,
    } as never);
    mockExeca.mockResolvedValueOnce({
      stdout: JSON.stringify([
        {
          Name: 'fresh_vol',
          Mountpoint: '/var/lib/docker/volumes/fresh_vol/_data',
          CreatedAt: NEW_DATE,
        },
      ]),
      exitCode: 0,
    } as never);

    const items = await new DockerDetector().scanGlobal(ctx);
    expect(items.find((i) => i.metadata?.kind === 'orphan-volume')).toBeUndefined();
  });

  it('returns empty when no orphan volumes exist', async () => {
    mockExeca.mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as never);
    mockExeca.mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as never);
    mockExeca.mockResolvedValueOnce({ stdout: '[]', exitCode: 0 } as never);
    mockExeca.mockResolvedValueOnce({ stdout: '', exitCode: 0 } as never); // no volumes

    const items = await new DockerDetector().scanGlobal(ctx);
    expect(items.find((i) => i.metadata?.kind === 'orphan-volume')).toBeUndefined();
  });
});
