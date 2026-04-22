#!/usr/bin/env node
/**
 * Shed CLI entry point.
 *
 * This file is thin — it parses args and delegates to commands.
 * Commands delegate to @lexmanh/shed-core.
 * Never call fs.rm or rimraf here (CLAUDE.md rule 1).
 */

import { createRequire } from 'node:module';
import { Command } from 'commander';
import { cleanCommand } from './commands/clean.js';
import { completionsCommand } from './commands/completions.js';
import { configCommand } from './commands/config.js';
import { doctorCommand } from './commands/doctor.js';
import { scanCommand } from './commands/scan.js';
import { undoCommand } from './commands/undo.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

import { printLogo } from './logo.js';
import { setVerbose } from './verbose.js';

const program = new Command();

program
  .name('shed')
  .description('Safe disk cleanup for dev machines and Linux servers')
  .version(version)
  .option('-v, --verbose', 'Enable verbose logging');

program
  .command('scan [path]')
  .description('Scan for cleanable items without modifying anything')
  .option('--json', 'Output machine-readable JSON')
  .option('--max-age <days>', 'Only include items older than N days', '30')
  .option('--all', 'Show every item (default: compact summary with top 15)')
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

program
  .command('completions')
  .description('Print shell completion script')
  .argument('<shell>', 'bash | zsh | fish')
  .action(completionsCommand);

program.hook('preAction', (_thisCommand, actionCommand) => {
  const opts = program.opts<{ verbose?: boolean }>();
  setVerbose(opts.verbose ?? false);
  // Skip logo for --json mode and for `completions` (output gets piped to a file).
  const cmdOpts = actionCommand.opts<{ json?: boolean }>();
  const isCompletions = actionCommand.name() === 'completions';
  if (!cmdOpts.json && !isCompletions) printLogo(version);
});

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error('shed: fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
