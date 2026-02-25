# Multi-Agent Centaur Model

This document describes how Task-Graph supports 2–3 simultaneous agents working alongside the human. The model is **centaur-first**: the human plans, audits, and routes; agents execute with shared visibility.

## What It Is

- **Publish + observe**: Agents broadcast intent (`tg start --agent`, `tg note`) and observe state (`tg status`). They do not negotiate with each other.
- **Append-only coordination**: Notes and events are append-only. Claims are idempotent check-then-set.
- **Zero config for single agent**: All multi-agent features are additive. A single agent ignoring `--agent` still works.

## What It Isn't

- **Not Gastown-style orchestration**: No mayor/coordinator agent. The human is the coordinator.
- **No convoys/swarms**: Overkill for 2–3 agents. We share one working copy.

## CLI Additions

| Command | Purpose |
|---------|---------|
| `tg start <taskId> --agent <name>` | Claim a task with identity; record in started event body |
| `tg start <taskId> --force` | Override claim when task is already being worked (human override) |
| `tg note <taskId> --msg <text> [--agent <name>]` | Append a note event; visible in `tg show` |
| `tg status` | Shows "Active work" section with doing tasks, agent_id, plan title, started_at |

## Conventions

1. **Always pass `--agent`** when multiple agents may be active.
2. **Read Active work** before picking a task. Avoid overlap.
3. **Leave notes** when changing shared interfaces.
4. **Do not pick** tasks in the same area as another doing task without human approval.

## Event Body Conventions

- **started**: `{ agent, timestamp }`
- **note**: `{ message, agent, timestamp }`

Missing `agent` is treated as `"unknown"`.
