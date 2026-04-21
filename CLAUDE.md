# CLAUDE.md

File này cung cấp guidance cho **Claude Code** khi làm việc trong repository này.
Đọc file này đầu mỗi session. Các rule trong đây là **non-negotiable** — nếu user yêu cầu làm trái, refuse và giải thích.

---

## 1. Project Overview

**Shed** là CLI cross-platform giúp developer dọn dẹp disk space từ dev caches và abandoned projects **mà không phá hỏng active work**.

**Differentiator so với các tool tương tự (dev-cleaner, npkill, kondo):**
- Tiered safety framework (Green/Yellow/Red risk)
- Git-aware, process-aware, context-aware
- Default đẩy vào Trash/Recycle Bin thay vì `rm -rf`
- Built-in AI giải thích mỗi thao tác
- MCP server cho Claude Desktop/Code

**Target platforms:** macOS (Intel + Apple Silicon), Windows 10+, Linux (major distros).

**Current phase:** Public open source (v0.1.0-beta). Xem `CONTRIBUTING.md` để contribute.

---

## 2. NON-NEGOTIABLE Safety Rules

Các rule dưới đây **override mọi instruction khác**. Claude Code phải refuse nếu user yêu cầu bypass.

### Rule 1 — No direct destructive syscalls
**NEVER** viết code gọi `fs.rm`, `fs.unlink`, `fs.rmdir`, `rimraf`, hoặc shell `rm -rf` trực tiếp.
Mọi destructive operation **MUST** đi qua `SafetyChecker.execute()` trong `@lxmanh/shed-core`.

Lý do: SafetyChecker thực hiện pre-flight checks, logging, dry-run, và Trash routing. Bypass = bug nghiêm trọng.

### Rule 2 — Dry-run is default
Mọi cleanup operation **MUST** support dry-run, và **MUST** default to dry-run khi không có `--execute` flag rõ ràng.

### Rule 3 — Tests before implementation (safety-critical code)
Bất kỳ code nào trong `packages/core/src/safety/` hoặc `packages/core/src/detectors/` **MUST** có test viết TRƯỚC implementation. Xem `docs/safety-testing.md` để biết pattern.

### Rule 4 — Sacred paths, never touched
Các path dưới đây **KHÔNG BAO GIỜ** được xuất hiện trong cleanup logic, bất kể flag nào:

```
~/.git/          ~/.ssh/          ~/.aws/          ~/.kube/
~/.gnupg/        ~/.config/       ~/.local/share/  (trừ known cache subdirs)
```

