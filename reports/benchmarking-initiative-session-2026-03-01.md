# Benchmarking Initiative — Session Summary

**Date:** 2026-03-01  
**Scope:** Synthesis of this session's work on agentic system performance testing, options (LLM trace, productivity benchmark), and the decision to start with Option C (custom minimal suite).  
**Produced by:** Report skill from conversation context.

---

## Artifacts produced this session

| Artifact                                                 | Purpose                                                                                                                                                                                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reports/agentic-performance-benchmarking-2026-03-01.md` | How to test agentic systems; typical problems to benchmark; mapping to Task-Graph; six recommendations (benchmark plans, encode in events, self-report, investigator fix rate, optional LLM trace, runbook).                 |
| `reports/agentic-benchmarking-options-2026-03-01.md`     | Investigator fix rate (confirmed); open-source LLM trace options (OpenLLMetry, OpenLIT, CLI OTLP); three options for well-known problem (HumanEval subset, EvalPlus, Option C custom suite); suggested `.benchmark/` layout. |
| `plans/26-03-01_agentic_benchmarking.md`                 | Plan for five recommendations: `project.is_benchmark`, stats filter, benchmark plan definitions, implementer checklist, investigator fix rate, runbook (LLM trace excluded).                                                 |
| `plans/26-03-01_custom_benchmark_suite.md`               | Plan for Option C: `.benchmark/` structure, task_01 (add CLI command), task_02 (fix test), runner script, docs link, verify.                                                                                                 |
| `.gitignore`                                             | Only `.benchmark/results/` ignored; `.benchmark/problems/` and README committed.                                                                                                                                             |

---

## Decisions

- **Investigator fix rate:** Keep as designed (derive from events: gate fail → later pass; show in `tg stats`).
- **LLM trace (future):** Use **OpenLLMetry** or **OpenLIT** (Apache 2.0, OTel) when there is an in-process LLM caller; until then, CLI OTLP for plan/task-level visibility.
- **Productivity benchmark:** Start with **Option C** (custom minimal suite in `.benchmark/problems/custom/`); add HumanEval or EvalPlus later if desired.
- **Option C layout:** Two tasks (add `tg ping` in stub CLI; fix wrong assertion in stub test); self-contained stubs; per-task `run.sh`; `scripts/run-benchmark.ts` writes `.benchmark/results/<timestamp>.json`.

---

## Findings

- **Plans not yet executed:** Agentic Benchmarking plan and Custom Benchmark Suite plan are written and (for the former) imported; execution was not run in this session.
- **Single source for “options now”:** `reports/agentic-benchmarking-options-2026-03-01.md` is the reference for LLM trace options and for the well-known-problem options (A/B/C).
- **Canonical problems versioned:** Only `.benchmark/results/` is gitignored so that `.benchmark/problems/` and `.benchmark/README.md` can be committed and shared.

---

## Recommendations

1. **Execute Custom Benchmark Suite plan** — Import (if not already) and run tasks to create `.benchmark/` structure, task_01 and task_02 stubs, runner script, and docs link.
2. **Execute Agentic Benchmarking plan** (when ready) — Schema, stats filter, benchmark plans, implementer checklist, investigator fix rate, runbook.
3. **Revisit LLM trace** — When adding a local agent runner or when Cursor exposes hooks, integrate OpenLLMetry or OpenLIT per options report.

---

## Summary

This session produced a performance-benchmarking report, an options addendum (investigator fix rate, LLM trace, productivity benchmark options), and two plans: one for the full benchmarking recommendations (schema, stats, runbook) and one for Option C (custom minimal suite in `.benchmark/`). Option C is the agreed starting point; only benchmark results are gitignored so canonical problems remain in the repo. Next step is to run the Custom Benchmark Suite plan, then the Agentic Benchmarking plan as needed.
