# Shed

> Safe disk cleanup for dev machines and Linux servers — without breaking active work.

[![CI](https://github.com/lexmanh/shed/actions/workflows/ci.yml/badge.svg)](https://github.com/lexmanh/shed/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@lexmanh/shed-cli/beta)](https://www.npmjs.com/package/@lexmanh/shed-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Developers accumulate gigabytes of forgotten `node_modules`, stale Docker images, Xcode DerivedData, and Flutter caches. Linux servers fill up with rotated logs, apt/yum caches, and journal data. Existing tools either clean too aggressively or cover only one runtime.

**Shed** scans your machine or server, classifies every item by risk tier, runs safety checks, and lets you reclaim space interactively — defaulting to Trash so you can always undo.

```
◇  Found 47 cleanable items across 18 project(s).

  ~/Projects/myapp  2.70 GB
    ● Yellow  node_modules  1.57 GB
    ● Yellow  .next         1.13 GB

  global caches  19.83 GB
    ● Green   ~/.gradle/caches                                            2.90 GB
    ● Green   ~/Library/Caches/JetBrains/Rider2025.1                     4.06 GB
    ● Green   ~/Library/Application Support/Code/User/workspaceStorage   3.94 GB

  linux server  4.12 GB
    ● Green   /var/cache/apt/archives   1.84 GB
    ● Yellow  /var/log/journal          1.71 GB
    ● Green   nginx rotated logs ×14     570 MB

  ⚠  Detect-only (never deleted)
    ● Red     MySQL binary logs at /var/lib/mysql — use PURGE BINARY LOGS

  Total recoverable: 26.65 GB — run shed clean to proceed.
```

## Install

```bash
npm install -g @lexmanh/shed-cli@beta
```

Requires Node 22+.

## Usage

```bash
# Scan for cleanable items (read-only, safe)
shed scan ~
shed scan ~/Projects
shed scan /           # Linux server scan

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
| 🟢 **Green** | Global npm/pip/cargo caches, JetBrains caches, apt archives, rotated `.gz` logs | Delete after confirmation summary |
| 🟡 **Yellow** | `node_modules`, `build/`, `target/`, journald logs, crash dumps, orphan Docker volumes | Safety checks + per-item confirmation |
| 🔴 **Red** | Anything with uncommitted changes, recently modified | Skipped unless `--include-red` |
| 🚫 **Detect-only** | MySQL binary logs, PostgreSQL WAL, MongoDB diagnostic data | Surface + warn, never deleted |

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
| Go | `vendor/` | `$GOPATH/pkg/mod` |
| Java / Maven | `target/` | `~/.m2/repository` |
| Java / Gradle | `build/`, `.gradle/` | `~/.gradle/caches` |
| Ruby | `vendor/bundle/` | `~/.bundle/cache` |
| .NET | `bin/`, `obj/` | `~/.nuget/packages` |
| Flutter | `build/`, `.dart_tool/` | `~/.pub-cache`, `~/.fvm/versions` |
| Android | `.gradle/`, `build/` | `~/.gradle/caches` |
| CocoaPods | `Pods/` | `~/.cocoapods/repos` |
| Xcode | — | `~/Library/Developer/Xcode/DerivedData` |
| Docker | Dangling images, stopped containers, orphan volumes, build cache | — |
| IDE | — | JetBrains system caches, VSCode workspaceStorage |
| **Linux System** | — | journald logs, apt/yum/dnf caches, crash dumps |
| **Webserver** | — | Nginx/Apache/httpd rotated `.gz` logs > 30 days |
| **Database** *(detect-only)* | — | MySQL binary logs, PostgreSQL WAL, MongoDB diagnostic data |

## MCP Server (Claude Desktop / Claude Code)

Shed ships an MCP server that lets Claude scan and analyze your disk usage via natural language.

```bash
npm install -g @lexmanh/shed-mcp-server@beta
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
| [`@lexmanh/shed-cli`](https://www.npmjs.com/package/@lexmanh/shed-cli) | The `shed` binary |
| [`@lexmanh/shed-core`](https://www.npmjs.com/package/@lexmanh/shed-core) | Detection, safety checks, risk classification |
| [`@lexmanh/shed-agent`](https://www.npmjs.com/package/@lexmanh/shed-agent) | AI provider abstraction (Anthropic, OpenAI, Gemini, Groq, Mistral, OpenRouter, Ollama) |
| [`@lexmanh/shed-mcp-server`](https://www.npmjs.com/package/@lexmanh/shed-mcp-server) | MCP server for Claude Desktop/Code |

## Contributing

Shed is open source. See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to contribute, and [CLAUDE.md](./CLAUDE.md) for the safety rules that govern all code in this repo.

When reporting bugs, include:

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
