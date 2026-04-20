# Shed — Project Plan

> Safe, cross-platform, AI-aware disk cleanup for developers.
> Current status: **Public / Open Source** (v0.1.0-beta).

---

## Vision

Developers accumulate 50-200GB of dev caches, abandoned `node_modules`, stale Docker images, Xcode DerivedData, and build artifacts. Existing tools (dev-cleaner, npkill, kondo) either clean too aggressively (breaking active work) or too narrowly (one runtime only).

**Shed's promise**: *"Reclaim disk space without breaking your workflow."*

Every cleanup operation passes through a tiered safety framework that knows about git state, running processes, lock files, and project context. AI assists in edge cases. Default is reversible (Trash). Works identically on macOS, Windows, and Linux.

---

## Positioning Matrix

| Tool | Scope | Safety | Cross-platform | AI |
|---|---|---|---|---|
| npkill | Node only | Medium | Yes | No |
| kondo | Multi-runtime | Medium | Yes | No |
| dev-cleaner | Wide | **Low** (simulator wipes, log deletion) | macOS/Win | No |
| CleanMyMac | System + dev | High | macOS only | No |
| **Shed** | Wide | **High** (tiered, git-aware) | **All 3** | **Yes** |

---

## Architecture Overview

Monorepo (`pnpm` workspaces) với 4 packages:

```
@lxmanh/shed-core          — scan, detect, classify, safety checks
@lxmanh/shed-cli           — `shed` binary
@lxmanh/shed-agent         — AI provider abstraction
@lxmanh/shed-mcp-server    — MCP for Claude Desktop/Code
```

---

## Safety Framework — The Core Differentiator

Mọi thao tác cleanup được phân loại vào 3 tier:

**🟢 Green Tier — Regeneratable, low risk**
- npm/yarn/pnpm global cache
- Homebrew cleanup
- Docker dangling images
- Rust `target/` ở project đã git-clean
- Python `__pycache__/`, `.pytest_cache/`

**🟡 Yellow Tier — Context-dependent**
- `node_modules/` (check age + git state + workspace root)
- `venv/`, `.venv/`
- `build/`, `dist/` directories
- Flutter `build/`, `.dart_tool/`
- CocoaPods `Pods/`

**🔴 Red Tier — Stateful, opt-in only**
- Xcode Simulator Devices
- Any git-tracked lock file
- System logs
- Time Machine snapshots

### Safety Checks

1. **Git-aware**: gitignored paths (node_modules, build/) không bị block khi repo dirty — chỉ block nếu path có tracked files với uncommitted changes
2. **Process-aware**: lsof (Unix) / Get-Process (Win) — SKIP nếu có process đang hold
3. **Recency guard**: modified < 30 ngày → SKIP (configurable)
4. **Symlink guard**: không follow symlinks ra ngoài project root
5. **Size sanity**: > 10GB đòi extra confirmation
6. **Sacred path guard**: ~/.ssh, ~/.aws, ~/.kube, ~/.git, v.v. — absolute block

### Undo Support

Default: move to OS Trash. `shed undo` liệt kê + restore. `--hard-delete` bypasses Trash.

---

## Roadmap

### ✅ Phase 0 — Foundation

- [x] Monorepo setup (pnpm, tsconfig, biome)
- [x] CI: GitHub Actions matrix (macOS/Ubuntu/Windows)
- [x] `SafetyChecker` với full unit tests (git-aware, process-aware, sacred paths, symlinks)
- [x] `RiskTier` enum + tier policies
- [x] Platform abstraction layer
- [x] Logger (pino), error taxonomy, test fixture framework

### ✅ Phase 1 — Core Detectors

- [x] Node.js (node_modules, global caches, workspace root detection)
- [x] Python (venv, __pycache__, pip/poetry/uv cache)
- [x] Rust (target/, cargo registry cache)
- [x] Docker (dangling images, stopped containers, build cache)

### ✅ Phase 2 — CLI

- [x] `shed scan` — list + risk classification
- [x] `shed clean` — interactive với quick-select preset (All/Green/Yellow/Custom)
- [x] `shed undo` — restore from trash
- [x] `shed doctor` — environment check
- [x] `shed config` — user preferences
- [x] `--verbose`, dry-run default, `--execute` flag
- [x] ASCII logo + author info
- [x] npm publish via CI/CD (OIDC Trusted Publisher)

### ✅ Phase 3 — Mobile + System Detectors

