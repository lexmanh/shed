# Shed — Project Plan

> Tactical execution doc. For vision and positioning, read [`docs/PRODUCT_VISION.md`](docs/PRODUCT_VISION.md).
> Current status: **Public / Open Source** (v0.2.0-beta.1).

---

## Positioning Matrix

| Tool | Scope | Safety | Cross-platform | Fleet/Centralized | AI |
|---|---|---|---|---|---|
| npkill | Node only | Medium | Yes | No | No |
| kondo | Multi-runtime | Medium | Yes | No | No |
| dev-cleaner | Wide | **Low** (simulator wipes, log deletion) | macOS/Win | No | No |
| CleanMyMac | System + dev | High | macOS only | No | No |
| **Shed** | Dev + Server | **High** (tiered, git-aware) | **All 3** | **Yes** *(Phase 7)* | **Yes** |

---

## Architecture Overview

Monorepo (`pnpm` workspaces):

```
@lexmanh/shed-core          — scan, detect, classify, safety checks
@lexmanh/shed-cli           — `shed` binary
@lexmanh/shed-agent         — AI provider abstraction
@lexmanh/shed-mcp-server    — MCP for Claude Desktop/Code
@lexmanh/shed-fleet         — SSH fleet management (Phase 7, planned)
```

Dependency direction: `cli`, `agent`, `mcp-server`, `fleet` → `core` (one-way only).

---

## Safety Framework — The Core Differentiator

Mọi thao tác cleanup được phân loại vào 3 tier:

**🟢 Green Tier — Regeneratable, low risk**
- npm/yarn/pnpm global cache
- Homebrew cleanup
- Docker dangling images
- Rust `target/` ở project đã git-clean
- Python `__pycache__/`, `.pytest_cache/`
- Nginx/Apache rotated `.gz` logs > 30 ngày

**🟡 Yellow Tier — Context-dependent**
- `node_modules/` (check age + git state + workspace root)
- `venv/`, `.venv/`
- `build/`, `dist/` directories
- Flutter `build/`, `.dart_tool/`
- CocoaPods `Pods/`
- Docker orphan volumes > 30 ngày

**🔴 Red Tier — Stateful, opt-in only**
- Xcode Simulator Devices
- Any git-tracked lock file
- System logs (active)
- Time Machine snapshots

**🚫 Detect-only — Never deleted, surface + suggest**
- MySQL binary logs (`mysql-bin.*`)
- PostgreSQL WAL (`pg_wal/`)
- MongoDB diagnostic data
- Redis RDB/AOF, RabbitMQ mnesia, Kafka log segments

### Safety Checks

1. **Git-aware**: gitignored paths không bị block khi repo dirty — chỉ block nếu path có tracked files với uncommitted changes
2. **Process-aware**: lsof (Unix) / Get-Process (Win) — SKIP nếu có process đang hold
3. **Recency guard**: modified < 30 ngày → SKIP (configurable)
4. **Symlink guard**: không follow symlinks ra ngoài project root
5. **Size sanity**: > 10GB đòi extra confirmation
6. **Sacred path guard**: `~/.ssh`, `~/.aws`, `~/.kube`, `~/.git`, v.v. — absolute block

### Undo Support

Default: move to OS Trash. `shed undo` liệt kê + restore. `--hard-delete` bypasses Trash.

---

## Roadmap

Phases là milestone-based, không có deadline cứng. Fit hobby pace.

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

### ✅ Phase 6 — Docker + Linux Server Foundation

- [x] Docker orphan volumes detector (Yellow, age > 30 days) — extends DockerDetector
- [x] SystemDetector: `/var/log/journal` (Yellow), `/var/cache/apt` (Green), `/var/cache/yum` (Green), `/var/cache/dnf` (Green), crash dumps `/var/crash/` + `/var/core/` (Yellow) — Linux-only
- [x] WebserverDetector: Nginx/Apache/httpd rotated `.gz` logs > 30 days (Green)
- [x] DatabaseDetector: detect-only Red items for MySQL binary logs, PostgreSQL WAL, MongoDB diagnostic.data
- [x] Old kernels in `/boot` — detect-only Red item via dpkg/rpm enumeration; suggests `apt autoremove --purge` or `dnf remove`. Never touches /boot directly (would bypass GRUB/initramfs hooks).

### 🔲 Phase 7 — SSH Fleet (`packages/fleet`)

*Trigger: dogfood Phase 6 trên ≥1 Linux server thật + có video demo.*

