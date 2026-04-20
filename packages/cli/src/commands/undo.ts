import { platform } from 'node:os';
import * as p from '@clack/prompts';
import pc from 'picocolors';

function trashPath(): string {
  switch (platform()) {
    case 'darwin':
      return '~/.Trash';
    case 'win32':
      return 'Recycle Bin';
    default:
      return '~/.local/share/Trash';
  }
}

function trashOpenHint(): string {
  switch (platform()) {
    case 'darwin':
      return 'open ~/.Trash  (or click Trash in Dock → right-click → Put Back)';
    case 'win32':
      return 'Open Recycle Bin on desktop → right-click item → Restore';
    default:
      return 'nautilus trash:///  or  gio trash --list / gio trash --restore';
  }
}

export async function undoCommand(): Promise<void> {
  p.intro(pc.bgMagenta(pc.black(' shed undo ')));

  p.note(
    [
      'shed clean moves items to your OS Trash by default.',
      '',
      `  Trash location: ${pc.cyan(trashPath())}`,
      '',
      `  To restore: ${pc.dim(trashOpenHint())}`,
      '',
      pc.dim('Tip: shed clean --hard-delete bypasses Trash (no undo possible).'),
      pc.dim('     shed clean --dry-run to preview before any real deletion.'),
    ].join('\n'),
    'How to undo a cleanup',
  );

  p.outro(pc.green('Nothing to do — restore items via your OS Trash.'));
}
