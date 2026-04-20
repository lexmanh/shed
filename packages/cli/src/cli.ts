#!/usr/bin/env node
/**
 * Shed CLI entry point.
 *
 * This file is thin — it parses args and delegates to commands.
 * Commands delegate to @lexmanh/shed-core.
 * Never call fs.rm or rimraf here (CLAUDE.md rule 1).
 */

import { Command } from 'commander';
import { scanCommand } from './commands/scan.js';
import { cleanCommand } from './commands/clean.js';
import { doctorCommand } from './commands/doctor.js';
import { configCommand } from './commands/config.js';
import { undoCommand } from './commands/undo.js';

const program = new Command();

program
  .name('shed')
  .description('Safe, cross-platform disk cleanup for developers')
  .version('0.0.0');

program
  .command('scan [path]')
  .description('Scan for cleanable items without modifying anything')
  .option('--json', 'Output machine-readable JSON')
  .option('--explain-with-ai', 'Use AI to explain recommendations')
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

program
  .command('doctor')
  .description('Check environment and configuration')
  .action(doctorCommand);

program
  .command('config')
  .description('Manage user preferences')
  .argument('[action]', 'get | set | list | reset')
  .argument('[key]', 'Configuration key')
  .argument('[value]', 'Configuration value (for set)')
  .action(configCommand);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error('shed: fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
