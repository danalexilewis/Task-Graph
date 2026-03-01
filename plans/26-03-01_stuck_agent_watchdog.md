---
name: Stuck Agent Watchdog and Deacon Patterns
overview: Add stuck-agent detection and recovery - implementer self-awareness directive, orchestrator terminal-monitoring timeout protocol, and optional bash overseer daemon.
fileTree: |
  .cursor/
  ├── agents/
  │   └── implementer.md              (modify)
  ├── skills/work/
  │   └── SKILL.md                    (modify x2 - protocol + overseer integration)
  └── rules/
      └── subagent-dispatch.mdc       (modify)
  scripts/
  └── overseer.sh                     (create)
  docs/
  ├── agent-contract.md               (modify)
  └── leads/
      └── execution.md                (modify, if present)
risks:
  - description: Killing a PID that committed work and is just slow to call tg done orphans a done task in doing state
    severity: high
    mitigation: Only kill after confirming stall pattern in terminal - repeated same tool calls, sleep calls, no file changes. Never kill if recent output shows active file writes.
  - description: block_until_ms backgrounds the Task call but does not kill the sub-agent process
    severity: medium
    mitigation: Protocol explicitly documents that background = monitoring trigger, not kill. Orchestrator reads terminal, assesses stall, kills manually via shell kill command.
  - description: overseer.sh reads tg worktree list --json which may fail if Dolt server is down
    severity: low
    mitigation: Overseer wraps the command, writes an empty worktrees array on failure, and continues. Orchestrator falls back to direct terminal-file reads if status file is stale.
tests:
  - "pnpm gate:full passes after all rule/template/script changes"
