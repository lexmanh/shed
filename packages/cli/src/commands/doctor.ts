import { arch, homedir, platform, release } from 'node:os';
import * as p from '@clack/prompts';
import { execa } from 'execa';
import pc from 'picocolors';

export async function doctorCommand(): Promise<void> {
  p.intro(pc.bgGreen(pc.black(' shed doctor ')));

  const checks: { name: string; value: string }[] = [];

  checks.push({ name: 'OS', value: `${platform()} ${release()} (${arch()})` });
  checks.push({ name: 'Home', value: homedir() });
  checks.push({ name: 'Node', value: process.version });

  const tools = ['git', 'npm', 'pnpm', 'yarn', 'docker'];
  for (const tool of tools) {
    try {
      const { stdout } = await execa(tool, ['--version'], { reject: false });
      checks.push({ name: tool, value: stdout.split('\n')[0] ?? 'unknown' });
    } catch {
      checks.push({ name: tool, value: pc.dim('not installed') });
    }
  }

  const body = checks.map((c) => `  ${pc.cyan(c.name.padEnd(10))} ${c.value}`).join('\n');
  p.note(body, 'Environment');

  p.outro(pc.green('Environment check complete.'));
}
