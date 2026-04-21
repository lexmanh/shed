# PRODUCT_VISION.md

> **Living document.** Represents current intent and direction — not commitment.
> Roadmap, features, and priorities may shift based on user feedback and contributor bandwidth.
>
> Read alongside `CLAUDE.md` (safety rules — **non-negotiable**) and `PLAN.md` (active phase detail).
> When this file conflicts with `CLAUDE.md`: **CLAUDE.md wins** (safety is supreme).

---

## 1. Vision

**Safe disk hygiene for dev machines and Linux servers.**

Shed scans dev environments and Linux servers, classifies every cleanable item by risk tier, runs safety checks, and lets users reclaim space — centralized, auditable, agentic-ready.

**Invariant:** expanding scope never compromises safety. Every new detector passes through the tier framework (Green/Yellow/Red), defaults to dry-run, and routes to Trash when feasible.

---

## 2. Target Users

| Persona | Primary pain | Shed value | Status |
|---|---|---|---|
| **Developer** | `node_modules`, build caches filling up laptop | `shed scan ~/Projects` | ✅ Available |
| **Sysadmin / DevOps** | Many Linux servers, disk full, scattered manual cleanup | `shed fleet clean` | 🔲 Phase 7 |
| **IT admin** | Managing dev team fleet, no consistent policy, no audit trail | `shed fleet` + policies + audit log | 🔲 Phase 7–9 |
| **Claude Code / Claude Desktop user** | Wants AI-assisted disk management | MCP server | ✅ Available |

**Out of scope:**
- Non-technical end users (existing GUI tools cover this)
- Very large enterprise fleets (> 1000 servers) — requires dedicated observability platforms
- Realtime monitoring (not a cleanup tool's role)

---

## 3. Positioning & Differentiators

**Tagline:** *"The cleanup tool that respects your work in progress."*

Applies to both audiences — developers (uncommitted code) and sysadmins (production data).

### Core differentiators (consistent across all surfaces)

1. **Safety-first** — git-aware, process-aware, recency guard, sacred paths, Trash-by-default
2. **Cross-stack** — not just Node, not just Docker — covers the full dev + server stack
3. **Centralized fleet** — `shed fleet` agentless over SSH
4. **Agent-ready** — MCP server + auto-remediation policy engine with human-in-the-loop

---

## 4. Tentative Roadmap

> Pace assumes part-time maintenance. Phases are directional, not commitments.
>
> **Baseline (v0.1, complete):** developer tools for Node, Python, Rust, Docker, Flutter, Xcode, Android, IDE caches, CocoaPods — single machine, CLI + MCP server.
> Phases below represent planned expansion beyond this baseline.

### Phase 1 — Docker + Linux foundation
- Docker overlay2 analyzer, dangling images, build cache, orphan volumes
- System-level: `/var/log/journal`, `/var/cache/apt`, `/var/cache/yum`, old kernels in `/boot`, `/tmp`, crash dumps
- Nginx / Apache log detectors (rotated `.gz`, custom paths not in logrotate)

### Phase 2 — Web / app server stacks
- Tomcat: `catalina.out`, `localhost.{date}.log`, heap dumps `.hprof`
- IIS: `C:\inetpub\logs\LogFiles\W3SVC*\`, HTTPERR, Failed Request Tracing
- Node / PM2: `~/.pm2/logs/`, `pm2-logrotate` config validation
- Mail servers: Postfix / Exim queue, `mail.log`

### Phase 3 — SSH Fleet
- Homebrew tap + single binary (prerequisite: sysadmins don't have Node installed)
- New `packages/fleet/` — agentless SSH transport
- `shed fleet add/list/remove`, `shed fleet scan`, `shed fleet clean`, `shed fleet watch`
- Parallel execution with concurrency limits, result aggregation, retry, timeout

### Phase 4 — Database + messaging (detect-only)
- MySQL binary logs, PostgreSQL WAL, MongoDB diagnostic — **detect and warn, never delete**
- Redis RDB/AOF, RabbitMQ mnesia, Kafka log segments
- Backup tool repos: rsnapshot, Borg, Restic

### Phase 5 — AI Agent Layer
- Disk pressure prediction (growth rate forecasting)
- Auto-remediation policy engine with human-in-the-loop
- LLM-powered root cause analysis via MCP tools
- Notification integrations (Slack, Telegram, Discord, email, webhook)

**Guiding principle:** every feature shipped must be usable in real operational work. If a feature can't be dogfooded, it gets cut from the roadmap.

---

## 5. AI Agent Philosophy

AI **does not** replace the user's decision. It performs three roles:

1. **Observe** — gather metrics, predict trends
2. **Suggest** — propose actions with rationale
3. **Execute (with approval)** — run only after user confirms (via CLI or reply to Telegram/Slack)

**Absolute rule:** AI **never** runs `shed clean --execute` without a human-in-the-loop confirmation.

> Implementation details (policy DSL, notification channels, disk prediction model) are in [`docs/architecture.md`](architecture.md).

---

## 6. Non-Goals

Shed **will not** become:

1. **Realtime monitoring** — dedicated observability platforms cover this well
2. **Log aggregation / search** — dedicated logging platforms cover this well
3. **A backup tool** — dedicated backup tools cover this well (Shed only detects stale backup repos)
4. **Container orchestration** — not a Kubernetes tool
5. **Cleanup for non-server systems** — no Android, IoT, or embedded support
6. **A mass-market consumer GUI** — power-user dashboard only, never general consumer
7. **Auto-execute on Yellow/Red tier without human approval** — permanent rule
8. **Direct database file modification** — always detect-only

When a feature request falls outside this scope, contributors should expect it to be declined or redirected to a third-party detector plugin.

---

## 7. Reading Order for Contributors

1. `README.md` — what Shed does
2. `CLAUDE.md` — safety rules (**non-negotiable**)
3. `PRODUCT_VISION.md` — this file (vision + roadmap)
4. `docs/architecture.md` — package structure, detector catalog, fleet design
5. `PLAN.md` — current phase technical detail
6. `CONTRIBUTING.md` — workflow

---

## 8. When Unsure

Default: **do not act, and ask.**

- Disk space can always be recovered later; user data, once lost, is lost.
- Every safety-adjacent decision errs on the side of caution.
- Conservative > clever, especially in destructive paths.
