# CLI Reference Accuracy Review

**Date:** 2026-03-03  
**Scope:** `docs/cli-reference.md` vs `pnpm tg --help` (and subcommand helps)  
**Task:** 9111667c-f0ca-4738-8e3f-44429cbf0900 (Doc Review Benchmark)

## Summary

Comparison of the CLI reference against live `tg --help` output found **inaccuracies**, **missing commands**, and **missing or wrong option descriptions**. No edits were made to the doc (read-only review).

---

## 1. Global options

- **`--agent-id <tgid>`** — Documented in the doc as a global option (with `TG_AGENT_ID` and `requireAgentId`). **Not shown** in `tg --help` output. Either the option is not registered in the CLI or it is env-only; the doc should clarify or the help should expose it.

---

## 2. Missing commands

- **`tg recover`** — Exists in CLI: *"Reset stale doing tasks (idle > threshold hours) back to todo"* with options `--threshold <hours>` (default 2), `--dry-run`. The doc only mentions clearing stale tasks via `tg done <taskId> --evidence "completed previously" --force` and does not document `tg recover`.

- **`tg server`** — Exists in CLI: *"Manage the background dolt sql-server for fast tg commands"* with subcommands `start`, `stop`, `status`. Not mentioned in the doc.

- **`tg initiative show <initiativeId>`** — Subcommand exists (`show [options] <initiativeId>` with `--json`). The doc documents `initiative new`, `list`, `assign-project`, and `backfill` but not `show`.

---

## 3. Wrong or outdated descriptions

- **`tg sync`** — Doc says *"No `tg sync` yet"* and *"Planned: A future `tg sync` may wrap Dolt pull/push..."*. The CLI already provides `tg sync` with `--push` and `--pull`. The "Multi-machine workflow and sync" section is **outdated**.

- **`tg setup` options** — Doc lists **`--no-cursor`** under Options. The CLI has **`--cursor`** (opt-in: *"Also scaffold Cursor rules, agents, skills, and AGENT.md into .cursor/"*). The implementation note correctly says "use `--cursor` to also scaffold"; the Options list should describe `--cursor`, not `--no-cursor`.

---

## 4. Missing options (documented commands)

- **`tg next`** — CLI has `--all` (*"Include canceled tasks and abandoned plans"*). Not mentioned in the doc.

- **`tg cancel`** — CLI has `--include-done` (*"Allow canceling projects that are already done (mark as abandoned)"*). Doc says commands "Refuse to cancel plans in `done` or `abandoned`" but does not document this override.

- **`tg stats`** — CLI has `--benchmark` (*"Filter benchmark projects"*) and `--recovery` (*"Include recovery metrics: investigator fix rate"*). Not mentioned in the doc.

---

## 5. Duplicate section

- **`tg import`** — The command is fully documented once near the top (with `--plan`, `--format`, `--initiative`, `--external-key-prefix`, `--no-suggest`, `--force`, `--benchmark`, `--replace`, Cursor format). A second, shorter **`tg import <filePath>`** section appears later (around line 634) with overlapping content and slightly different wording. Recommend merging or removing the duplicate.

---

## 6. Verified accurate (sample)

- Main command list and subcommand names match.
- `tg init`, `tg project`, `tg plan` (deprecated), `tg task new`, `tg edge add`, `tg block`, `tg start`, `tg done`, `tg worktree list`, `tg gate create/resolve/list`, `tg export mermaid/dot/markdown`, `tg context`, `tg crossplan`, `tg dashboard`, `tg evolve health/record-finding/recurrences`, `tg status`, `tg agents`, `tg cycle new/list`, `tg initiative new/list/assign-project/backfill`, `tg portfolio overlaps/hotspots`, `tg template apply` — presence and basic usage align with the doc.
- Global `--json`, `--no-commit`, `--commit-msg` match help.

---

## Recommendations

1. Add sections for **`tg recover`** and **`tg server`** (and **`tg initiative show`**).
2. Update the **sync** subsection to describe current `tg sync [--push] [--pull]` behavior and remove "No tg sync yet" / "Planned".
3. In **`tg setup`**, replace the `--no-cursor` option with **`--cursor`** (opt-in to scaffold `.cursor/`).
4. Add **`--all`** to `tg next`, **`--include-done`** to `tg cancel`, and **`--benchmark`** / **`--recovery`** to `tg stats`.
5. Clarify or add **`--agent-id`** to global options (or document that it is env-only and not in help).
6. Remove or merge the **duplicate `tg import`** section.
