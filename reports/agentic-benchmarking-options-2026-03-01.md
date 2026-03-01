# Agentic Benchmarking — Options Addendum

**Date:** 2026-03-01  
**Scope:** (1) Investigator fix rate — confirmed. (2) Open-source LLM trace integration options for future. (3) Well-known problem in an ignored folder for productivity testing.  
**Produced by:** Research (web + GitHub) and orchestrator.

---

## 1. Investigator fix rate

No change. The plan’s investigator fix rate (derive from events: gate fail → later pass; show Recovery in `tg stats`) is the right approach.

---

## 2. LLM trace integration (future, open source)

When you want token/latency/cost per LLM call, these are solid **open-source** options that output standard OpenTelemetry and can run without vendor lock-in.

### Option A — OpenLLMetry (Traceloop)

| Aspect | Detail |
|--------|--------|
| **License** | Apache 2.0 |
| **Repo** | [traceloop/openllmetry](https://github.com/traceloop/openllmetry) (Python), [traceloop/openllmetry-js](https://github.com/traceloop/openllmetry-js) (Node/TS) |
| **Stars** | ~6.9k (Python), ~300+ (JS) |
| **What it does** | OTel-based; auto-instruments 30+ LLM providers (OpenAI, Anthropic, Gemini, etc.), vector DBs, and frameworks (LangChain, LlamaIndex, LangGraph, MCP). |
| **Integration** | Python: `pip install traceloop-sdk` then `Traceloop.init()`. JS: sister SDK for Node/Next. Exports to any OTLP backend (Grafana, SigNoz, Honeycomb, Datadog, etc.). |
| **Fit for us** | Cursor/Composer calls the LLM; our CLI doesn’t. So useful when (a) we run a **local agent runner** that uses OpenAI/Anthropic SDK and we want to trace that, or (b) Cursor ever exposes an OTLP/span hook. For “future” we document and use when we have an in-process LLM caller. |

### Option B — OpenLIT

| Aspect | Detail |
|--------|--------|
| **License** | Apache 2.0 |
| **Repo** | [openlit/openlit](https://github.com/openlit/openlit) |
| **What it does** | OTel-native; auto-instruments 50+ LLM providers, vector DBs, agents; optional metrics, GPU monitoring, evals, guardrails. |
| **Deployment** | Self-hostable (e.g. K8s/Helm); can export to OTLP Collector, Grafana Cloud, Datadog, SigNoz, etc. |
| **Fit for us** | Same as OpenLLMetry: applies where we have code that calls an LLM (local runner or future hook). |

### Option C — OTLP from our CLI (no LLM inside)

We don’t call the model from the CLI, but we can still get **orchestration** visibility:

- Emit OTLP spans for high-level events: `tg start`, `tg done`, plan start/end, investigator dispatch.
- Attributes: `task_id`, `plan_id`, `agent`, `duration`, self-reported `tokens_in`/`tokens_out` from `tg done` body.
- Backend: Grafana, SigNoz, or any OTLP collector. No per-call LLM trace unless Cursor (or a local runner we build) is instrumented with OpenLLMetry/OpenLIT.

**Recommendation:** For “LLM trace integration” in the future, prefer **OpenLLMetry** (Python or JS) or **OpenLIT** (Python) when we have an in-process LLM caller (e.g. a small runner or Cursor hook). Until then, Option C gives plan/task-level timelines and cost proxies from existing events.

---

## 3. Well-known problem in an ignored folder (productivity testing)

Goal: a **canonical, computable** problem that lives in an **ignored** directory so we can measure productivity (time, success rate, tokens) without polluting the main repo.

### Option A — HumanEval subset (canonical, small)

| Aspect | Detail |
|--------|--------|
| **Source** | [openai/human-eval](https://github.com/openai/human-eval) — 164 Python problems (signature + docstring + tests). |
| **Format** | Each problem: `task_id`, `prompt` (signature + docstring), `entry_point`, `test` (code that runs tests). |
| **Compute** | Agent produces completion (function body); you run the test code; pass/fail + runtime. |
| **Ignored folder** | e.g. `.benchmark/humaneval/` (gitignored): copy a subset (e.g. 5–20 problems) as one JSONL or one file per task. Runner script: run tests, output pass count and duration. |
| **Caveat** | HumanEval is widely in training data; use for **relative** productivity (e.g. “our system vs last week”) or use EvalPlus’s harder variants. |

### Option B — EvalPlus (HumanEval+ / MBPP+)

| Aspect | Detail |
|--------|--------|
| **Source** | [evalplus/evalplus](https://github.com/evalplus/evalplus) — `pip install evalplus`. |
| **HumanEval+** | Same 164 tasks with ~80× more tests; stricter. |
| **MBPP+** | 378 tasks, ~108 tests per task on average; run with `--dataset mbpp`. |
| **Compute** | `evalplus.evaluate --samples samples.jsonl` (and optionally `--dataset mbpp`). Output: pass rate, per-task result. |
| **Ignored folder** | `.benchmark/evalplus/` — store `samples.jsonl` (and optionally a small script that calls the agent then runs `evalplus.evaluate`). Problems come from the library; you don’t copy them, but **results and samples stay in the ignored dir**. |

### Option C — Custom minimal suite (our own “well-known” problem)

| Aspect | Detail |
|--------|--------|
| **Idea** | Define 1–3 fixed tasks that match our stack (e.g. “add a CLI command”, “fix this failing test”, “implement a small domain function”). |
| **Layout** | `.benchmark/problems/` (gitignored), e.g.: |
| | `task_01_cli_command/` → `spec.md`, `stub/` (minimal repo slice), `run.sh` (apply patch / run agent, then run gate or tests). |
| | `task_02_fix_test/` → broken test + code, `run.sh` runs tests. |
| **Compute** | Runner: run agent (or hand a plan), collect patch/output, run `run.sh` → exit 0/1, capture duration. Record in `.benchmark/results/` (gitignored). |
| **Advantage** | Full control; tests exactly what we care about (CLI, tests, our conventions); no training-data bias. |

### Suggested layout (ignored folder)

```text
.benchmark/                    # add to .gitignore
├── problems/                  # canonical problem(s)
│   ├── humaneval_subset/      # Option A: copy of N HumanEval items (JSONL or one file per task)
│   │   └── run.py             # run tests, print pass/fail and time
│   ├── evalplus/              # Option B: EvalPlus workflow
│   │   └── samples.jsonl     # agent outputs; run evalplus.evaluate
│   └── custom/                # Option C: our own tasks
│       ├── task_01_cli/
│       └── task_02_fix_test/
├── results/                   # all results (gitignored)
│   └── 2026-03-01_run1.json  # pass count, duration, plan_id, etc.
└── README.md                  # how to run; how productivity is computed
```

**Productivity metric:** For each run: **success** (all tasks pass or pass rate), **wall-clock time**, and optionally **tokens** (from `tg done` self-report or future trace). Store in `results/` and compare across runs.

**Recommendation:** Start with **Option C** (one or two custom tasks in `.benchmark/problems/custom/`) so the benchmark is clearly “our stack, our productivity.” Add Option A or B later if you want a standard coding benchmark (HumanEval+ / MBPP+) in the same ignored folder.

---

## Summary

| Item | Conclusion |
|------|------------|
| **Investigator fix rate** | Keep as in the current plan. |
| **LLM trace (future)** | Use **OpenLLMetry** or **OpenLIT** (both Apache 2.0, OTel) when we have an in-process LLM caller; until then, OTLP from CLI for plan/task-level visibility. |
| **Well-known problem for productivity** | Use an **ignored folder** (e.g. `.benchmark/`). Prefer a **custom minimal suite** (Option C) first; optionally add HumanEval subset or EvalPlus (Options A/B) for standard coding benchmarks. Compute = run tests → pass/fail + duration; store results in `.benchmark/results/`. |
