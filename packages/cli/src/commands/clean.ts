import { resolve } from 'node:path';
import * as p from '@clack/prompts';
import {
  AndroidDetector,
  CocoaPodsDetector,
  DockerDetector,
  FlutterDetector,
  IdeDetector,
  NodeDetector,
  PythonDetector,
  RiskTier,
  RustDetector,
  SafetyChecker,
  Scanner,
  XcodeDetector,
  type CleanableItem,
  type DetectedProject,
  type SafetyReason,
} from '@lxmanh/shed-core';
import pc from 'picocolors';
import { verbose } from '../verbose.js';

export interface CleanOptions {
  dryRun?: boolean;
  execute?: boolean;
  hardDelete?: boolean;
  includeRed?: boolean;
  yes?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const RISK_BADGE: Record<RiskTier, string> = {
  [RiskTier.Green]: pc.green('Green '),
  [RiskTier.Yellow]: pc.yellow('Yellow'),
  [RiskTier.Red]: pc.red('Red   '),
};

export async function cleanCommand(path = '.', options: CleanOptions = {}): Promise<void> {
  const rootDir = resolve(path);
  // CLAUDE.md rule 2: dry-run is default unless --execute is explicitly passed
  const isDryRun = !options.execute;

  p.intro(pc.bgYellow(pc.black(' shed clean ')));

  if (isDryRun) {
    p.note(
      'DRY-RUN mode — no files will be deleted.\nPass --execute to perform actual cleanup.',
      'Safe mode',
    );
  }

  // ── 1. Scan ────────────────────────────────────────────────────────────────
  const spinner = p.spinner();
  verbose(`clean root: ${rootDir}, dryRun=${isDryRun}, hardDelete=${options.hardDelete ?? false}`);
  spinner.start(`Scanning ${rootDir} …`);

  const scanner = new Scanner([
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

  const ctx = { scanRoot: rootDir, maxDepth: 8 };
  const [projects, globalItems] = await Promise.all([
    scanner.scan(rootDir),
    scanner.scanGlobal(ctx),
  ]);

  const allItems = [...projects.flatMap((proj: DetectedProject) => proj.items), ...globalItems].filter(
    (i: CleanableItem) => options.includeRed || i.risk !== RiskTier.Red,
  );

  verbose(`scan complete: ${allItems.length} cleanable items`);
  spinner.stop(`Found ${pc.bold(String(allItems.length))} cleanable items.`);

  if (allItems.length === 0) {
    p.outro(pc.dim('Nothing to clean.'));
    return;
  }

  // ── 2. Safety pre-flight ──────────────────────────────────────────────────
  const checker = new SafetyChecker();
  const checkResults = await Promise.all(allItems.map((item) => checker.check(item)));

  const eligibleItems = allItems.filter((_, i) => {
    const result = checkResults[i];
    return result?.allowed ?? false;
  });

  const blockedItems = allItems.filter((_, i) => {
    const result = checkResults[i];
    return !(result?.allowed ?? false);
  });

  if (blockedItems.length > 0) {
    p.note(
      blockedItems
        .map((item) => {
          const reasons = checkResults[allItems.indexOf(item)]?.reasons ?? [];
          const blockReason = reasons.find((r: SafetyReason) => r.severity === 'block');
          return `${pc.dim(item.path)}\n  ${pc.red('✗')} ${blockReason?.message ?? 'blocked'}`;
        })
        .join('\n\n'),
      `${blockedItems.length} item(s) blocked by safety checks`,
    );
  }

  if (eligibleItems.length === 0) {
    p.outro(pc.yellow('All items were blocked by safety checks.'));
    return;
  }

  // ── 3. Interactive selection (unless --yes) ───────────────────────────────
  let selectedItems = eligibleItems;

  if (!options.yes) {
    const choices = eligibleItems.map((item) => {
      const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
      const displayPath = home ? item.path.replace(home, '~') : item.path;
      const warnings =
        checkResults[allItems.indexOf(item)]?.reasons.filter((r: SafetyReason) => r.severity === 'warning') ?? [];
      const warnStr =
        warnings.length > 0 ? pc.yellow(` ⚠ ${warnings.map((w: SafetyReason) => w.message).join('; ')}`) : '';
      return {
        value: item,
        label: `${RISK_BADGE[item.risk]}  ${displayPath}  ${pc.dim(formatBytes(item.sizeBytes))}${warnStr}`,
      };
    });

    const selection = await p.multiselect({
      message: 'Select items to clean (space to toggle, enter to confirm):',
      options: choices,
      required: false,
    });

    if (p.isCancel(selection)) {
      p.cancel('Cleanup cancelled.');
      return;
    }

    selectedItems = selection as typeof eligibleItems;
  }

  if (selectedItems.length === 0) {
    p.outro(pc.dim('Nothing selected.'));
    return;
  }

  // ── 4. Final confirmation for non-dry-run ─────────────────────────────────
  const totalBytes = selectedItems.reduce((s, i) => s + i.sizeBytes, 0);

  if (!isDryRun && !options.yes) {
    const action = options.hardDelete ? pc.red('PERMANENTLY DELETE') : 'move to Trash';
    const confirmed = await p.confirm({
      message: `${action} ${selectedItems.length} item(s) (${formatBytes(totalBytes)})?`,
      initialValue: false,
    });
    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel('Cleanup cancelled.');
      return;
    }
  }

  // ── 5. Execute ────────────────────────────────────────────────────────────
  verbose(`executing ${selectedItems.length} items, dryRun=${isDryRun}, hardDelete=${options.hardDelete ?? false}`);
  for (const item of selectedItems) verbose(`  → ${item.path}`);
  const execSpinner = p.spinner();
  execSpinner.start(isDryRun ? 'Simulating cleanup …' : 'Cleaning up …');

  const result = await checker.execute(selectedItems, {
    dryRun: isDryRun,
    hardDelete: options.hardDelete ?? false,
    includeRed: options.includeRed ?? false,
  });

  execSpinner.stop(isDryRun ? 'Dry-run complete.' : 'Cleanup complete.');

  // ── 6. Results summary ────────────────────────────────────────────────────
  if (result.succeeded.length > 0) {
    const verb = isDryRun ? 'Would free' : 'Freed';
    console.log(
      `\n  ${pc.green('✓')} ${verb} ${pc.bold(pc.green(formatBytes(result.totalBytesFreed)))} across ${result.succeeded.length} item(s).`,
    );
  }

  if (result.skipped.length > 0) {
    console.log(`  ${pc.yellow('⚠')} ${result.skipped.length} item(s) skipped.`);
    for (const s of result.skipped) {
      const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
      const displayPath = home ? s.item.path.replace(home, '~') : s.item.path;
      console.log(`    ${pc.dim(displayPath)}: ${s.reason}`);
    }
  }

  if (result.failed.length > 0) {
    console.log(`  ${pc.red('✗')} ${result.failed.length} item(s) failed:`);
    for (const f of result.failed) {
      console.log(`    ${pc.dim(f.item.path)}: ${f.error}`);
    }
  }

  console.log();
  const outro = isDryRun
    ? `Dry-run complete. Run with ${pc.cyan('--execute')} to perform actual cleanup.`
    : result.failed.length > 0
      ? `Completed with ${result.failed.length} failure(s).`
      : 'All done!';

  p.outro(outro);
}
