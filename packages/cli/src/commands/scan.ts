import * as p from '@clack/prompts';
import pc from 'picocolors';

export interface ScanOptions {
  json?: boolean;
  explainWithAi?: boolean;
  maxAge?: string;
}

export async function scanCommand(path = '.', options: ScanOptions = {}): Promise<void> {
  p.intro(pc.bgCyan(pc.black(' shed scan ')));

  const spinner = p.spinner();
  spinner.start(`Scanning ${path}...`);

  // TODO: invoke @lxmanh/shed-core scanner
  // const { scanProjects } = await import('@lxmanh/shed-core');
  // const results = await scanProjects({ root: path, maxDepth: 5 });

  await new Promise((r) => setTimeout(r, 500)); // placeholder

  spinner.stop('Scan complete.');

  if (options.json) {
    console.log(JSON.stringify({ items: [], total: 0 }, null, 2));
    return;
  }

  p.note(
    'Scanner not yet implemented.\nSee CLAUDE.md and PLAN.md Phase 1 for detector roadmap.',
    'Status',
  );

  p.outro(pc.dim('Nothing scanned — implementation pending.'));
}
