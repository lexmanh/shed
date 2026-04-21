import { createRequire } from 'node:module';
import { hostname } from 'node:os';
import { resolve } from 'node:path';
import * as p from '@clack/prompts';
import {
  AndroidDetector,
  type CleanableItem,
  CocoaPodsDetector,
  DatabaseDetector,
  type DetectedProject,
  DockerDetector,
  DotnetDetector,
  FlutterDetector,
  GoDetector,
  IdeDetector,
  JavaGradleDetector,
  JavaMavenDetector,
  NodeDetector,
  PythonDetector,
  RiskTier,
  RubyDetector,
  RustDetector,
  Scanner,
  SystemDetector,
  WebserverDetector,
  XcodeDetector,
} from '@lexmanh/shed-core';
import pc from 'picocolors';
import { verbose } from '../verbose.js';

const require = createRequire(import.meta.url);
const { version: SHED_VERSION } = require('../package.json') as { version: string };
const JSON_SCHEMA_VERSION = 1;

export interface ScanOptions {
  json?: boolean;
  maxAge?: string;
}

const RISK_LABEL: Record<RiskTier, string> = {
  [RiskTier.Green]: pc.green('● Green'),
  [RiskTier.Yellow]: pc.yellow('● Yellow'),
  [RiskTier.Red]: pc.red('● Red'),
};

const RISK_ORDER: Record<RiskTier, number> = {
  [RiskTier.Red]: 0,
  [RiskTier.Yellow]: 1,
  [RiskTier.Green]: 2,
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export async function scanCommand(path = '.', options: ScanOptions = {}): Promise<void> {
  const rootDir = resolve(path);

  if (!options.json) {
    p.intro(pc.bgCyan(pc.black(' shed scan ')));
  }

  const spinner = options.json ? null : p.spinner();
  verbose(`scan root: ${rootDir}`);
  spinner?.start(`Scanning ${rootDir} …`);

  const scanStartedAt = Date.now();

  const scanner = new Scanner([
    new NodeDetector(),
    new PythonDetector(),
    new RustDetector(),
    new GoDetector(),
    new JavaMavenDetector(),
    new JavaGradleDetector(),
    new RubyDetector(),
    new DotnetDetector(),
    new DockerDetector(),
    new XcodeDetector(),
    new FlutterDetector(),
    new AndroidDetector(),
    new CocoaPodsDetector(),
    new IdeDetector(),
    new SystemDetector(),
    new WebserverDetector(),
    new DatabaseDetector(),
  ]);

  const ctx = { scanRoot: rootDir, maxDepth: 8 };

  const [projects, globalItems] = await Promise.all([
    scanner.scan(rootDir),
    scanner.scanGlobal(ctx),
  ]);

  const allItems = [
    ...projects.flatMap((proj: DetectedProject) => proj.items),
    ...globalItems,
  ].sort((a: CleanableItem, b: CleanableItem) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk]);

  const totalBytes = allItems.reduce((sum, i) => sum + i.sizeBytes, 0);

  verbose(
    `scan complete: ${projects.length} projects, ${globalItems.length} global items, ${allItems.length} total`,
  );
  for (const item of allItems)
    verbose(`  item: ${item.risk} ${item.path} (${item.sizeBytes} bytes)`);
  spinner?.stop(
    `Found ${pc.bold(String(allItems.length))} cleanable items across ${projects.length} project(s).`,
  );

  if (options.json) {
    const byRisk = { green: 0, yellow: 0, red: 0 };
    let detectOnly = 0;
    for (const item of allItems) {
      byRisk[item.risk]++;
      if (item.metadata?.detectOnly === true) detectOnly++;
    }

    const projectsOut = projects.map((proj: DetectedProject) => ({
      root: proj.root,
      detectors: [...new Set(proj.items.map((i) => i.detector))],
      itemCount: proj.items.length,
      totalBytes: proj.items.reduce((s, i) => s + i.sizeBytes, 0),
    }));

    console.log(
      JSON.stringify(
        {
          schemaVersion: JSON_SCHEMA_VERSION,
          shedVersion: SHED_VERSION,
          timestamp: new Date(scanStartedAt).toISOString(),
          host: {
            hostname: hostname(),
            platform: process.platform,
            arch: process.arch,
          },
          scan: {
            root: rootDir,
            durationMs: Date.now() - scanStartedAt,
          },
          summary: {
            totalBytes,
            totalItems: allItems.length,
            byRisk,
            detectOnly,
          },
          projects: projectsOut,
          items: allItems,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (allItems.length === 0) {
    p.note('Nothing found to clean in this directory.', 'Result');
    p.outro(pc.dim('All clear!'));
    return;
  }

  // Group by project root (or "global" for non-project items)
  const byProject = new Map<string, typeof allItems>();
  for (const item of allItems) {
    const key = item.projectRoot ?? '(global)';
    const group = byProject.get(key) ?? [];
    group.push(item);
    byProject.set(key, group);
  }

  for (const [projectRoot, items] of byProject.entries()) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
    const projectLabel =
      projectRoot === '(global)'
        ? pc.dim('global caches')
        : pc.cyan(home ? projectRoot.replace(home, '~') : projectRoot);

    const groupTotal = items.reduce((s, i) => s + i.sizeBytes, 0);
    console.log(`\n  ${projectLabel}  ${pc.dim(formatBytes(groupTotal))}`);

    for (const item of items) {
      const size = item.sizeBytes > 0 ? pc.dim(` ${formatBytes(item.sizeBytes)}`) : '';
      const displayPath = home ? item.path.replace(home, '~') : item.path;
      const shortPath =
        projectRoot !== '(global)'
          ? displayPath
              .replace(home ? projectRoot.replace(home, '~') : projectRoot, '')
              .replace(/^\//, '') || displayPath
          : displayPath;
      console.log(`    ${RISK_LABEL[item.risk]}  ${shortPath}${size}`);
      console.log(`    ${pc.dim(`       ${item.description}`)}`);
    }
  }

  console.log();
  p.outro(
    `Total recoverable: ${pc.bold(pc.green(formatBytes(totalBytes)))} — run ${pc.cyan('shed clean')} to proceed.`,
  );
}
