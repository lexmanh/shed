# Shed — Project Plan

> Safe, cross-platform, AI-aware disk cleanup for developers.
> Current status: **Closed Beta Development** (Phase 0).

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
@lexmanh/shed-core          — scan, detect, classify, safety checks
@lexmanh/shed-cli           — `shed` binary
@lexmanh/shed-agent         — AI provider abstraction
@lexmanh/shed-mcp-server    — MCP for Claude Desktop/Code
```

Chi tiết kiến trúc: xem `CLAUDE.md` section 3 và `docs/architecture.md` (TBD).

---

## Safety Framework — The Core Differentiator

Mọi thao tác cleanup được phân loại vào 3 tier:

**🟢 Green Tier — Regeneratable, low risk**
- npm/yarn/pnpm global cache
- Homebrew cleanup
- Docker dangling images (không dùng)
- Rust `target/` ở project đã git-clean
- Python `__pycache__/`, `.pytest_cache/`
- Browser caches

Xoá mặc định với confirmation tóm tắt.

**🟡 Yellow Tier — Context-dependent**
- `node_modules/` (cần check age + git state)
- `venv/`, `.venv/` (check active Python env)
- `build/`, `dist/` directories
- Flutter `build/`, `.dart_tool/`
- Gradle project cache

Xoá sau khi pass safety checks: git-clean, age > threshold, no running process, user confirmation per-group.

**🔴 Red Tier — Stateful, opt-in only**
- Xcode Simulator Devices (có user data apps)
- Xcode DerivedData cho project mở trong IDE gần đây (< 7 ngày)
- iOS `Podfile.lock`, `Gemfile.lock`, any git-tracked lock file
- System logs
- Time Machine snapshots

**KHÔNG** xoá trừ khi user pass `--include-red` flag và confirm từng cái một.

### Safety Checks (run trước mọi Yellow/Red operation)

1. **Git-aware**: Nếu path là trong git repo → `git status --porcelain` phải empty. Có uncommitted changes → SKIP + warn.
2. **Process-aware**: Check `lsof` (Unix) / `Get-Process` (Win) xem có process đang hold file không. Yes → SKIP.
3. **Recency guard**: Project modified < N ngày (default 30) → SKIP unless user override.
4. **Lockfile guard**: Trước khi xoá `node_modules/`, check `package-lock.json` có được git-tracked không. Yes → preserve lock, chỉ xoá node_modules.
5. **Symlink guard**: Không follow symlinks ra ngoài project root.
6. **Size sanity**: Nếu một thao tác xoá > 10GB, đòi extra confirmation.
7. **Sacred path guard**: Refuse bất kỳ path nào match sacred list trong `CLAUDE.md` section 2 rule 4.

### Undo Support

Default: move to OS Trash (Windows Recycle Bin, macOS ~/.Trash, Linux XDG trash). `shed undo` liệt kê last N operations với option restore.

`--hard-delete` flag bypasses Trash (for CI or full wipe scenarios).

---

## Phased Roadmap

Total timeline: **14-16 tuần** tới public launch. Closed beta bắt đầu sau Phase 3.

### Phase 0 — Foundation (Week 1-2)

**Goal**: Tooling + safety framework skeleton + CI matrix.

- [x] Monorepo setup (pnpm, tsconfig, biome)
- [ ] CI: GitHub Actions matrix (macOS/Ubuntu/Windows) chạy typecheck + test + lint
- [ ] `SafetyChecker` class với unit tests (git-aware, process-aware, path validation)
- [ ] `RiskTier` enum + classification helpers
- [ ] Platform abstraction layer (`core/src/platform/{darwin,linux,win32}.ts`)
- [ ] Logger setup (`pino`)
- [ ] Error taxonomy (`core/src/errors.ts`)
- [ ] Test fixture framework (`memfs` + git repo fixtures)

**Exit criteria**: Có thể scan 1 folder, classify risk, NOT actually delete anything, trên cả 3 OS.

### Phase 1 — MVP Detectors (Week 3-5)

**Goal**: Cover web development core runtimes.

Detectors theo thứ tự ưu tiên:
1. Node.js (`package.json`, `node_modules`, caches)
2. Python (`venv`, `__pycache__`, pip cache, poetry cache)
3. Rust (`target/`, cargo registry cache)
4. Docker (dangling images, stopped containers, build cache)
5. Global package manager caches (npm, yarn, pnpm, bun, pip, cargo, brew)

Mỗi detector:
- Implement `ProjectDetector` interface
- Unit tests với fixtures
- Risk tier assignments được document
- Safety checks integrated

**Exit criteria**: `shed scan ~` hoạt động trên cả 3 OS, tìm ra projects với accurate sizing, zero false positives trong sacred paths.

### Phase 2 — CLI Polish (Week 6-7)

**Goal**: Production-quality CLI UX.

- `shed scan` — liệt kê + phân loại risk
- `shed clean` — interactive cleanup với @clack/prompts
- `shed undo` — restore from trash
- `shed doctor` — kiểm tra environment
- `shed config` — user preferences
- JSON output mode (`--json`) cho scripting
- Progress bars cho long operations
- Logging tới `~/.shed/logs/`
- Help text + man pages

**Exit criteria**: Một người lạ có thể install và dùng mà không đọc docs; zero confusion trong flows cơ bản.

### Phase 3 — Mobile + System Detectors (Week 8-10)

**Goal**: Cover mobile dev và system-level artifacts.

Detectors:
6. Flutter (`build/`, `.dart_tool/`, FVM caches, pubspec lock handling)
7. Xcode (DerivedData với "last opened" check, caches — **NOT** Simulators by default)
8. Android (Gradle caches, `.gradle/`, Android SDK cleanup — keep latest build-tools)
9. CocoaPods (~/.cocoapods per-project checks)
10. IDE caches (JetBrains, VSCode workspaceStorage — với age threshold)
11. Browser dev tool caches
12. Java/Maven/Gradle shared caches

**Exit criteria**: Feature parity với dev-cleaner, nhưng an toàn hơn nhờ safety checks. Đây là điểm kick off **Closed Beta**.

### Phase 4 — AI Integration (Week 11-13)

**Parallel tracks — cả hai approach Mạnh đã chọn:**

**Track A: MCP Server**
- Implement MCP protocol
- Tools: `scan_projects`, `analyze_project`, `estimate_cleanup`, `execute_cleanup_plan`
- Distribution: một binary standalone `@lexmanh/shed-mcp-server`
- Setup guide cho Claude Desktop + Claude Code
- E2E test với mock MCP client

**Track B: Built-in AI**
- Provider abstraction: Anthropic, OpenAI, Ollama
- `shed scan --explain-with-ai` — AI giải thích từng item
- `shed ask "find old Python projects I can delete"` — natural language query
- API key management qua `keytar`
- Privacy prompts trước mọi API call
- Token budget tracking

**Exit criteria**: Claude Desktop user có thể chat `"help me free up 20GB safely"` và tool hoạt động; CLI user có thể dùng AI mode mà không hiểu MCP.

### Phase 5 — Closed Beta (Week 11-14, parallel với Phase 4)

Song song với Phase 4, start closed beta:
- Invite 15-25 trusted developer contacts
- Private Discord/Telegram cho feedback
- Weekly release cycle
- Public bug tracker (private repo)
- Iterate trên UX dựa trên feedback
- Accumulate testimonials cho public launch

### Phase 6 — Public Launch (Week 15-16)

- [ ] Flip GitHub repo public
- [ ] Homebrew tap setup (`brew tap lexmanh/shed`)
- [ ] Scoop manifest cho Windows
- [ ] npm publish stable
- [ ] Landing page trên GitHub Pages với demo GIF
- [ ] Blog post comparing với dev-cleaner, npkill, kondo
- [ ] Submit: Hacker News, Reddit (r/programming, r/node, r/macapps), Product Hunt
- [ ] Vietnamese community: Daynhauhoc, J2team, Facebook groups
- [ ] Tweet thread từ Manh
- [ ] `llms.txt` cho AI crawlers

**Target**: 500+ GitHub stars trong tháng đầu, 50+ beta feedback iterations.

---

## Tech Stack (pinned decisions)

- **Runtime**: Node 22 LTS minimum
- **Language**: TypeScript 5.7+, strict mode
- **Monorepo**: pnpm workspaces (simpler hơn Turborepo cho scale này)
- **Build**: tsup (based on esbuild)
- **Test**: vitest + @vitest/coverage-v8
- **Lint/format**: biome (đủ tốt, nhanh hơn ESLint+Prettier)
- **CLI framework**: commander + @clack/prompts
- **Filesystem**: fast-glob, node:fs/promises
- **Subprocess**: execa
- **Logger**: pino
- **Secret storage**: keytar
- **User config**: conf
- **Trash**: trash (cross-platform)
- **AI SDK**: @anthropic-ai/sdk, openai, ollama (via fetch)
- **MCP**: @modelcontextprotocol/sdk

---

## Non-Goals (explicit)

Để tránh scope creep, những thứ sau **KHÔNG** thuộc Shed:

- GUI application (consider sau v1.0)
- Real-time monitoring / background daemon
- Cloud storage cleanup (S3, Dropbox, iCloud)
- Email/photo library cleanup
- Malware scanning
- System optimization ngoài disk space
- Uninstaller cho apps (CleanMyMac territory)

---

## Success Metrics

**Technical:**
- Safety bug rate: 0 data-loss incidents trong beta
- Test coverage: > 80% overall, 100% safety-critical
- CI: xanh trên cả 3 OS
- Cold startup: < 200ms

**Community (post-launch):**
- 500+ GitHub stars trong 30 ngày đầu
- 10+ external contributors
- 50+ GitHub Discussions threads
- Mention trong ít nhất 3 dev newsletters

**User value:**
- Average disk space freed per user: > 10GB
- User-reported "broke my project" rate: < 0.1%

---

## Risks & Mitigations

| Risk | Probability | Mitigation |
|---|---|---|
| Safety bug destroys user data | Low (nhờ tiered system) | Test coverage, beta period, Trash default |
| Cross-platform fragmentation | Medium | CI matrix, platform abstraction layer |
| AI costs spiral | Medium | Token budget, Ollama fallback, opt-in |
| Feature creep trước launch | High | Non-goals list, strict phase gates |
| Burnout (solo maintainer) | Medium | Closed beta gives feedback loop, Phase 6 planned for community contrib |

---

## Open Questions (decide during Phase 0-1)

1. Tên npm package scope: `@lexmanh` (cần register org) vs `@manh/shed-*` (personal) vs unscoped `@lexmanh/shed-cli`?
2. License: MIT (max adoption) vs Apache 2.0 (patent protection)?
3. Đã có domain `shed.dev`? Check availability.
4. Beta tester recruiting: team cũ? Twitter? Vietnamese dev community?

Các quyết định này có thể defer đến cuối Phase 1.