- [x] Flutter (build/, .dart_tool/, FVM caches)
- [x] Xcode (DerivedData, caches — NOT Simulators by default)
- [x] Android (Gradle caches, .gradle/)
- [x] CocoaPods (~/.cocoapods repos, Pods/ per-project)
- [x] IDE caches (JetBrains, VSCode workspaceStorage)

### ✅ Phase 4 — AI Integration

- [x] MCP server: 4 tools (scan_projects, analyze_project, estimate_cleanup, execute_cleanup_plan)
- [x] AI providers: Anthropic, OpenAI, Gemini, Groq, Mistral, OpenRouter, Ollama
- [x] Privacy prompt trước mọi API call
- [x] Token budget (50k default, hard stop 100k)
- [x] API key management via keytar

### ✅ Phase 5 — Open Source Launch

- [x] Branch protection (CI required trước khi merge)
- [x] Issue templates (bug, feature request, safety concern)
- [x] PR template với safety checklist
- [x] CONTRIBUTING.md
- [x] Flip repo public
- [x] v0.1.0-beta.2 published to npm

---

## Backlog — Tính năng dự kiến

### v0.2 — Distribution & Adoption

- [ ] Homebrew tap (`brew install lexmanh/shed/shed`)
- [ ] Scoop manifest cho Windows
- [ ] `shed scan --json` output hoàn chỉnh
- [ ] Shell completions (bash/zsh/fish/powershell)
- [ ] Landing page + demo GIF trên GitHub Pages
- [ ] `llms.txt` cho AI crawlers
- [ ] Submit: HN, Reddit, Product Hunt, Vietnamese communities

### v0.3 — More Detectors

- [ ] Go (`$GOPATH/pkg/mod` — thường vài GB)
- [ ] Java / Maven (`~/.m2/repository`)
- [ ] Gradle shared cache (`~/.gradle/caches`)
- [ ] Ruby / Bundler (`vendor/bundle`, `~/.bundle`)
- [ ] .NET / NuGet (`~/.nuget/packages`)
- [ ] Bun cache (`~/.bun/install/cache`)
- [ ] Browser dev tool caches (Chrome, Firefox)

### v0.4 — UX & Power Features

- [ ] `shed scan` interactive mode (filter/sort/search)
- [ ] `shed stats` — lịch sử freed disk space theo thời gian
- [ ] `shed schedule` — tự động cleanup định kỳ
- [ ] `--since <date>` flag — chỉ xét items không dùng từ ngày X
- [ ] `shed ask "<query>"` — natural language cleanup query via AI

### v1.0 — Stable

- [ ] npm publish stable (bỏ beta dist-tag)
- [ ] Windows long path testing thực tế (`\\?\` prefix)
- [ ] E2E test suite đầy đủ
- [ ] 80%+ test coverage overall, 100% safety-critical
- [ ] docs/architecture.md, docs/detector-plugin-guide.md

---

## Tech Stack

- **Runtime**: Node 22 LTS
- **Language**: TypeScript 5.7+ strict
- **Monorepo**: pnpm workspaces
- **Build**: tsup
- **Test**: vitest + @vitest/coverage-v8
- **Lint/format**: biome
- **CLI**: commander + @clack/prompts
- **Filesystem**: fast-glob, node:fs/promises
- **Subprocess**: execa
- **Logger**: pino
- **Secret storage**: keytar
- **User config**: conf
- **Trash**: trash (cross-platform)
- **AI SDKs**: @anthropic-ai/sdk, openai, @google/genai
- **MCP**: @modelcontextprotocol/sdk

---

## Non-Goals

- GUI application
- Real-time monitoring / background daemon
- Cloud storage cleanup (S3, Dropbox, iCloud)
- Email/photo library cleanup
- Malware scanning
- System optimization ngoài disk space
- Uninstaller cho apps

---

## Success Metrics

**Technical:**
- Safety bug rate: 0 data-loss incidents
- Test coverage: > 80% overall, 100% safety-critical
- CI: xanh trên cả 3 OS
- Cold startup: < 200ms

**Community:**
- 500+ GitHub stars trong 30 ngày đầu
- 10+ external contributors
- Mention trong ít nhất 3 dev newsletters

**User value:**
- Average disk freed per user: > 10GB
- "broke my project" rate: < 0.1%

---

## Open Questions

1. License: MIT (đang dùng) vs Apache 2.0 (patent protection)?
2. Domain `shed.dev` — check availability nếu muốn landing page riêng
