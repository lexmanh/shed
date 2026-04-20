import * as p from '@clack/prompts';
import pc from 'picocolors';

export async function configCommand(
  action?: string,
  key?: string,
  value?: string,
): Promise<void> {
  p.intro(pc.bgBlue(pc.black(' shed config ')));
  // TODO: implement with `conf` package
  p.note(`action=${action} key=${key} value=${value}`, 'Not yet implemented');
  p.outro(pc.dim('Config management coming in Phase 2.'));
}
