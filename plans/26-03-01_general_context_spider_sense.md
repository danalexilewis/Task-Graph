---
name: General Context Spider Sense
overview: Load general context at sub-agent start as background awareness (spider sense) so implementers see opportunities and project state from the beginning and not only when they hit issues.
fileTree: |
  .cursor/
  ├── agents/
  │   └── implementer.md          (modify)
  ├── rules/
  │   └── subagent-dispatch.mdc  (modify)
  └── skills/
  └── work/
      └── SKILL.md               (modify)
  docs/
  ├── agent-contract.md          (modify)
  └── agent-context.md           (modify)
  .taskgraph/
  └── config.json                (modify — optional)
risks:
  - description: General-context block increases prompt size; may squeeze task context or doc-inline budget
    severity: low
    mitigation: Cap general context (e.g. 2000 tokens or chars/4); fill order places it before task block; document budget in config.
  - description: Sub-agents could treat general context as task scope and drift
    severity: low
    mitigation: Label block as "advisory / awareness only" in template and agent-contract; reinforce scope discipline from agent-context.md.
tests:
  - "Manual: implementer prompt contains {{GENERAL_CONTEXT}} section when orchestrator builds from Pattern 1/2 or work skill"
todos:
  - id: define-general-context
    content: Define general-context artifact and document contract in agent-contract and subagent-dispatch
    agent: documenter
    intent: |
      Define what "general context" is for sub-agent start: (1) .cursor/memory.md (transient dev context, capped); (2) optional one-line summary of other agents (e.g. tg agent-context status or doing-tasks); (3) advisory-only, no scope expansion.
      Add a short "General context at start" subsection to docs/agent-contract.md describing purpose and scope discipline. Add a "General context (spider sense)" subsection to .cursor/rules/subagent-dispatch.mdc that states the orchestrator will inject {{GENERAL_CONTEXT}} when building implementer prompts, with a token/char cap (e.g. 2000 tokens or 8000 chars). No code or template changes yet.
    changeType: modify
  - id: implementer-template-general-context
    content: Add General context (spider sense) section to implementer template before Step 2
    agent: implementer
    blockedBy: [define-general-context]
    intent: |
      In .cursor/agents/implementer.md, add a section after Step 1 (worktree) and before "Step 2 — Load context" (or fold into Spidey sense): "General context (spider sense)" — orchestrator injects {{GENERAL_CONTEXT}} below; read it once for background awareness only. Do not expand your task scope based on it; use for opportunities and project quirks.
      Ensure the template has a clear placeholder and a one-line instruction that this block is advisory-only. If the orchestrator omits it (empty or missing), the implementer proceeds without it.
    changeType: modify
  - id: orchestrator-fill-general-context
    content: Orchestrator fills {{GENERAL_CONTEXT}} in dispatch and work skill when building implementer prompt
    agent: implementer
    blockedBy: [define-general-context, implementer-template-general-context]
    intent: |
      In .cursor/rules/subagent-dispatch.mdc: in "Building prompts from context JSON" and in Pattern 1 / Pattern 2 steps where the implementer prompt is built, add a step — read .cursor/memory.md (if present), optionally run tg agent-context status or use doing-tasks summary, cap total size (e.g. 8000 chars or 2000 tokens). Set {{GENERAL_CONTEXT}} in the prompt with a delimiter (e.g. "--- general context (advisory) ---"). If memory is empty and no agent-context, set empty string or omit section.
      In .cursor/skills/work/SKILL.md: where the skill describes building the implementer prompt, add the same rule (include general context when building prompt; cap size).
    changeType: modify
  - id: optional-general-context-config
    content: Optional config key general_context_budget and docs for it
    agent: implementer
    blockedBy: [orchestrator-fill-general-context]
    intent: |
      If we want configurable cap: add optional general_context_budget (number, tokens or chars) to .taskgraph/config.json and document in docs/cli-reference.md or docs/architecture.md. Orchestrator/tooling that fills {{GENERAL_CONTEXT}} uses this cap when set; otherwise use a default (e.g. 2000 tokens). Skip this task if the team prefers a fixed cap in the rule only.
    changeType: modify
  - id: docs-general-context
    content: Update agent-context and agent-contract docs for general context at start
    agent: documenter
    blockedBy: [define-general-context]
    intent: |
      In docs/agent-contract.md: ensure "General context at start" (from define-general-context task) is clearly tied to sub-agent execution and scope discipline. In docs/agent-context.md: add a short note that general context at implementer start may include agent-context status (or a summary of other agents) for spider sense; link to scope discipline. Keep docs consistent with implementer template and subagent-dispatch rules.
    changeType: modify
isProject: false
---

## Analysis

Sub-agents today receive **task context** (tg context &lt;taskId&gt; --json, doc paths, skill docs, inlined docs, learnings) but not a dedicated **general context** at start. The implementer template has a "Spidey sense" step that tells the sub-agent to run `tg context --json` once to see other doing tasks; that is reactive and not a pre-loaded awareness block. The user wants general context loaded at the beginning as a "background spider sense" so sub-agents see opportunities and project state from the start, without expanding task scope.

**Approach:** Define general context as a small, capped blob: `.cursor/memory.md` plus optional agent-context status (or doing-tasks summary). The **orchestrator** injects it as `{{GENERAL_CONTEXT}}` when building the implementer prompt so we control size and ordering. The implementer template gains a "General context (spider sense)" section before Step 2, labeled advisory-only. No change to `tg context` CLI or Dolt; no new event pipeline.

**Rejected:** Letting the sub-agent read memory and agent-context itself (option (b) from analyst) — orchestrator injection keeps a single cap and consistent ordering with doc-inlining and avoids duplicate reads across parallel implementers.

## Dependency graph

```
Parallel start (1 unblocked):
  └── define-general-context

After define-general-context:
  ├── implementer-template-general-context
  └── docs-general-context

After define-general-context + implementer-template-general-context:
  └── orchestrator-fill-general-context

After orchestrator-fill-general-context:
  └── optional-general-context-config
```

## Proposed changes

- **define-general-context:** Short subsection in agent-contract ("General context at start": purpose, contents, scope discipline). Subsection in subagent-dispatch ("General context (spider sense)": orchestrator injects `{{GENERAL_CONTEXT}}`, cap e.g. 2000 tokens).
- **implementer-template-general-context:** New block in implementer.md between worktree/Spidey sense and Step 2: "General context (spider sense): {{GENERAL_CONTEXT}}. Advisory only."
- **orchestrator-fill-general-context:** In subagent-dispatch Pattern 1/2 and "Building prompts": read memory.md, optional agent-context status, cap, set placeholder. In work SKILL: same instruction for prompt building.
- **optional-general-context-config:** Optional `general_context_budget` in config; document; use in fill step when present.
- **docs-general-context:** Cross-links and scope discipline in agent-contract and agent-context.

## Open questions

- Whether to include a one-line "doing tasks" summary (from `tg context --json` no-args) in general context in addition to memory + agent-context status, or keep it separate (current Spidey sense step). Decision: can be left to implementer of orchestrator-fill task — prefer minimal (memory + optional agent-context status) to avoid duplication with existing Spidey sense.

## Original prompt

<original_prompt>
I saw a sub agent start and retrieve its task context, but not the general context. thats funny as I would have thought at the beginning was a good time to do it. but actually maybe its the thing you do once you run into issues. but also it means you miss seeing opportunities.

hmmmm I think id like to try and load it for a background spider sense. thats more me then a cowboy style.

/plan
</original_prompt>
