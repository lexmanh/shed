# Shed

> Reclaim your developer shed.

Every developer has a shed — a place where old projects, forgotten `node_modules`, stale Docker images, and abandoned build artifacts pile up over time. Shed helps you **reclaim space without breaking active work**.

Unlike aggressive cleanup tools that indiscriminately wipe caches, Shed uses a tiered safety framework that understands git state, running processes, lock files, and project context. Works identically on **macOS, Windows, and Linux**.

## Status

🚧 **Closed Beta** — currently developing. Not yet published to npm.

Interested in becoming a beta tester? See [BETA_PROGRAM.md](./BETA_PROGRAM.md).

## Key Features

- **Tiered safety** — Green / Yellow / Red risk classification for every operation
- **Git-aware** — never deletes from a repo with uncommitted changes
- **Process-aware** — skips paths currently held by running processes
- **Undo by default** — moves to system Trash; `--hard-delete` opt-in
- **AI-assisted** — built-in AI explains recommendations; MCP server for Claude Desktop/Code
- **Cross-platform** — macOS (Intel + Apple Silicon), Windows 10+, Linux (Ubuntu, Fedora, Arch, etc.)
- **Multi-runtime** — Node, Python, Rust, Docker, Flutter, Xcode, Android, and more

## Quick Start (when released)

```bash
# Install
npm install -g @lexmanh/shed-cli

# Scan (safe — read-only)
shed scan ~

# Preview what would be cleaned
shed clean --dry-run

# Interactive cleanup with confirmations
shed clean

# With AI explanations
shed scan --explain-with-ai
```

## Architecture

Monorepo with 4 packages:

- `@lexmanh/shed-core` — project detection, safety checks, risk classification
- `@lexmanh/shed-cli` — the `shed` binary
- `@lexmanh/shed-agent` — AI provider abstraction (Anthropic, OpenAI, Ollama)
- `@lexmanh/shed-mcp-server` — MCP server for Claude Desktop and Claude Code

See [PLAN.md](./PLAN.md) for detailed roadmap and design decisions.

## Development

Requires Node 22+ and pnpm.

```bash
pnpm install
pnpm dev         # watch mode across all packages
pnpm test        # run all tests
pnpm typecheck
pnpm lint
```

See [CLAUDE.md](./CLAUDE.md) if you're using Claude Code — it contains critical safety rules and architecture guidance.

## License

MIT (to be finalized at public launch).

## Acknowledgments

Inspired by [npkill](https://github.com/voidcosmos/npkill), [kondo](https://github.com/tbillington/kondo), and [dev-cleaner](https://github.com/jemishavasoya/dev-cleaner) — and the frustration of watching them destroy lock files and simulator data.
