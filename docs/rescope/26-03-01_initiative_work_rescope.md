# Rescope: Initiative-Project-Task Hierarchy (faster delivery)

**Date:** 2026-03-01  
**Directive:** Initiative work is too slow; rescope to deliver faster.

---

## Directive (from you)

Reduce scope of the Initiative-Project-Task Hierarchy plan so remaining work can ship quickly. Defer the slow, interactive onboarding task; keep only the bounded code tasks (parser, import, status, docs).

---

## Current state (assessed)

- **Done:** Schema (initiative table, plan→project rename, default Unassigned), domain types (partial; Initiative type was in an orphaned commit), `tg initiative` list/new/show, plan→project refs in show/next/cancel/export/context/crossplan/note.
- **Doing (stale):** 4 tasks — init onboarding (tg-6839d5), plan-import parser (tg-052c7f), tg import (tg-4d67f2), tg status rollup (tg-5d28d7). One blocked: docs (tg-9747fc).
- **Why it felt slow:** init-cycle-and-initiatives (tg-6839d5) requires interactive prompts in tg init/setup, Config.strategicCycle, multi-step onboarding, and shared prompt logic — large blast radius and long implementer runs.

---

## Rescope decisions

| Item                           | Before                                                                                       | After                                                                                                                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **tg init / setup onboarding** | Task: add strategic cycle + “how many initiatives?” + create N initiatives after migrations. | **Deferred.** No interactive onboarding in tg init. Users run `tg initiative new` manually after init. Unassigned initiative already exists from migration.                             |
| **Parser + importer**          | Update for project model, initiative field in frontmatter.                                   | **In scope.** Single task (tg-052c7f); bounded to plan-import/ + export.                                                                                                                |
| **tg import**                  | Create projects, --initiative flag, default Unassigned.                                      | **In scope.** Single task (tg-4d67f2); bounded to import.ts.                                                                                                                            |
| **tg status**                  | Initiative rollup, project terminology.                                                      | **In scope.** Single task (tg-5d28d7). Narrow to: project terminology in status output + optional one-line initiative summary (e.g. “Initiatives: N”). Full rollup UI can follow later. |
| **Docs**                       | schema.md, cli-reference.md, plan-format.md.                                                 | **In scope.** One doc task (tg-9747fc) after code tasks; remains blocked.                                                                                                               |

---

## Gaps and clarifications

- **Config.strategicCycle:** Not added in this rescope. Can be added later if/when init onboarding is reintroduced.
- **tg setup re-onboarding:** Deferred with init onboarding; no cycle/initiative prompts in setup for now.
- **Full initiative rollup in status:** Optional follow-up; this rescope keeps status change minimal (terminology + small initiative hint).

---

## Recommended next steps

- [x] **Cancel** task tg-6839d5 (“Add strategic cycle and x initiatives onboarding to tg init”) with reason: _Rescoped: init/setup onboarding deferred for faster delivery; see docs/rescope/26-03-01_initiative_work_rescope.md._
- [ ] **Continue** with tg-052c7f (parser/importer), tg-4d67f2 (import), tg-5d28d7 (status — minimal rollup), then tg-9747fc (docs). Run implementers as usual; no change to task definitions beyond the status narrow above.
- [ ] **Later (backlog):** Revisit init/setup onboarding as a small, separate plan (single task or two: config + init prompts) when needed.

---

## Summary

**Out of scope for this pass:** Interactive strategic cycle and x-initiatives onboarding in tg init and tg setup.  
**In scope:** Parser/importer for project model, tg import with --initiative, tg status with project terminology and minimal initiative hint, then docs. Delivering those four tasks finishes the rescoped Initiative work quickly.
