/**
 * Shell completion script emission for `shed completions <shell>`.
 *
 * Static scripts — shed's command set is small and stable. Tracking the
 * commander definition in cli.ts manually here is acceptable (and keeps the
 * scripts inspectable). If the command set grows much, switch to a dynamic
 * completion generator.
 *
 * Install instructions:
 *   bash:  shed completions bash >> ~/.bash_completion
 *   zsh:   shed completions zsh > "${fpath[1]}/_shed"
 *   fish:  shed completions fish > ~/.config/fish/completions/shed.fish
 */

const BASH = `# shed bash completion
_shed_completions() {
  local cur prev cmds
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  cmds="scan clean undo doctor config completions"

  case "\${prev}" in
    scan)
      COMPREPLY=( $(compgen -W "--json --max-age --all" -- "\${cur}") )
      return 0
      ;;
    clean)
      COMPREPLY=( $(compgen -W "--dry-run --execute --hard-delete --include-red --yes" -- "\${cur}") )
      return 0
      ;;
    config)
      COMPREPLY=( $(compgen -W "get set list reset" -- "\${cur}") )
      return 0
      ;;
    completions)
      COMPREPLY=( $(compgen -W "bash zsh fish" -- "\${cur}") )
      return 0
      ;;
  esac

  if [ "\${COMP_CWORD}" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "\${cmds} --version --help --verbose" -- "\${cur}") )
    return 0
  fi
}
complete -F _shed_completions shed
`;

const ZSH = `#compdef shed
# shed zsh completion

_shed() {
  local -a commands
  commands=(
    'scan:Scan for cleanable items without modifying anything'
    'clean:Interactive cleanup of detected items'
    'undo:List and restore items from previous cleanups'
    'doctor:Check environment and configuration'
    'config:Manage user preferences'
    'completions:Print shell completion script (bash | zsh | fish)'
  )

  if (( CURRENT == 2 )); then
    _describe -t commands 'shed command' commands
    return
  fi

  case "\${words[2]}" in
    scan)
      _arguments \\
        '--json[Output machine-readable JSON]' \\
        '--max-age[Only include items older than N days]:days' \\
        '--all[Show every item (default: compact summary)]'
      ;;
    clean)
      _arguments \\
        '--dry-run[Preview operations without executing]' \\
        '--execute[Actually perform the cleanup]' \\
        '--hard-delete[Skip Trash, delete permanently]' \\
        '--include-red[Include Red-tier (high-risk) items]' \\
        '--yes[Skip interactive confirmations (CI mode)]'
      ;;
    config)
      _values 'config action' get set list reset
      ;;
    completions)
      _values 'shell' bash zsh fish
      ;;
  esac
}

_shed "$@"
`;

const FISH = `# shed fish completion
complete -c shed -f

# subcommands
complete -c shed -n '__fish_use_subcommand' -a 'scan' -d 'Scan for cleanable items'
complete -c shed -n '__fish_use_subcommand' -a 'clean' -d 'Interactive cleanup'
complete -c shed -n '__fish_use_subcommand' -a 'undo' -d 'Restore from previous cleanups'
complete -c shed -n '__fish_use_subcommand' -a 'doctor' -d 'Check environment'
complete -c shed -n '__fish_use_subcommand' -a 'config' -d 'Manage preferences'
complete -c shed -n '__fish_use_subcommand' -a 'completions' -d 'Print shell completion script'

# scan flags
complete -c shed -n '__fish_seen_subcommand_from scan' -l json -d 'Output JSON'
complete -c shed -n '__fish_seen_subcommand_from scan' -l max-age -d 'Min age in days'
complete -c shed -n '__fish_seen_subcommand_from scan' -l all -d 'Show every item'

# clean flags
complete -c shed -n '__fish_seen_subcommand_from clean' -l dry-run -d 'Preview only'
complete -c shed -n '__fish_seen_subcommand_from clean' -l execute -d 'Actually delete'
complete -c shed -n '__fish_seen_subcommand_from clean' -l hard-delete -d 'Skip Trash'
complete -c shed -n '__fish_seen_subcommand_from clean' -l include-red -d 'Include Red tier'
complete -c shed -n '__fish_seen_subcommand_from clean' -l yes -d 'Skip confirmations'

# config + completions argument values
complete -c shed -n '__fish_seen_subcommand_from config' -a 'get set list reset'
complete -c shed -n '__fish_seen_subcommand_from completions' -a 'bash zsh fish'
`;

export type CompletionShell = 'bash' | 'zsh' | 'fish';

const SCRIPTS: Record<CompletionShell, string> = { bash: BASH, zsh: ZSH, fish: FISH };

export function getCompletionScript(shell: CompletionShell): string {
  return SCRIPTS[shell];
}

export function completionsCommand(shell?: string): void {
  if (shell !== 'bash' && shell !== 'zsh' && shell !== 'fish') {
    console.error('shed completions: shell must be one of: bash, zsh, fish');
    process.exit(1);
  }
  process.stdout.write(SCRIPTS[shell]);
}
