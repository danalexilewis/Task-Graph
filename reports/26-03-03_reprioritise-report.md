# Reprioritise report

**Date:** 2026-03-03

## Are these the right projects to be active?

**Yes**, with one caveat. The two active projects — **OOD/Act Sub-Agent Behaviour** and **CQRS Write Queue for Agent I/O** — are both high-leverage: OOD/Act improves agent speed and iteration quality; CQRS improves agent I/O reliability. The mix is appropriate for the current focus on execution quality.

**Caveat:** CQRS has 1 task in progress and 2 blocked. If blockers remain unresolved for long, consider pausing CQRS and letting the agent focus on OOD/Act’s 2 runnable tasks. No change is required today.

---

## Prioritised project list

### Active (in progress)

1. **OOD/Act Sub-Agent Behaviour - Speed and Iterations** — 2 runnable, 4 done. Direct impact on agent execution; finish these tasks.
2. **CQRS Write Queue for Agent I/O** — 1 doing, 2 blocked, 5 done. Important I/O path; unblock when feasible.

### Draft projects with runnable work (by suggested priority)

3. **Bulk context for tg context** — 5 todo, all runnable. High ROI for multi-task dispatch; activate when capacity allows.
4. **Short Hash Task IDs** — 2 todo runnable, 6 done. Near completion; quick win.
5. **Context Budget and Compaction** — 3 todo runnable, 4 done. Complements bulk context.
6. **Task Templates (Formulas)** — 6 todo runnable. Extends plan authoring.
7. **Persistent Agent Stats** — 4 todo runnable. Enables metrics/analytics.
8. **TaskGraph MCP Server** — 6 todo runnable. Expands integration surface.
9. **Meta-Planning Skills** — 5 todo runnable. Cross-plan tooling.
10. **External Gates** — 6 todo runnable. Pipeline / gate integration.
11. **Dolt Branch Per Agent** — 7 todo runnable. Multi-agent isolation.
12. **Dolt Replication** — 5 todo runnable. Multi-machine sync.
13. **Dashboard Improvements** — 4 todo, 2 blocked. Activate when unblocked.
14. **Cheap Gate Typecheck Hygiene** — 2 todo, 1 blocked. Activate when unblocked.
15. **Tactical Escalation Ladder** — 3 todo, 3 blocked. Depends on unblocking.

---

## Ready count

| Metric | Value |
|--------|-------|
| Before | ~35 runnable (from `tg next --limit 50`) |
| Target | ≥ 10 |
| After | Same — target already met |

---

## Actions taken

- **Priority set** on 15 plans with runnable work (from reprioritise prioritised list):

| Priority | Plan |
|----------|------|
| 1 | OOD/Act Sub-Agent Behaviour - Speed and Iterations |
| 2 | CQRS Write Queue for Agent I/O |
| 3 | Bulk context for tg context |
| 4 | Short Hash Task IDs |
| 5 | Context Budget and Compaction |
| 6 | Task Templates (Formulas) |
| 7 | Persistent Agent Stats |
| 8 | TaskGraph MCP Server |
| 9 | Meta-Planning Skills |
| 10 | External Gates |
| 11 | Dolt Branch Per Agent |
| 12 | Dolt Replication |
| 13 | Dashboard Improvements |
| 14 | Cheap Gate Typecheck Hygiene |
| 15 | Tactical Escalation Ladder |

`tg status --projects` and `tg next` now order by these priorities (1 = first in queue).
