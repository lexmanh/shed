#!/usr/bin/env node
/**
 * Shed CLI entry point.
 *
 * This file is thin — it parses args and delegates to commands.
 * Commands delegate to @lxmanh/shed-core.
 * Never call fs.rm or rimraf here (CLAUDE.md rule 1).
 */

import { createRequire } from 'node:module';
import { Command } from 'commander';
import { cleanCommand } from './commands/clean.js';
import { configCommand } from './commands/config.js';
import { doctorCommand } from './commands/doctor.js';
import { scanCommand } from './commands/scan.js';
import { undoCommand } from './commands/undo.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

import { setVerbose } from './verbose.js';
import { printLogo } from './logo.js';

const program = new Command();

program
  .name('shed')
  .description('Safe, cross-platform disk cleanup for developers')
  .version(version)
  .option('-v, --verbose', 'Enable verbose logging');

program
  .command('scan [path]')
  .description('Scan for cleanable items without modifying anything')
  .option('--json', 'Output machine-readable JSON')
  .option('--max-age <days>', 'Only include items older than N days', '30')
  .action(scanCommand);

program
  .command('clean [path]')
  .description('Interactive cleanup of detected items')
  .option('--dry-run', 'Preview operations without executing', true)
  .option('--execute', 'Actually perform the cleanup (overrides --dry-run)')
  .option('--hard-delete', 'Skip Trash, delete permanently')
  .option('--include-red', 'Include Red-tier (high-risk) items')
  .option('--yes', 'Skip interactive confirmations (CI mode)')
  .action(cleanCommand);

program
  .command('undo')
  .description('List and restore items from previous cleanups')
  .action(undoCommand);

program.command('doctor').description('Check environment and configuration').action(doctorCommand);

program
  .command('config')
  .description('Manage user preferences')
  .argument('[action]', 'get | set | list | reset')
  .argument('[key]', 'Configuration key')
  .argument('[value]', 'Configuration value (for set)')
  .action(configCommand);

program.hook('preAction', (_thisCommand, actionCommand) => {
  const opts = program.opts<{ verbose?: boolean }>();
  setVerbose(opts.verbose ?? false);
  // Skip logo for --json mode
  const cmdOpts = actionCommand.opts<{ json?: boolean }>();
  if (!cmdOpts.json) printLogo(version);
});

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error('shed: fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
