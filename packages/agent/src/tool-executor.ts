/**
 * ToolExecutor — bridges AI tool calls to shed-core Scanner.
 * All operations are READ-ONLY. AI cannot trigger cleanup.
 */

import {
  AndroidDetector,
  CocoaPodsDetector,
  DockerDetector,
  FlutterDetector,
  IdeDetector,
  NodeDetector,
  PythonDetector,
  RustDetector,
  SafetyChecker,
  Scanner,
  XcodeDetector,
} from '@lexmanh/shed-core';
import type { CleanableItem } from '@lexmanh/shed-core';
import { execa } from 'execa';

function makeScanner(): Scanner {
  return new Scanner([
    new NodeDetector(),
    new PythonDetector(),
    new RustDetector(),
    new DockerDetector(),
    new XcodeDetector(),
    new FlutterDetector(),
    new AndroidDetector(),
    new CocoaPodsDetector(),
    new IdeDetector(),
  ]);
}

export type ToolResult = Record<string, unknown>;

export async function executeToolCall(
  name: string,
  input: Record<string, unknown>,
  allScannedItems?: readonly CleanableItem[],
): Promise<ToolResult> {
  switch (name) {
    case 'list_projects': {
      const root = (input.root as string) ?? process.env.HOME ?? '/';
      const maxDepth = (input.maxDepth as number) ?? 5;
      const scanner = makeScanner();
      const ctx = { scanRoot: root, maxDepth };
      const [projects, globalItems] = await Promise.all([
        scanner.scan(root),
        scanner.scanGlobal(ctx),
      ]);
      return {
        root,
        projectCount: projects.length,
        projects: projects.map((p) => ({
          root: p.root,
          type: p.type,
          name: p.name,
          lastModified: p.lastModified,
          cleanableItems: p.items.length,
          totalBytes: p.items.reduce((s, i) => s + i.sizeBytes, 0),
        })),
        globalItemCount: globalItems.length,
        globalTotalBytes: globalItems.reduce((s, i) => s + i.sizeBytes, 0),
      };
    }

    case 'analyze_project': {
      const path = input.path as string;
      const scanner = makeScanner();
      const ctx = { scanRoot: path, maxDepth: 3 };
      const projects = await scanner.scan(path);
      const project = projects.find((p) => p.root === path) ?? projects[0];
      if (!project) return { error: `No project detected at ${path}` };

      const checker = new SafetyChecker();
      const checkResults = await Promise.all(project.items.map((i) => checker.check(i)));

      return {
        root: project.root,
        type: project.type,
        name: project.name,
        hasGit: project.hasGit,
        lastModified: project.lastModified,
        items: project.items.map((item, idx) => ({
          id: item.id,
          path: item.path,
          risk: item.risk,
          sizeBytes: item.sizeBytes,
          description: item.description,
          safetyAllowed: checkResults[idx]?.allowed ?? false,
          safetyReasons: checkResults[idx]?.reasons ?? [],
        })),
        // scanGlobal not relevant per-project
        ctx,
      };
    }

    case 'estimate_cleanup': {
      const itemIds = (input.itemIds as string[]) ?? [];
      if (!allScannedItems) {
        return { error: 'No scan context available. Run list_projects first.' };
      }
      const targets = allScannedItems.filter((i) => itemIds.includes(i.id));
      const checker = new SafetyChecker();
      const results = await Promise.all(targets.map((i) => checker.check(i)));
      const allowed = targets.filter((_, idx) => results[idx]?.allowed);
      const blocked = targets.filter((_, idx) => !results[idx]?.allowed);
      return {
        totalRequested: targets.length,
        allowedCount: allowed.length,
        blockedCount: blocked.length,
        estimatedBytesFreed: allowed.reduce((s, i) => s + i.sizeBytes, 0),
        blocked: blocked.map((i) => ({
          id: i.id,
          path: i.path,
          reason: results[targets.indexOf(i)]?.reasons.find((r) => r.severity === 'block')?.message,
        })),
      };
    }

    case 'get_disk_usage': {
      const checkPath = (input.path as string) ?? process.env.HOME ?? '/';
      try {
        const { stdout } = await execa('df', ['-k', checkPath]);
        const lines = stdout.trim().split('\n');
        const parts = lines[1]?.split(/\s+/) ?? [];
        const totalKb = Number.parseInt(parts[1] ?? '0', 10);
        const usedKb = Number.parseInt(parts[2] ?? '0', 10);
        const availKb = Number.parseInt(parts[3] ?? '0', 10);
        return {
          path: checkPath,
          totalBytes: totalKb * 1024,
          usedBytes: usedKb * 1024,
          freeBytes: availKb * 1024,
          usedPercent: totalKb > 0 ? Math.round((usedKb / totalKb) * 100) : 0,
        };
      } catch {
        return { error: 'Could not read disk usage' };
      }
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
