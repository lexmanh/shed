/**
 * DockerDetector — detects cleanable Docker artifacts via the Docker CLI.
 *
 * Does NOT scan project directories (quickProbe always returns false).
 * Queries the Docker daemon via `docker` CLI for:
 * - Dangling images (no tag, not referenced by any container)
 * - Stopped containers
 * - Unused build cache entries
 *
 * All items are Green: Docker regenerates / re-pulls them on demand.
 *
 * If the Docker CLI is absent or daemon is unreachable, returns silently empty.
 */

import { execa } from 'execa';
import { RiskTier } from '../safety/risk-tiers.js';
import type { CleanableItem, DetectedProject } from '../types.js';
import { BaseDetector, type DetectorContext } from './detector.js';

interface DockerImage {
  ID: string;
  Repository: string;
  Tag: string;
  Size: string;
}

interface DockerContainer {
  ID: string;
  Names: string;
  Size: string;
  Status: string;
}

interface DockerBuildCache {
  ID: string;
  Type: string;
  Size: string;
  InUse: boolean;
}

interface DockerVolume {
  Name: string;
  Driver: string;
  Scope: string;
}

interface DockerVolumeDetail {
  Name: string;
  Mountpoint: string;
  CreatedAt: string;
}

function parseDockerSize(sizeStr: string | undefined): number {
  if (!sizeStr) return 0;
  // Anchorless: handles "50MB", "50MB (virtual 200MB)", "1.234GB", "0B".
  // First numeric+unit token wins — e.g. for `docker container ls --size`,
  // the leading value is the writable layer (the part actually freed on prune).
  const match = /([\d.]+)\s*(B|kB|KB|MB|GB|TB)/i.exec(sizeStr);
  if (!match) return 0;
  const value = Number.parseFloat(match[1] ?? '0');
  const unit = (match[2] ?? 'B').toUpperCase();
  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1000,
    MB: 1000 * 1000,
    GB: 1000 * 1000 * 1000,
    TB: 1000 * 1000 * 1000 * 1000,
  };
  return Math.round(value * (multipliers[unit] ?? 1));
}

export class DockerDetector extends BaseDetector {
  readonly id = 'docker';
  readonly displayName = 'Docker';

  async quickProbe(_dir: string): Promise<boolean> {
    return false;
  }

  async analyze(_dir: string, _ctx: DetectorContext): Promise<DetectedProject | null> {
    return null;
  }

  override async scanGlobal(_ctx: DetectorContext): Promise<readonly CleanableItem[]> {
    const [images, containers, buildCache, volumes] = await Promise.all([
      this.listDanglingImages(),
      this.listStoppedContainers(),
      this.listUnusedBuildCache(),
      this.listOrphanVolumes(),
    ]);
    return [...images, ...containers, ...buildCache, ...volumes];
  }

  private async listDanglingImages(): Promise<CleanableItem[]> {
    try {
      const { stdout } = await execa(
        'docker',
        ['image', 'ls', '--format', '{{json .}}', '--filter', 'dangling=true'],
        { reject: false, timeout: 10000 },
      );
      if (!stdout.trim()) return [];
      // docker outputs one JSON object per line OR a JSON array depending on version
      const items = this.parseDockerJson<DockerImage>(stdout);
      return items
        .filter((img) => img.Repository === '<none>' || img.Tag === '<none>')
        .map((img) => ({
          id: `docker::image::${img.ID}`,
          path: img.ID,
          detector: this.id,
          risk: RiskTier.Green,
          sizeBytes: parseDockerSize(img.Size),
          lastModified: Date.now(),
          description: `Dangling Docker image ${img.ID.slice(0, 12)} — remove with \`docker image prune\``,
          metadata: { kind: 'dangling-image', imageId: img.ID },
        }));
    } catch {
      return [];
    }
  }

  private async listStoppedContainers(): Promise<CleanableItem[]> {
    try {
      // --size populates Container.Size (writable layer + virtual). Without it,
      // docker omits Size entirely and parseDockerSize returns 0.
      const { stdout } = await execa(
        'docker',
        [
          'container',
          'ls',
          '--all',
          '--size',
          '--format',
          '{{json .}}',
          '--filter',
          'status=exited',
        ],
        { reject: false, timeout: 10000 },
      );
      if (!stdout.trim()) return [];
      const items = this.parseDockerJson<DockerContainer>(stdout);
      return items.map((c) => ({
        id: `docker::container::${c.ID}`,
        path: c.ID,
        detector: this.id,
        risk: RiskTier.Green,
        sizeBytes: parseDockerSize(c.Size),
        lastModified: Date.now(),
        description: `Stopped container "${c.Names}" (${c.Status}) — remove with \`docker container prune\``,
        metadata: { kind: 'stopped-container', containerId: c.ID },
      }));
    } catch {
      return [];
    }
  }