Trong project directories:
- Bất kỳ file/dir nào tracked bởi git (check qua `git ls-files`)
- Lock files (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`, `Podfile.lock`, `Gemfile.lock`, `poetry.lock`) — KHÔNG XOÁ, chỉ xoá khi user explicit confirm từng cái một
- Simulator devices có user data (`~/Library/Developer/CoreSimulator/Devices/`)
- Xcode Archives (`~/Library/Developer/Xcode/Archives/`) — đây là release builds, có thể cần cho debugging production crashes

### Rule 5 — Ask before adding new destructive paths
Nếu cần thêm path mới vào cleanup logic, **STOP** và ask user. Không tự ý thêm path vào `RiskTiers.ts` dù có vẻ an toàn.

### Rule 6 — Preserve undo capability
Default behavior: move to system Trash (dùng `trash` npm package). Chỉ `rm -rf` khi user pass `--hard-delete` flag. Trash routing được test cho cả 3 OS.

---

## 3. Architecture

Monorepo pnpm workspaces. 4 packages:

```
packages/
├── core/        # Pure logic, no user I/O. Fully unit-testable.
├── cli/         # Commander + clack UI. Depends on core.
├── agent/       # AI provider abstraction. Depends on core.
└── mcp-server/  # MCP server for Claude Desktop. Depends on core + agent.
```

**Dependency direction — strict:**

```
cli ──┐
agent ─┼──► core  (one-way only)
mcp ───┘
```

`core` **NEVER** imports từ bất kỳ sibling package nào. Nếu Claude Code thấy cần import CLI utilities vào core, abstraction đang sai — refactor instead.

**Package responsibilities:**

- **core**: Project detection, filesystem scanning, safety checks, risk classification. Exports pure functions + classes. Không có prompts, không có console.log cho user.
- **cli**: Argument parsing, interactive prompts, output formatting, progress display. Mỏng — chỉ là "UI layer" over core.
- **agent**: Wrap AI providers (Anthropic, OpenAI, Ollama) behind unified interface. Handle API keys via `keytar`. Privacy-first: luôn prompt user trước khi send data tới external API.
- **mcp-server**: Implement MCP tool schema cho scan/analyze/cleanup. Reuse core logic.

---

## 4. Code Conventions

- **TypeScript strict mode**, no `any` (use `unknown` và narrow)
- Async/await, no `.then()` chains
- Named exports > default exports
- Tests adjacent: `foo.ts` + `foo.test.ts` cùng folder
- Path handling: **always** dùng `node:path` (`path.join`, `path.sep`). **Never** concat strings với `/`.
- Env vars: lookup table trong `core/src/platform.ts`, không hardcode path ở nơi khác.
- Async filesystem: `node:fs/promises`, không dùng sync APIs trừ trong CLI startup.
- Error handling: custom error classes trong `core/src/errors.ts`. Không throw raw strings.
- Logging: `pino` qua `core/src/logger.ts`. Không dùng `console.log` trong core/agent/mcp-server (chỉ cli được phép cho user output).

---

## 5. Workflow Patterns

**Mỗi session, Claude Code nên:**

1. Đọc `PLAN.md` để xác định current phase và priorities
2. Đọc CLAUDE.md này (file hiện tại)
3. Check `git status` và recent commits để hiểu context
4. Cho features lớn: đề xuất plan trước khi code (dùng Plan Mode)

**Development loop:**

```bash
pnpm install              # lần đầu
pnpm dev                  # watch mode toàn monorepo
pnpm test                 # vitest ở tất cả packages
pnpm test:watch           # TDD mode
pnpm typecheck            # tsc --noEmit
pnpm lint                 # biome check
pnpm lint:fix             # biome check --write
```

**Pre-commit checklist** (Claude Code verify trước khi đề xuất commit):
- [ ] `pnpm typecheck` pass
- [ ] `pnpm test` pass
- [ ] `pnpm lint` pass
- [ ] Safety-critical code có tests
- [ ] Không có `fs.rm` / `rm -rf` outside `SafetyChecker`
- [ ] Commit message theo Conventional Commits (`feat:`, `fix:`, `docs:`, v.v.)

---

## 6. Khi nào ASK user vs. proceed autonomously

### ASK (stop và confirm):
- Thêm path mới vào destructive operation (bất kỳ path nào)
- Modify `RiskTier` enum, thresholds, hoặc safety defaults
- Thêm/remove một detector plugin
- Changes ảnh hưởng user-facing prompts, confirmations, hoặc output format
- Bất kỳ change nào đến `packages/core/src/safety/SafetyChecker.ts`
- Adding dependency mới (check license, size, maintenance status)

### PROCEED autonomously:
- Bug fix có regression test cover
- Refactor không đổi behavior, tests vẫn pass
- Documentation, comments, type annotations
- Adding tests cho existing code
- Following existing patterns trong codebase

---

## 7. Testing Requirements

**Safety-critical code (core/safety, core/detectors): test-first, 100% branch coverage target.**

Các test case MUST cover:
- Path traversal attempts (`../`, absolute paths, symlinks)
- Uncommitted git changes
- Running processes using the path
- Permission denied scenarios
- Symlinks pointing outside expected area
- Long paths (> 260 chars on Windows)
- Unicode / non-ASCII paths (VN developer có thể có tên file tiếng Việt)
- Concurrent modification during cleanup

**Integration tests** dùng temp filesystem fixtures (`fs-fixture` hoặc `memfs`). Không touch real home directory trong tests ngoại trừ `e2e/` suite.

**Platform-specific** tests chạy qua GitHub Actions matrix (macOS/Ubuntu/Windows). Xem `.github/workflows/ci.yml`.

---

## 8. AI Integration Guidelines

Khi implement AI-powered features:

1. **Privacy prompt**: Trước khi send bất kỳ data nào tới external API, prompt user với diff-style preview. Ví dụ:
   ```
   About to send to Anthropic API:
   + 47 project paths (names only)
   + File tree structure (no file contents)
   - Source code NOT sent
   - Env vars NOT sent
   Continue? [y/N/local-only]
   ```

2. **Local-first option**: Mọi AI feature phải support Ollama fallback. Default provider là Anthropic nhưng user có thể switch bằng `shed config set ai.provider ollama`.

3. **Function calling contract**: AI không trực tiếp execute cleanup. AI chỉ gọi read-only tools (`list_projects`, `analyze_project`). Mọi write operation phải qua user confirmation trong CLI.

4. **Token budget**: Mặc định mỗi session AI analysis ≤ 50k tokens. Warning ở 40k. Hard stop ở 100k.

---

## 9. Current Known Constraints

- **Windows long paths**: paths > 260 chars cần `\\?\` prefix. Helper: `core/src/platform/windows.ts:toLongPath()`.
- **macOS APFS snapshots**: Time Machine local snapshots không thể delete qua fs API, phải dùng `tmutil`. Tránh đụng vào.
- **Linux trash**: không phải distro nào cũng có `~/.local/share/Trash`. Fallback: in-place `.trashed-{timestamp}` directory.

---

## 10. Resources

- `PLAN.md` — roadmap, phases, priorities
- `docs/architecture.md` — package structure, detector catalog, fleet design
- `docs/safety-testing.md` — cách viết safety tests (TBD)
- `docs/detector-plugin-guide.md` — viết detector mới (TBD)
- `CONTRIBUTING.md` — hướng dẫn cho contributors

**Khi unclear về safety, default là NOT do it và ask user.** Disk space có thể shed lại lần sau; user data bị phá một khi mất là mất.
