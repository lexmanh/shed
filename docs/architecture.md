# Architecture

> Technical reference for contributors. Read `PRODUCT_VISION.md` for vision and roadmap first.

---

## 1. Monorepo Structure

```
packages/
├── core/        # Pure logic, no user I/O. Fully unit-testable.
├── cli/         # Commander + clack UI. Depends on core.
├── agent/       # AI provider abstraction. Depends on core.
└── mcp-server/  # MCP server for Claude Desktop. Depends on core + agent.

# Planned (Phase 7):
└── fleet/       # SSH fleet management. Depends on core.
```

### Dependency direction — strict

```
cli ───────┐
agent ─────┼──► core
mcp-server ┤
fleet ─────┘
```

`core` **never** imports from any sibling package. `fleet` depends on `core` to reuse detector logic — it does **not** depend on `cli` or `agent`. When AI features need fleet data, `agent` depends on `fleet` via public API, never the reverse.

### Package responsibilities

- **core**: Project detection, filesystem scanning, safety checks, risk classification. Exports pure functions + classes. No prompts, no console.log for users.
- **cli**: Argument parsing, interactive prompts, output formatting, progress display. Thin — UI layer over core only.
- **agent**: Wraps AI providers (Anthropic, OpenAI, Ollama, etc.) behind a unified interface. Handles API keys via `keytar`. Privacy-first: always prompt user before sending data to external APIs.
- **mcp-server**: Implements MCP tool schema for scan/analyze/cleanup. Reuses core logic.
- **fleet** *(planned — Phase 7)*: Agentless SSH transport. Runs on the admin's machine, no agent install on target servers.

---

## 2. Detector Catalog

Detectors live in `packages/core/src/detectors/`, organized into 8 groups:

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

**Critical:** `detect-only` remediation is reserved for database / WAL paths. Shed **never** deletes these — it only surfaces them with a suggested command for the operator to run manually.

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

## 3. Fleet Architecture (Phase 3)

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
│   │   ├── ssh.ts           # node-ssh wrapper
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

## 4. AI Agent Sub-features (Phase 5)

### 4.1 Disk pressure prediction

- Input: 30-day disk usage time series (collected via scheduled `shed fleet scan`)
- Model: simple linear regression, no ML framework required
- Output: *"Server X is projected to hit full in 4 days based on 1.2GB/day growth"*

### 4.2 Policy DSL

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

### 4.3 LLM root cause analysis

When disk usage grows abnormally:
- Agent calls MCP tools: `list_largest_dirs`, `analyze_growth`, `check_running_processes`
- LLM suggests: *"Container `api-prod` has been logging 2GB/hour since the 14:00 deploy. Dockerfile is missing `--log-opt max-size`. Suggested remediation: rotate logs + add log driver config."*
- User approves → agent executes remediation

### 4.4 Notification channels

- Slack (webhook URL)
- Telegram (bot token + chat ID)
- Discord (webhook)
- Email (SMTP)
- Generic webhook (POST JSON)