- [ ] New package `@lexmanh/shed-fleet`
- [ ] SSH transport (agentless, key-based)
- [ ] Fleet inventory: `~/.config/shed/fleet.db` (SQLite)
- [ ] `shed fleet add/list/remove` — quản lý server inventory
- [ ] `shed fleet scan [--tag X]` — parallel scan, result aggregation
- [ ] `shed fleet clean [--tier green] [--execute]` — per-server confirmation
- [ ] `shed fleet watch --threshold 85` — periodic polling daemon
- [ ] `--no-clean` tag: server chỉ scan, không bao giờ clean (cho prod DB servers)
- [ ] Audit log: `~/.config/shed/fleet-audit.log`
- [ ] Concurrency limit, timeout, retry

### 🔲 Phase 8 — Database + Messaging (Detect-only)

*Trigger: sau khi fleet stable, có user request từ DBA/sysadmin persona.*

- [ ] MySQL: detect binary log growth, suggest `PURGE BINARY LOGS`
- [ ] PostgreSQL: detect WAL bloat, suggest checkpoint / replication check
- [ ] MongoDB: detect diagnostic data, oplog size
- [ ] Redis: detect RDB/AOF size + age
- [ ] RabbitMQ mnesia, Kafka log segments
- [ ] Backup repos: rsnapshot, Borg, Restic (detect stale, không delete)

### 🔲 Phase 9 — AI Agent Layer

*Trigger: sau khi fleet có user base nhỏ, cần automation.*

- [ ] Disk pressure prediction (linear regression, 30-day history)
- [ ] Policy DSL (`~/.config/shed/policy.yaml`) — schedule + trigger + tier actions
- [ ] Human-in-the-loop approval (reply "approve" qua Slack/Telegram)
- [ ] Notification: Slack webhook, Telegram bot, Discord webhook, email SMTP, generic webhook
- [ ] LLM root cause analysis via MCP tools

---

## Distribution (parallel track — thấp priority hơn Fleet)

*Làm dần trong background, không block Fleet development.*

- [ ] Homebrew tap (`brew install lexmanh/shed/shed`)
- [ ] Scoop manifest cho Windows
- [ ] Shell completions (bash/zsh/fish/powershell)
- [ ] `shed scan --json` output hoàn chỉnh
- [ ] Landing page + asciinema demo
- [ ] `llms.txt` cho AI crawlers

---

## More Detectors (v0.3 scope)

- [x] Go (`$GOPATH/pkg/mod`, project `vendor/`)
- [x] Java / Maven (`~/.m2/repository`, project `target/`)
- [x] Java / Gradle (`~/.gradle/caches`, project `build/` + `.gradle/`)
- [x] Ruby / Bundler (`~/.bundle/cache`, project `vendor/bundle/`)
- [x] .NET / NuGet (`~/.nuget/packages`, project `bin/` + `obj/`)
- [x] Bun cache — handled inside NodeDetector (`~/.bun`)
- [ ] Browser dev tool caches (Chrome, Firefox) — needs process-aware logic, skip for now
- [ ] Tomcat: `catalina.out`, heap dumps `.hprof` — Phase 6
- [ ] PM2: `~/.pm2/logs/` — Phase 6

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
- **SSH** *(Phase 7)*: node-ssh
- **Fleet DB** *(Phase 7)*: better-sqlite3
- **Policy config** *(Phase 9)*: js-yaml
- **Scheduler** *(Phase 9)*: node-cron

---

## Non-Goals

- GUI application
- **Realtime streaming metrics** (Datadog/Grafana-style) — `shed fleet watch` là periodic polling, không phải realtime
- Cloud storage cleanup (S3, Dropbox, iCloud)
- Email/photo library cleanup
- Malware scanning
- System optimization ngoài disk space
- Uninstaller cho apps
- Direct deletion của database files — luôn detect-only

---

## Success Metrics

**Technical:**
- Safety bug rate: 0 data-loss incidents
- Test coverage: > 80% overall, 100% safety-critical
- CI: xanh trên cả 3 OS
- Cold startup: < 200ms

**User value:**
- Average disk freed per user: > 10GB
- "broke my project" rate: < 0.1%
- Maintainer dogfoods shed trong job chính (primary signal — nếu không tự dùng được thì cut)

---

## Open Questions

1. **SSH library**: `node-ssh` (wrapper, dễ dùng) vs `ssh2` trực tiếp (control nhiều hơn, ít dependency)?
2. **Fleet inventory**: SQLite (`better-sqlite3`) vs JSON flat file (đơn giản hơn, đủ cho < 100 servers)?
3. **Domain**: `shed.dev` — check availability trước khi launch Phase 7.
4. **License**: Core packages (`core`, `cli`, `mcp-server`) → MIT (hiện tại). Fleet + Pro agent features → commercial-friendly license, công bố khi gần launch Pro tier.
