# Agentic System Performance Testing and Benchmarking

**Date:** 2026-03-01  
**Scope:** Research on how to test an agentic system for performance, typical problems to benchmark from problem definition to solution, and mapping to the Task-Graph codebase.  
**Produced by:** Research skill (web + vendor/ecosystem sources) and Report skill.

---

## 1. How to Test Agentic Systems for Performance

### 1.1 Evaluation dimensions (industry)

Multi-agent and agentic systems are evaluated across several dimensions. One established weighting (Aviso, 2025) is:

| Dimension    | Typical weight | What to measure                                               |
| ------------ | -------------- | ------------------------------------------------------------- |
| Reliability  | ~30%           | Task completion rate, correctness, review pass rate           |
| Speed        | ~25%           | Latency P50/P95, plan duration, tasks per hour                |
| Cost         | ~20%           | Token usage, cost per task/plan, quality-per-dollar           |
| Safety / fit | ~15% + 10%     | Scope adherence, no drift; integration with existing pipeline |

Composite scoring is often expressed as:  
`Composite = (w1 × Quality) − (w2 × Cost) − (w3 × Latency)` with weights tuned to priorities.

### 1.2 Latency targets (reference)

| Scenario                  | P50 target | P95 target |
| ------------------------- | ---------- | ---------- |
| Simple single-step query  | <500 ms    | <1 s       |
| Complex single-agent flow | <2 s       | <4 s       |
| Multi-agent orchestration | <3 s       | <6 s       |

For our system, “orchestration” is orchestrator + sub-agent round-trips (implementer → reviewer → done). Wall-clock plan duration and per-task elapsed time are the main observables.

### 1.3 Token and cost efficiency

- **Communication tax:** In multi-agent setups, duplicated context between agents (e.g. planner → reasoner → verifier) can reach high duplication rates; reducing context overlap is a direct lever for cost and latency.
- **Quality per dollar (Qp$):** Prefer metrics that combine outcome quality with cost (e.g. “resolved tasks per $” or “review pass rate per 1k tokens”) over raw accuracy or raw cost alone.
- **Trace-level telemetry:** OpenTelemetry-style traces (request = trace, each LLM call = span) with token counts, latency, and cost per span enable bottleneck analysis. Frameworks like TruLens, Agenta, and vendor-agnostic LLM tracers support this.

### 1.4 Benchmarks: problem definition → solution

Representative benchmarks that cover the full path from problem to solution:

| Benchmark                        | Problem definition                            | Solution workflow                                          | Metrics                                                 |
| -------------------------------- | --------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| **SWE-bench / Pro**              | GitHub issue + repo                           | Agent produces patch; FAIL_TO_PASS + PASS_TO_PASS tests    | Resolution rate (~40% on Pro), tests pass               |
| **KAMI v0.1**                    | Enterprise scenarios, contamination-resistant | Multi-step tool use, decision under uncertainty            | Cost–performance, token efficiency, behavioral patterns |
| **Galileo Agent Leaderboard v2** | Multi-turn, 5 industries                      | Action completion, tool selection                          | AC score, tool accuracy                                 |
| **AgencyBench**                  | 32 scenarios, 138 tasks, ~1M tokens           | Sandboxed execution, many tool calls, self-correction      | Success rate, Pass@k, steps to solve                    |
| **Jenova long-context**          | Decision-making under 100k+ tokens            | Orchestration under context pressure                       | Accuracy, latency, inference cost                       |
| **AgentRace** (efficiency)       | Same tasks across frameworks                  | Runtime, scalability, communication overhead, tool latency | Efficiency-focused comparison                           |

Takeaway: “Problem definition → solution” means (1) clear problem statement (issue, scenario, or plan), (2) decomposition and execution (tasks, tools, steps), (3) verification (tests, review, gate). Our system fits this: plan + tasks → implementer → reviewer → `gate:full`.

---

## 2. Typical Problems We Can Benchmark (Problem → Solution)

### 2.1 End-to-end plan execution

| Problem definition                | Solution path                                                                   | What to measure                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| “Complete plan P with N tasks”    | Import → waves of `tg next` → implementer → reviewer → done → final `gate:full` | Plan duration, velocity (tasks/hr), gate pass/fail, reviewer pass rate          |
| “Complete plan with dependencies” | Same, with `blockedBy`; some tasks wait for others                              | Wall-clock vs critical path, utilization of parallel waves                      |
| “Recover from gate:full failure”  | Investigator dispatch → fix → re-run gate                                       | Time to green, number of investigator rounds, tasks touched per failure cluster |

### 2.2 Per-task and per-agent performance

| Problem definition                            | Solution path                                                   | What to measure                                                                                      |
| --------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| “Implement task T with skill S”               | `tg context` → implementer (with skill guide) → reviewer → done | Elapsed time, tokens (if self-reported), tool_calls, attempt count (1 vs 2+)                         |
| “Implement same intent with vs without skill” | A/B: same task with and without `skill` in plan                 | Elapsed, tool_calls, review pass rate; expect fewer tool_calls with skill                            |
| “Implement with small vs large context”       | Vary `context_token_budget` / doc inlining                      | Success rate, tokens_in/tokens_out, reviewer pass rate; target &lt;3000 chars context where possible |

### 2.3 Orchestration and coordination