todos:
  - id: implementer-loop-budget
    content: "Add loop budget and self-exit directive to implementer.md"
    agent: implementer
    changeType: modify
    intent: |
      Add two changes to .cursor/agents/implementer.md:

      1. In the ## MUST NOT DO section, add two new rules:
         - "Do not re-read the same terminal path more than 5 times in a row without making a file change between reads."
         - "Do not call sleep or wait for a process to change state more than 3 times in a row without other progress."

      2. In the prompt template body, add a short "Loop budget" paragraph after the existing "tg note for blockers" instruction. Keep it under 6 lines:

         "**Loop budget:** You have a 10-minute implementation budget. If you have attempted the same approach 3+ times without progress, or read the same terminal path 5+ times in a row without an intervening file change, you are stuck. Stop. Run `pnpm tg note <taskId> --msg 'STUCK: <brief pattern description>'`, then call `pnpm tg done <taskId> --evidence 'STUCK: exiting early to allow reassignment'` and return:
         VERDICT: FAIL
         REASON: stuck-loop (<pattern>)
         SUGGESTED_FIX: reassign via watchdog — fixer if partial work, re-dispatch if no work"

      Do not restructure existing sections. The goal is minimal, targeted additions.
    docs: agent-contract, agent-strategy

  - id: orchestrator-watchdog-protocol
    content: "Add orchestrator watchdog timeout protocol to work/SKILL.md and subagent-dispatch.mdc"
    agent: implementer
    changeType: modify
    intent: |
      Two files to update:

      1. `.cursor/skills/work/SKILL.md` — Find the existing "Sub-Agent Timeout" section (references 90s wall time, extend by 120s, max 2 times). Replace it entirely with this concrete protocol titled "Sub-Agent Watchdog Protocol":

         - Implementers run with a soft 10-minute budget (block_until_ms ~600000 on dispatch).
         - IMPORTANT: block_until_ms backgrounds the Task call but does NOT kill the agent. The agent keeps running in its terminal. Background = monitoring trigger, not kill signal.
         - If a Task call backgrounds (exceeded block_until_ms): read the terminal file for that agent (last 60 lines). Terminal files are at ~/.cursor/projects/<project>/terminals/<id>.txt; the PID is in the file header.
         - Stall heuristics (any one is sufficient to declare stall):
           a. 5+ consecutive reads of the same file path with no intervening file write
           b. 3+ consecutive `sleep` or `wait` calls
           c. Same error message repeated 3+ times without a different tool call in between
         - If stall confirmed:
           `kill -TERM <pid>` — wait 5 seconds — `kill -KILL <pid>` if still alive.
         - Run `pnpm tg note <taskId> --msg "WATCHDOG: killed at $(date -u +%Y-%m-%dT%H:%M:%SZ), stall pattern: <pattern>"`
         - Reassignment routing:
           - Check `git status` in the task's worktree. If uncommitted file changes exist → dispatch fixer with partial work context and stall note.
           - If no file changes at all → re-dispatch implementer once with note "prior attempt stalled on <pattern>, avoid this approach."
           - If re-dispatch also stalls → dispatch investigator to determine if the task itself is problematic.

      2. `.cursor/rules/subagent-dispatch.mdc` — In the "Escalation decision tree" section, add a "Watchdog (stuck agent)" path after the existing escalation paths. Keep it under 15 lines. Mirror the routing logic above. Note that the full protocol lives in work/SKILL.md.
    docs: agent-contract, multi-agent, agent-strategy

  - id: overseer-script
    content: "Write scripts/overseer.sh background daemon for filesystem-based staleness detection"
    agent: implementer
    changeType: create
    intent: |
      Create `scripts/overseer.sh` — a lightweight background bash daemon that monitors active worktrees for filesystem activity and writes a JSON status file. Uses zero AI tokens.

      Structure (follow scripts/cheap-gate.sh style — set -euo pipefail, clear exit codes):

      ```
      #!/usr/bin/env bash
      set -euo pipefail
      OUTPUT="${1:-/tmp/tg-overseer-status.json}"
      PID_FILE="${OUTPUT}.pid"
      echo $$ > "$PID_FILE"
      trap 'rm -f "$PID_FILE" "$OUTPUT"' EXIT
      ```

      Main loop (runs every 180s):
      1. Call `pnpm tg worktree list --json 2>/dev/null` to get active worktrees (task_id, path, branch).
         - On failure: write `{"timestamp":<epoch>,"worktrees":[],"error":"worktree-list-unavailable"}` and continue (do not exit).
      2. For each worktree path:
         - Compute `files_changed`: `find <path> -newer <path>/.tg-dispatch-marker -type f 2>/dev/null | wc -l`
           - If `.tg-dispatch-marker` does not exist: `files_changed=-1` (marker not set, unknown)
         - Compute `marker_age_seconds`:
           - macOS: `stat -f %m <path>/.tg-dispatch-marker`
           - Linux: `stat -c %Y <path>/.tg-dispatch-marker`
           - Detect OS: `if [[ "$(uname)" == "Darwin" ]]; then ...`
           - If marker missing: `marker_age_seconds=-1`
         - `stale=true` if `files_changed == 0` AND `marker_age_seconds > 300` (5 min without file changes)
      3. Write JSON atomically (write to temp file, then mv into place — readers always see complete JSON):
         `{"timestamp":<epoch>,"worktrees":[{"task_id":"<id>","path":"<path>","files_changed_since_marker":<n>,"marker_age_seconds":<n>,"stale":<bool>}]}`
      4. Auto-exit: if worktrees array is empty for 2 consecutive cycles, exit cleanly (no work to monitor).

      Additional requirements:
      - Use `flock` to ensure only one instance runs at a time (lock file: /tmp/tg-overseer.lock).
      - Make the script executable (chmod +x at creation, or note that it needs chmod +x).
      - Comment each section clearly — this script will be read/modified by future agents.
    docs: infra, multi-agent

  - id: overseer-integration
    content: "Integrate overseer.sh into work/SKILL.md - sentinel marker and fast-path check"
    agent: implementer
    changeType: modify
    blockedBy: [orchestrator-watchdog-protocol, overseer-script]
    intent: |
      Three small additions to `.cursor/skills/work/SKILL.md`. Total additions: under 12 new lines.

      1. Before the task execution loop (near where agents are dispatched in the first wave), add an optional setup step:
         "Optionally launch the overseer daemon before the first dispatch: `bash scripts/overseer.sh /tmp/tg-overseer-status.json &`
         The daemon runs in background, writes filesystem staleness data every 180s. No action needed if Dolt is unavailable — it degrades to an empty status file."

      2. In the dispatch step where `tg start <taskId> --worktree` is called and the worktree path is obtained, add one line immediately after:
         "`touch <worktree_path>/.tg-dispatch-marker` — sets the baseline timestamp for overseer staleness detection."

      3. In the watchdog check (the "Sub-Agent Watchdog Protocol" added by the orchestrator-watchdog-protocol task), add a fast-path before reading terminal files:
         "Fast-path: if `/tmp/tg-overseer-status.json` exists and is less than 6 minutes old, `cat` it and check for any worktrees with `stale: true`. Use these as candidates for the watchdog protocol. If the file is missing or stale (>6 min), skip to direct terminal-file reads."

      Do not move or restructure existing content — only insert at the three indicated points.
    docs: multi-agent, infra

  - id: doc-updates
    content: "Update docs/agent-contract.md and docs/leads/execution.md to document watchdog escalation path"
    agent: documenter
    changeType: modify
    blockedBy: [implementer-loop-budget, orchestrator-watchdog-protocol]
    intent: |
      Two documentation updates:

      1. `docs/agent-contract.md` — In the escalation ladder section, add a "Stuck agent / watchdog" path as a distinct entry after the "2 failures → fixer" entry:
         - Stuck agent (stall detected by orchestrator) → kill PID → if partial work in worktree: dispatch fixer; if no work done: re-dispatch implementer → if still stalling: dispatch investigator → if investigator escalates: human
         - Add a one-line note: "Full protocol: .cursor/skills/work/SKILL.md → Sub-Agent Watchdog Protocol"

      2. `docs/leads/execution.md` — If this file exists: find any mention of "90s timeout" or timeout-related text. Replace/extend it to describe the three-layer watchdog system:
         - Layer 1: Implementer self-awareness (loop budget directive)
         - Layer 2: Orchestrator terminal-monitoring protocol (work/SKILL.md)
         - Layer 3: Bash overseer daemon (scripts/overseer.sh, optional)
         If the file does not exist, skip it and note in the evidence.

      Do not change any other sections. Do not alter file structure beyond the targeted additions.

  - id: run-full-suite
    content: "Run full test suite to confirm no regressions"
    agent: implementer
    changeType: modify
    blockedBy:
      [
        implementer-loop-budget,
        orchestrator-watchdog-protocol,
        overseer-script,
        overseer-integration,
        doc-updates,
      ]
    intent: |
      Run `pnpm gate:full` from the repo root. Report full output.
      Evidence: "gate:full passed" or "gate:full failed: <summary>".
