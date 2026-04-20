# Shed

> Reclaim disk space from dev caches — without breaking active work.

[![CI](https://github.com/lexmanh/shed/actions/workflows/ci.yml/badge.svg)](https://github.com/lexmanh/shed/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@lxmanh/shed-cli/beta)](https://www.npmjs.com/package/@lxmanh/shed-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Every developer accumulates gigabytes of forgotten `node_modules`, stale Docker images, Xcode DerivedData, Flutter build artifacts, and abandoned project caches. Existing tools either clean too aggressively (breaking active work) or too narrowly (one runtime only).

**Shed** scans your machine, classifies everything by risk tier, runs safety checks, and lets you reclaim space interactively — defaulting to Trash so you can always undo.

```
◇  Found 33 cleanable items across 16 project(s).

  ~/Projects/myapp  2.70 GB
    ● Yellow  node_modules  1.57 GB
    ● Yellow  .next         1.13 GB

  global caches  19.83 GB
    ● Green   ~/.gradle/caches                                            2.90 GB
    ● Green   ~/Library/Caches/JetBrains/Rider2025.1                     4.06 GB
    ● Green   ~/Library/Application Support/Code/User/workspaceStorage   3.94 GB

  Total recoverable: 27.82 GB — run shed clean to proceed.
```

## Install

```bash
npm install -g @lxmanh/shed-cli@beta
```

Requires Node 22+.

## Usage

```bash
# Scan for cleanable items (read-only, safe)
shed scan ~
shed scan ~/Projects

# Preview cleanup without touching anything (default)
shed clean ~/Projects

# Interactive cleanup with confirmations
shed clean ~/Projects --execute

# Skip interactive prompts (CI/script mode)
shed clean ~/Projects --execute --yes

# Check environment
shed doctor

# Manage config
shed config list
shed config set scan.maxDepth 10
```

## Safety Model

Every item is classified into one of three tiers before anything is touched:

| Tier | Examples | Default action |
|------|----------|----------------|
| 🟢 **Green** | Global npm/pip/cargo caches, JetBrains caches, VSCode workspaceStorage | Delete after confirmation summary |
| 🟡 **Yellow** | `node_modules`, `build/`, `target/`, `.dart_tool/` | Safety checks + per-item confirmation |
| 🔴 **Red** | Anything with uncommitted changes, recently modified | Skipped unless `--include-red` |

**Safety checks run before every Yellow/Red operation:**

- Git-aware — skips paths with uncommitted changes
- Process-aware — skips paths held by running processes
- Recency guard — skips projects modified within 30 days (configurable)
- Sacred paths — `~/.ssh`, `~/.aws`, `~/.kube`, lock files, Xcode Archives are never touched

**Undo by default** — cleanup moves to system Trash (macOS `~/.Trash`, Windows Recycle Bin, Linux XDG trash). Use `--hard-delete` only when you're sure.

## Supported Runtimes

| Runtime | Project items | Global caches |
|---------|--------------|---------------|
| Node.js | `node_modules`, `.next`, `.nuxt`, `dist`, `build` | `~/.npm`, `~/.yarn/cache`, `~/.pnpm-store`, `~/.bun` |
| Python | `venv`, `.venv`, `__pycache__`, `.pytest_cache` | `~/.cache/pip`, poetry cache |
| Rust | `target/` | `~/.cargo/registry`, `~/.cargo/git` |
| Docker | Dangling images, stopped containers, build cache | — |
| Xcode | — | `~/Library/Developer/Xcode/DerivedData` |
| Flutter | `build/`, `.dart_tool/` | `~/.pub-cache`, `~/.fvm/versions` |
| Android | `.gradle/`, `build/` | `~/.gradle/caches` |
| CocoaPods | `Pods/` | `~/.cocoapods/repos` |
| IDE | — | JetBrains system caches, VSCode workspaceStorage |

## MCP Server (Claude Desktop / Claude Code)

Shed ships an MCP server that lets Claude scan and analyze your disk usage via natural language.

```bash
npm install -g @lxmanh/shed-mcp-server@beta
```

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "shed": { "command": "shed-mcp" }
  }
}
```

Or with Claude Code:

```bash
claude mcp add shed -- shed-mcp
```

Available tools: `list_projects`, `analyze_project`, `estimate_cleanup`, `get_disk_usage`.

## Packages

| Package | Description |
|---------|-------------|
| [`@lxmanh/shed-cli`](https://www.npmjs.com/package/@lxmanh/shed-cli) | The `shed` binary |
| [`@lxmanh/shed-core`](https://www.npmjs.com/package/@lxmanh/shed-core) | Detection, safety checks, risk classification |
| [`@lxmanh/shed-agent`](https://www.npmjs.com/package/@lxmanh/shed-agent) | AI provider abstraction (Anthropic, OpenAI, Gemini, Groq, Mistral, OpenRouter, Ollama) |
| [`@lxmanh/shed-mcp-server`](https://www.npmjs.com/package/@lxmanh/shed-mcp-server) | MCP server for Claude Desktop/Code |

## Beta

Shed is currently in **closed beta**. See [BETA_PROGRAM.md](./BETA_PROGRAM.md) for tester responsibilities and how to report bugs.

When reporting issues, include:

```bash
shed --version
shed doctor
```

## Development

Requires Node 22+ and pnpm.

```bash
pnpm install
pnpm dev         # watch mode
pnpm test        # vitest across all packages
pnpm typecheck
pnpm lint
```

See [CLAUDE.md](./CLAUDE.md) for architecture decisions and safety rules.

## License

MIT