  private async listUnusedBuildCache(): Promise<CleanableItem[]> {
    try {
      const { stdout } = await execa(
        'docker',
        ['buildx', 'du', '--verbose', '--format', '{{json .}}'],
        { reject: false, timeout: 15000 },
      );
      if (!stdout.trim()) return [];
      const entries = this.parseDockerJson<DockerBuildCache>(stdout);
      const unused = entries.filter((e) => !e.InUse);
      if (unused.length === 0) return [];
      const totalBytes = unused.reduce((sum, e) => sum + parseDockerSize(e.Size), 0);
      return [
        {
          id: 'docker::build-cache',
          path: 'docker-build-cache',
          detector: this.id,
          risk: RiskTier.Green,
          sizeBytes: totalBytes,
          lastModified: Date.now(),
          description: `Docker build cache (${unused.length} unused entries) — remove with \`docker buildx prune\``,
          metadata: { kind: 'build-cache', entryCount: unused.length },
        },
      ];
    } catch {
      return [];
    }
  }

  private async listOrphanVolumes(): Promise<CleanableItem[]> {
    try {
      const { stdout: listOut } = await execa(
        'docker',
        ['volume', 'ls', '--filter', 'dangling=true', '--format', '{{json .}}'],
        { reject: false, timeout: 10000 },
      );
      if (!listOut.trim()) return [];
      const volumes = this.parseDockerJson<DockerVolume>(listOut);
      if (volumes.length === 0) return [];

      const names = volumes.map((v) => v.Name);
      const { stdout: inspectOut } = await execa('docker', ['volume', 'inspect', ...names], {
        reject: false,
        timeout: 10000,
      });
      const details = JSON.parse(inspectOut) as DockerVolumeDetail[];

      // Bug #2 (dogfood 2026-04-22): `docker volume inspect` does not include
      // size, and using `du` on the mountpoint requires root. `docker system df -v`
      // surfaces per-volume sizes from Docker's own metadata, no sudo needed.
      const sizeByName = await this.fetchVolumeSizes();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

      // path uses volume name (not mountpoint) — consistent with other Docker items
      // (image IDs, container IDs). Prevents SafetyChecker from trashing the raw
      // /var/lib/docker/volumes/ path directly, which would bypass Docker's state.
      return details
        .filter((d) => Date.now() - new Date(d.CreatedAt).getTime() > thirtyDaysMs)
        .map((d) => ({
          id: `docker::volume::${d.Name}`,
          path: d.Name,
          detector: this.id,
          risk: RiskTier.Yellow,
          sizeBytes: sizeByName.get(d.Name) ?? 0,
          lastModified: new Date(d.CreatedAt).getTime(),
          description: `Orphan Docker volume "${d.Name}" (not attached to any container) — remove with \`docker volume rm ${d.Name}\``,
          metadata: { kind: 'orphan-volume', volumeName: d.Name },
        }));
    } catch {
      return [];
    }
  }

  private async fetchVolumeSizes(): Promise<Map<string, number>> {
    try {
      const { stdout } = await execa('docker', ['system', 'df', '-v', '--format', '{{json .}}'], {
        reject: false,
        timeout: 10000,
      });
      if (!stdout.trim()) return new Map();
      const parsed = JSON.parse(stdout) as { Volumes?: Array<{ Name: string; Size: string }> };
      const map = new Map<string, number>();
      for (const v of parsed.Volumes ?? []) {
        map.set(v.Name, parseDockerSize(v.Size));
      }
      return map;
    } catch {
      return new Map();
    }
  }

  private parseDockerJson<T>(stdout: string): T[] {
    const text = stdout.trim();
    if (!text) return [];
    // Try JSON array first (some docker versions)
    if (text.startsWith('[')) {
      try {
        return JSON.parse(text) as T[];
      } catch {
        return [];
      }
    }
    // NDJSON: one object per line
    const results: T[] = [];
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        results.push(JSON.parse(trimmed) as T);
      } catch {
        /* skip malformed line */
      }
    }
    return results;
  }
}
