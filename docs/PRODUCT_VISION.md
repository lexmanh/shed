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

| Persona | Primary pain | Shed value |
|---|---|---|
| **Developer** | `node_modules`, build caches filling up laptop | `shed scan ~/Projects` |
| **Sysadmin / DevOps** | Many Linux servers, disk full, scattered manual cleanup | `shed fleet clean` |
| **IT admin** | Managing dev team fleet, no consistent policy, no audit trail | `shed fleet` + policies + audit log |
| **Claude Code / Claude Desktop user** | Wants AI-assisted disk management | MCP server |

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

## 5. Detector Catalog

Detectors are organized into 8 groups in `packages/core/src/detectors/`:

```
detectors/
├── runtime/      # node, python, rust, go, ruby, java, dotnet
├── container/    # docker, podman, containerd
├── webserver/    # nginx, apache, caddy, iis
├── appserver/    # tomcat, jboss, pm2, gunicorn, unicorn, puma
├── database/     # mysql, postgres, mongo, redis (DETECT-ONLY)
├── messaging/    # rabbitmq, kafka, nats
├── system/       # journal, apt/yum/dnf/pacman, kernels, tmp, crash dumps
└── backup/       # rsnapshot, borg, restic, custom dumps
```

### Detector interface

```typescript
interface Detector {
  name: string;
  platforms: ('linux' | 'darwin' | 'win32')[];
  detect(ctx: ScanContext): Promise<DetectedItem[]>;
}

interface DetectedItem {
  path: string;
  size: number;
  tier: 'green' | 'yellow' | 'red';
  reason: string;
  remediation:
    | { kind: 'trash' }
    | { kind: 'command', cmd: string, requiresRoot: boolean }
    | { kind: 'detect-only', suggestion: string };
  metadata?: Record<string, unknown>;
}
```

**Critical:** `detect-only` tier is reserved for database / WAL paths. Shed **never** deletes these — it only surfaces them with a suggested command for the operator to run manually.

### Tier mapping reference (server stack)

| Item | Tier | Rationale |
|---|---|---|
| Nginx/Apache `.gz` rotated logs > 30 days | Green | Logrotate output, safe |
| `catalina.out` > 1GB | Yellow | Active log, needs proper truncation, not `rm` |
| MySQL `mysql-bin.*` | **Detect-only** | Must go through `PURGE BINARY LOGS`, affects replication |
| PostgreSQL `pg_wal/` above threshold | **Detect-only** | May indicate replication lag — never touch |
| Docker dangling images | Green | `docker image prune -f` is safe |
| Docker orphan volumes > 30 days | Yellow | May contain data, require confirmation |
| `/boot` old kernels | Yellow | Needs `apt autoremove`, not direct file deletion |
| `/var/cache/apt/archives` | Green | `apt-get clean` is safe |
| `~/.pm2/logs/*-error.log` > 100MB | Yellow | May contain useful debug info |

---

## 6. Fleet Architecture

### Design principles

- **Agentless** — no install on target servers, SSH key is sufficient
- **Local control plane** — `shed fleet` runs on the admin's machine, no central server
- **Stateless servers** — all state (config, history) lives in `~/.config/shed/fleet.db` (SQLite)
- **Read-heavy default** — `scan` is parallel by default; `clean` confirms per server

### Package layout

```
packages/fleet/
├── src/
│   ├── transport/
│   │   ├── ssh.ts          # node-ssh wrapper
│   │   └── exec.ts          # parallel exec with concurrency limit
│   ├── inventory/
│   │   ├── store.ts         # SQLite ~/.config/shed/fleet.db
│   │   └── types.ts
│   ├── commands/
│   │   ├── add.ts
│   │   ├── scan.ts
│   │   ├── clean.ts
│   │   └── watch.ts         # daemon mode
│   └── aggregator.ts
└── package.json
```

### CLI surface (draft)

```bash
shed fleet add server1.local server2.local --tag prod
shed fleet add db1.local --tag prod --no-clean   # detect-only mode
shed fleet list
shed fleet scan --tag prod
shed fleet scan --tag prod --json > report.json
shed fleet clean --tag dev --tier green --execute --yes
shed fleet watch --threshold 85
shed fleet remove server1.local
```

### Constraints

- SSH timeout: 30s per server
- Default concurrency: 5 (configurable)
- `--no-clean` tag: server is scan/report-only, never cleaned (for production DB servers)
- Every operation appended to `~/.config/shed/fleet-audit.log` with timestamp, host, affected items

---

## 7. AI Agent Layer

### Philosophy

AI **does not** replace the user's decision. It performs three roles:

1. **Observe** — gather metrics, predict trends
2. **Suggest** — propose actions with rationale
3. **Execute (with approval)** — run only after user confirms (via CLI or reply to Telegram/Slack)

**Absolute rule:** AI **never** runs `shed clean --execute` without a human-in-the-loop confirmation.

### Sub-features

#### 7.1 Disk pressure prediction
- Input: 30-day disk usage time series (collected via scheduled `shed fleet scan`)
- Model: simple linear regression, no ML framework required
- Output: *"Server X is projected to hit full in 4 days based on 1.2GB/day growth"*

#### 7.2 Policy DSL
File at `~/.config/shed/policy.yaml`:

```yaml
policies:
  - name: dev-servers-weekly
    match: { tag: dev }
    schedule: "0 2 * * 0"  # Sunday 2am
    actions:
      - tier: green
        execute: true
        notify: slack
      - tier: yellow
        execute: false       # dry-run only
        notify: slack

  - name: prod-emergency
    match: { tag: prod }
    trigger: disk_above_85
    actions:
      - tier: green
        execute: true
        notify: telegram
        require_approval: false
      - tier: yellow
        execute: false
        notify: telegram
        require_approval: true   # must reply "approve" to proceed
```

#### 7.3 LLM root cause analysis
When disk usage grows abnormally:
- Agent calls MCP tools: `list_largest_dirs`, `analyze_growth`, `check_running_processes`
- LLM suggests: *"Container `api-prod` has been logging 2GB/hour since the 14:00 deploy. Dockerfile is missing `--log-opt max-size`. Suggested remediation: rotate logs + add log driver config."*
- User approves → agent executes remediation

#### 7.4 Notification channels
- Slack (webhook URL)
- Telegram (bot token + chat ID)
- Discord (webhook)
- Email (SMTP)
- Generic webhook (POST JSON)

---

## 8. Non-Goals

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

## 9. Dependency Direction

```
cli ───────┐
agent ─────┼──► core
mcp-server ┤
fleet ─────┘
```

`fleet` depends on `core` to reuse detector logic. It **does not** depend on `cli` or `agent`. When AI features need fleet data (auto-remediation), `agent` depends on `fleet` via public API, never the reverse.

---

## 10. Reading Order for Contributors

1. `README.md` — what Shed does
2. `CLAUDE.md` — safety rules (**non-negotiable**)
3. `PRODUCT_VISION.md` — this file (vision + roadmap)
4. `PLAN.md` — current phase technical detail
5. `CONTRIBUTING.md` — workflow

---

## 11. When Unsure

Default: **do not act, and ask.**

- Disk space can always be recovered later; user data, once lost, is lost.
- Every safety-adjacent decision errs on the side of caution.
- Conservative > clever, especially in destructive paths.
