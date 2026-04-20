import * as p from '@clack/prompts';
import pc from 'picocolors';

export interface CleanOptions {
  dryRun?: boolean;
  execute?: boolean;
  hardDelete?: boolean;
  includeRed?: boolean;
  yes?: boolean;
}

export async function cleanCommand(path = '.', options: CleanOptions = {}): Promise<void> {
  p.intro(pc.bgYellow(pc.black(' shed clean ')));

  // Default to dry-run unless --execute is explicitly passed (CLAUDE.md rule 2)
  const isDryRun = !options.execute;

  if (isDryRun) {
    p.note('Running in DRY-RUN mode. Pass --execute to perform actual cleanup.', 'Safe mode');
  } else {
    const confirmed = options.yes
      ? true
      : await p.confirm({
          message: 'You are about to perform a real cleanup. Continue?',
          initialValue: false,
        });
    if (!confirmed) {
      p.cancel('Cleanup cancelled.');
      return;
    }
  }

  // TODO: invoke scan + SafetyChecker.execute() from core
  p.note('Clean command not yet implemented.\nSee CLAUDE.md Phase 1-2 for the plan.', 'Status');

  p.outro(pc.dim(`Dry-run: ${isDryRun}, target: ${path}`));
}
