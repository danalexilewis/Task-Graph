---
triggers:
  files: [".cursor/hooks/**", ".taskgraph/transcripts/**"]
  change_types: ["create", "modify", "document"]
  keywords: ["transcript", "agent-transcripts", "sessionEnd", "register id"]
---

# Transcript Collection

Collected copies of Cursor agent transcripts, stored alongside the task-graph DB under `.taskgraph/transcripts/` and keyed by **register id**.

## Purpose

- **Source:** Cursor writes transcripts to `~/.cursor/projects/<project-slug>/agent-transcripts/<uuid>/` (parent `.jsonl` + `subagents/*.jsonl`). See [.cursor/rules/agent-transcripts.mdc](../.cursor/rules/agent-transcripts.mdc).
- **Copy:** The sessionEnd hook (`.cursor/hooks/extract-learnings.js`) copies the "current" session into `.taskgraph/transcripts/<register_id>/` so transcripts sit next to the Dolt DB and can be referenced by a stable id.
- **Best-effort, local-only:** Copies are gitignored and not committed. No automatic cleanup; users may prune old dirs if needed.

## When copy runs (learningMode)

Copy and digest both run only when **learningMode** is enabled in `.taskgraph/config.json`. If `learningMode` is missing or false, the hook exits early and neither copies transcripts nor writes pending-learnings.md. This keeps one switch for the learnings pipeline and avoids writing under `.taskgraph/transcripts/` when learnings are disabled.

## Register id

- **Today:** Register id = Cursor session UUID = the folder name in `agent-transcripts/`. The hook infers "current" session as the **latest directory by mtime** in the transcripts dir (same heuristic as the extract-learnings digest). The copy directory is named with that UUID.
- **When `tg clock-in` exists:** Register id can be **tgid** (e.g. `ag-a1b2c3`). The agent writes tgid to a sidecar at clock-in; the sessionEnd hook reads it and uses tgid as the directory name when present, so the copy is tied to the clocked-in session. See [docs/agent-contract.md](agent-contract.md) for clock-in/clock-out.

## File layout

Each collected session is one directory under `.taskgraph/transcripts/`:

```
.taskgraph/transcripts/
  <register_id>/           ← UUID today; tgid when clock-in exists
    <uuid>.jsonl           ← parent (orchestrator) transcript; same name as source
    meta.json              ← optional: register_id, source_uuid, copied_at (tgid when available)
    subagents/
      <sub-uuid>.jsonl     ← one per dispatched sub-agent
```

Interior layout matches the source so existing tooling (grep, evolve, debug) can work on the copy. Optional `meta.json` provides traceability and a place for tgid when available. Idempotency: if the same `register_id` already exists, the hook overwrites it.

## When session id is unknown

The sessionEnd hook does not receive a session or conversation id in its payload. It therefore uses **latest directory by mtime** in `agent-transcripts/` as the "current" session. With multiple Cursor windows or unusual close order, the wrong session may be copied; when tgid exists, prefer naming by tgid to tie the copy to the session that actually clocked in.

## Related

- [.cursor/rules/agent-transcripts.mdc](../.cursor/rules/agent-transcripts.mdc) — transcript location, when to consult, how to list/grep/read
- [docs/agent-contract.md](agent-contract.md) — clock-in/clock-out and agent id (tgid)
