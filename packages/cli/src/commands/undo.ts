import * as p from '@clack/prompts';
import pc from 'picocolors';

export async function undoCommand(): Promise<void> {
  p.intro(pc.bgMagenta(pc.black(' shed undo ')));
  // TODO: read ~/.shed/logs/, list last N operations, allow restore
  p.note('Undo is implemented via OS Trash.\nOpen your Trash/Recycle Bin to restore items.', 'Status');
  p.outro(pc.dim('Interactive undo coming in Phase 2.'));
}
