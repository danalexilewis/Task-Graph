---
triggers:
  files: [".cursor/agents/product-analyst.md", ".cursor/skills/plan/SKILL.md"]
  change_types: ["create", "modify"]
  keywords: ["product analyst", "strategic", "classification", "plan skill"]
---

# Lead: Product Analyst

## Purpose

Product-level and strategic analysis to support plan creation when the request is initiative-level, roadmap-oriented, or needs explicit scope/outcome classification. The product-analyst lead is **opt-in**: the /plan skill or orchestrator may dispatch the product-analyst sub-agent in **Strategic mode** (or when classification would help) to produce goals, outcome boundaries, and alignment with initiatives before the planner-analyst runs.

## When

**Opt-in.** Dispatch only when:

- **Strategic mode** — The user's request is about initiatives, roadmap, prioritisation, or high-level "what to build next" rather than a single feature.
- **Classification needed** — The request would benefit from explicit product framing: goals, success outcomes, scope-in/scope-out, or initiative alignment before technical breakdown.

Do **not** dispatch for routine single-feature plans where the planner-analyst's codebase-focused analysis is sufficient. The lead doc and plan skill spell out this opt-in; the default /plan path does not require product-analyst.

## Pattern

1. **Skill** (/plan) is invoked; orchestrator classifies the request.
2. **If Strategic (or classification desired):** Skill or orchestrator optionally dispatches the product-analyst sub-agent using the prompt in `.cursor/agents/product-analyst.md`.
3. **Product analyst** returns structured product/strategic analysis (goals, outcomes, scope boundaries, initiative alignment, optional classification).
4. **Orchestrator** uses that output (if run) to frame the request, then proceeds with planner-analyst and plan authoring as usual.

Product analyst is an optional pre-phase; planner-analyst remains mandatory before writing the plan.

## Agent file

- **Worker:** `.cursor/agents/product-analyst.md` — prompt template and output contract for the product-analyst sub-agent.

## Input

- **User request** — initiative, roadmap, or feature description (required; may be multi-line).
- **Optionally** — current initiatives/projects: orchestrator runs `pnpm tg status --initiatives` and/or `tg status --projects` and passes the output so the analyst can align to existing work.

## Output

Structured product/strategic analysis (from the analyst), including:

- **Goals and success outcomes** — What "done" looks like from a product perspective; measurable or observable outcomes.
- **Scope boundaries** — Scope-in (what this plan owns) and scope-out (explicitly out of scope or deferred).
- **Initiative alignment** — How this request relates to existing initiatives or projects; whether it should attach to one or stand alone.
- **Classification** — Optional: suggested mode (e.g. Greenfields, Improvement, Refactor, Pivot) or tags that the orchestrator can use when briefing the planner-analyst.

The analyst does **not** produce the plan or task breakdown; the orchestrator uses this to frame the request and optionally inject focus into the planner-analyst phase.

## References

- Plan skill: `.cursor/skills/plan/SKILL.md`
- Planner-analyst (mandatory phase): `docs/leads/planner-analyst.md`
- Agent contract: `docs/agent-contract.md`, AGENT.md
- Lead registry: `docs/leads/README.md`