isProject: false
---

## Analysis

The core problem: sub-agents (Cursor Task tool invocations) can enter degenerate loops — repeating the same terminal reads, calling sleep, or retrying a failed approach indefinitely. They cannot self-destruct because they are function invocations. The orchestrator currently has no mechanism to check on them mid-execution.

The research session identified three complementary layers of protection, each independently useful:

1. **Self-awareness (implementer.md)** — Cheapest. The sub-agent itself recognizes it is stuck and exits cleanly with a structured STUCK verdict. Requires the sub-agent to be following instructions, which fast models sometimes don't. First line of defense.

2. **Orchestrator timeout protocol (work/SKILL.md + subagent-dispatch.mdc)** — Medium cost. Works even when the sub-agent ignores the self-awareness directive. Uses `block_until_ms` as a soft timeout, then terminal-file analysis + PID kill. The key insight: `block_until_ms` backgrounds the call but does NOT kill the agent — the agent is still running and must be killed explicitly via shell.

3. **Bash overseer daemon (scripts/overseer.sh)** — Optional, zero AI tokens. A background script that watches worktree filesystem activity and writes a JSON status file. Gives the orchestrator a fast pre-check before reading terminal files. Most useful when running 5+ parallel agents.

## Dependency Graph

```
Parallel start (3 unblocked):
  ├── implementer-loop-budget      (implementer.md self-awareness directive)
  ├── orchestrator-watchdog-protocol (work/SKILL.md + subagent-dispatch.mdc)
  └── overseer-script              (scripts/overseer.sh new file)

After orchestrator-watchdog-protocol + overseer-script:
  └── overseer-integration         (integrate overseer into work/SKILL.md)

After implementer-loop-budget + orchestrator-watchdog-protocol:
  └── doc-updates                  (agent-contract.md + execution.md)

After all above:
  └── run-full-suite
```

