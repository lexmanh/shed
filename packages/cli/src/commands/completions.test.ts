import { describe, expect, it } from 'vitest';
import { type CompletionShell, getCompletionScript } from './completions.js';

const SHELLS: CompletionShell[] = ['bash', 'zsh', 'fish'];
const COMMANDS = ['scan', 'clean', 'undo', 'doctor', 'config', 'completions'];

describe('getCompletionScript', () => {
  for (const shell of SHELLS) {
    describe(shell, () => {
      const script = getCompletionScript(shell);

      it('returns a non-empty script', () => {
        expect(script.length).toBeGreaterThan(50);
      });

      it.each(COMMANDS)('mentions the %s subcommand', (cmd) => {
        expect(script).toContain(cmd);
      });

      // Use bare flag names (no --) so the assertion works for fish too,
      // which writes flags as `-l json` instead of `--json` in completions.
      it('mentions key scan flags', () => {
        expect(script).toMatch(/\bjson\b/);
        expect(script).toMatch(/\ball\b/);
      });

      it('mentions safety-relevant clean flags', () => {
        expect(script).toMatch(/\bexecute\b/);
        expect(script).toMatch(/\bdry-run\b/);
      });
    });
  }

  it('bash script defines a complete -F function bound to `shed`', () => {
    const s = getCompletionScript('bash');
    expect(s).toMatch(/_shed_completions/);
    expect(s).toMatch(/complete -F _shed_completions shed/);
  });

  it('zsh script declares #compdef shed header', () => {
    const s = getCompletionScript('zsh');
    expect(s.startsWith('#compdef shed')).toBe(true);
  });

  it('fish script uses `complete -c shed`', () => {
    const s = getCompletionScript('fish');
    expect(s).toContain('complete -c shed');
  });
});