| Problem definition                       | Solution path                              | What to measure                                                                                       |
| ---------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| “Run 2 vs 4 vs 6 parallel implementers”  | Same plan, different wave sizes            | Total plan duration, cost per plan, IDE responsiveness (qualitative); token cost scales with N        |
| “Avoid file conflicts under parallelism” | Multiple doing tasks; no overlapping files | Count of conflicts or rework (notes, re-done tasks); agent-context / memory hints reducing collisions |
| “Stale doing task recovery”              | Task stuck in doing; reclaim or force-done | Time to detect (stale threshold), correctness of force-done vs manual fix                             |

### 2.4 Quality and correctness

| Problem definition        | Solution path                                  | What to measure                                                                      |
| ------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| “First-pass correctness”  | Implementer → reviewer once                    | Reviewer pass rate (PASS vs FAIL), attempt=1 fraction                                |
| “Correctness after fixer” | Implementer fails twice → fixer                | Fixer pass rate, tasks needing fixer per plan                                        |
| “No scope drift”          | Task has scope_in / scope_out; reviewer checks | Note events or review body indicating drift; explicit “scope_out violated” in review |

### 2.5 Verification (gate)

| Problem definition                 | Solution path                                      | What to measure                                                   |
| ---------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| “Full suite passes after plan”     | run-full-suite task → `gate:full` in plan worktree | Pass/fail, duration of gate:full, investigator dispatches if fail |
| “Affected tests only (cheap gate)” | Implementer runs `pnpm gate` (changed files)       | Time saved vs gate:full; no regression on main when merged        |

---

## 3. Mapping to Our System (Task-Graph)

### 3.1 Existing instrumentation

| Metric / need            | How we get it today                                                       |
| ------------------------ | ------------------------------------------------------------------------- |
| Per-task elapsed time    | `event`: started → done; `tg stats --plan <id>`                           |
| Plan duration & velocity | MIN(started) → MAX(done); tasks/hr in `tg stats --plan`                   |
| Reviewer pass/fail       | Note events `type: review`; `tg stats` default view                       |
| Token usage (optional)   | Self-report via `tg done --tokens-in --tokens-out --tool-calls --attempt` |
| Timeline / history       | `tg stats --timeline`                                                     |
| Stale doing tasks        | `tg status` warning section                                               |
| Verification             | run-full-suite task runs `gate:full` in plan worktree; evidence in done   |

### 3.2 Gaps for benchmarking

| Gap                                    | Possible direction                                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| No automatic token capture             | Integrate with Cursor/API telemetry or OpenTelemetry-style tracer for LLM calls                                             |
| No composite “quality per dollar” view | Derive from events + self-report: e.g. (tasks done × review pass rate) / estimated cost                                     |
| No standardized “benchmark plan”       | Curate 1–2 fixed plans (e.g. “add CLI command”, “fix bug”) run periodically; record duration, velocity, gate, reviewer rate |
| Investigator success not aggregated    | Query events for investigator dispatches and subsequent gate pass/fail; report “investigator fix rate”                      |

---

## 4. Recommendations (Ranked by Impact / Effort)

| Priority | Recommendation                                                                                                                                                                                       | Impact                                                     | Effort                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| 1        | **Define 1–2 benchmark plans** (fixed scope, e.g. 5–8 tasks, known repo state). Run periodically (e.g. weekly or pre-release), record plan duration, velocity, reviewer pass rate, gate:full result. | High: stable baseline for “problem → solution” performance | Low: use existing `tg stats` and evidence         |
| 2        | **Encode benchmark run in events** (e.g. tag plan or project as “benchmark”) so `tg stats --timeline` and analytics can filter “benchmark runs” vs ad-hoc work.                                      | High: clear time series for regression                     | Low: schema or tag convention                     |
| 3        | **Standardize self-report in done** (tokens, tool_calls, attempt) for benchmark runs so cost and efficiency are comparable across runs.                                                              | Medium: quality-per-dollar and cost trends                 | Low: agent template + checklist                   |
| 4        | **Add “investigator fix rate” to stats** (dispatches after gate fail → gate pass on retry).                                                                                                          | Medium: measures recovery performance                      | Medium: query events + small CLI/stats change     |
| 5        | **Optional: LLM trace integration** (OpenTelemetry or vendor tracer) for token/latency per sub-agent call.                                                                                           | High for deep optimization                                 | High: instrumentation, possibly Cursor/API limits |
| 6        | **Document benchmark plans and runbook** in `docs/` (e.g. “Performance” or “Benchmarking”) so humans and agents can run and interpret benchmarks consistently.                                       | Medium: reproducibility and onboarding                     | Low: one doc + link from performance.md           |

---

## Summary

Agentic system performance is best tested along reliability, speed, cost, and safety/fit. Benchmarks that span **problem definition → solution** (e.g. SWE-bench, KAMI, AgencyBench) provide: a clear problem statement, a defined execution path (tasks/tools/steps), and verification (tests, review, gate). For Task-Graph, the natural “problem” is a plan with tasks; the “solution” is implementer → reviewer → done and a final `gate:full`. We already have the right observables (events, `tg stats`, gate evidence); the highest-leverage next step is to introduce **reproducible benchmark plans** and record their outcomes over time, then optionally add composite metrics (e.g. quality-per-dollar) and investigator fix rate for a full picture from problem definition to solution.