## Proposed Changes

### Layer 1: Implementer Self-Awareness

Add to `## MUST NOT DO` in `implementer.md`:

```
- Do not re-read the same terminal path more than 5 times in a row without a file change between reads.
- Do not call sleep or wait for a process to change state more than 3 times in a row.
```

Add "Loop budget" paragraph to the prompt body:

```
**Loop budget:** You have a 10-minute implementation budget. If you have attempted the same approach 3+ times
without progress, or read the same terminal path 5+ times without a file change, you are stuck. Stop.
Run `pnpm tg note <taskId> --msg 'STUCK: <pattern>'`, call `pnpm tg done <taskId> --evidence 'STUCK: exiting early'`
and return VERDICT: FAIL / REASON: stuck-loop / SUGGESTED_FIX: reassign via watchdog.
```

### Layer 2: Watchdog Routing

```
Sub-agent backgrounds (block_until_ms exceeded)
    ↓
Read terminal file (last 60 lines) → check stall heuristics
    ↓ stall confirmed
kill -TERM <pid> → kill -KILL <pid> (after 5s)
    ↓
tg note WATCHDOG: killed at <ts>, stall: <pattern>
    ↓
git status in worktree
    ├── Has uncommitted changes → dispatch fixer (partial work)
    ├── No changes, first kill → re-dispatch implementer (avoid prior pattern)
    └── No changes, second kill → dispatch investigator (task may be problematic)
```

### Layer 3: Overseer Daemon Architecture

```
orchestrator
  ├── bash scripts/overseer.sh /tmp/tg-overseer-status.json &
  └── touch <worktree>/.tg-dispatch-marker (at dispatch time)

overseer (every 180s)
  ├── tg worktree list --json → get active paths
  ├── find <path> -newer .tg-dispatch-marker | wc -l → files_changed
  └── writes { worktrees: [{ task_id, path, files_changed, stale }] }

orchestrator watchdog check
  ├── cat /tmp/tg-overseer-status.json (fast path, if fresh)
  └── stale:true candidates → read terminal file → kill if confirmed
```

## Open Questions (Resolved)

- **`block_until_ms` kills the agent?** No. It backgrounds the Task call in the orchestrator UI but the agent process keeps running. The protocol explicitly documents this: background = monitoring trigger, not kill. Orchestrator kills manually.
- **What counts as "stuck"?** Same path read 5+ times in a row with no intervening file write. Not "reading files slowly" — slow progress is fine.
- **Phase C optional?** Yes. Marked in the dependency graph — the plan is fully useful with just Phase A + B. Phase C adds a fast pre-check but is not required for correctness.

<original_prompt>
I think I understand why gas town has a deacon. sometimes the agents get really stuck and just do dumb stuff like hit sleep. I said they should have a maximum time up. They are just function invocations. But I think they dont have the ability to self destruct so the orchistrator needs to do it. but they are busy trying to coordinate or maybe not maybe they need to do some monitoring of the agents. every 5 min that a sub-agent is running the orchistrator looks at it and if its just stuck on reading terminal outputs to many different ways or saying its sleepy. actually if its not making good enough progress. then we kill it and reassas what we are doing with that task. fire off an ivestigator.

The other thing we could do is have a deacon sub agent that the lead spins up that monitors the others. That may work? Look online for patterns like this.
</original_prompt>
