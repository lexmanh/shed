# Shed Beta Program

Shed is currently in **closed beta**. Access is invitation-only.

## Why closed beta?

Shed is a **destructive tool** — it deletes files. A safety bug is a data loss event. Before making this available to thousands of developers, we want to battle-test it with a small group of trusted users on diverse machines and workflows.

## What we're looking for

Ideal beta testers:
- Active developers on macOS, Windows, or Linux
- Comfortable running a CLI tool
- Have a dev environment with multiple projects and accumulated cache clutter
- Willing to provide honest feedback (good and bad)
- Use git for their projects
- Have recent backups (no beta without backups!)

## Beta responsibilities

As a beta tester, you agree to:

1. **Have a recent backup** before running Shed on your primary machine. Time Machine, Windows File History, BorgBackup, whatever — just have one.
2. **Report bugs** via the private GitHub issue tracker (access provided on invite).
3. **File safety concerns immediately** — any case where Shed deleted something it shouldn't have is top priority.
4. **Keep the tool confidential** until public launch. Don't share binaries or screenshots publicly.
5. **Test in dry-run mode first** for any new command or detector.

## What you get

- Early access to a tool that will save you disk space
- Direct line to maintainer for feature requests
- Credited as beta tester in public launch announcements (opt-in)
- Shape the product direction during Phase 4 (AI integration) and Phase 5

## Beta phases

- **Phase 3.5** (Week 10): Core testers (~5 people) — MVP Node/Python/Rust detectors
- **Phase 4** (Week 11-13): Expanded group (~20 people) — mobile + AI integration
- **Phase 5** (Week 14): Release candidate — final bug squashing
- **Phase 6** (Week 15+): Public launch — beta period ends

## Reporting issues

Bug reports should include:

- OS and version (`sw_vers` / `ver` / `uname -a`)
- Shed version (`shed --version`)
- Node version (`node --version`)
- Exact command run
- Full output (run with `--verbose` for more detail)
- Expected vs actual behavior
- If data loss: what was lost, was it recoverable from Trash

**Safety-critical bugs** (anything involving data loss or touching sacred paths): email maintainer directly before filing publicly.

## Applying

Currently invitation-only. If you think you'd be a good fit, reach out to the maintainer directly.

Open call for beta testers: TBD (expect around Week 9-10 of development).
