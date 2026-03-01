---
name: Inline Doc Content in Implementer Prompts
overview: Have the orchestrator (and optionally the CLI) inline key doc content (agent-field-guide and DOC_PATHS/SKILL_DOCS) into implementer prompts so implementers skip read_file calls and reduce orientation.
fileTree: |
  .cursor/
  ├── agents/
  │   └── implementer.md                    (modify)
  ├── rules/
  │   └── subagent-dispatch.mdc             (modify)
  └── skills/
      └── work/
          └── SKILL.md                      (modify)
  src/
  ├── cli/
  │   └── context.ts                        (modify — optional CLI flag)
  └── domain/
      └── token-estimate.ts                 (optional — reuse estimate)
  docs/
  ├── cli-reference.md                      (modify)
  └── agent-contract.md                     (modify — optional)
  __tests__/
  └── integration/
      └── context-budget.test.ts            (extend — optional)
risks:
  - description: Inlined content pushes implementer prompt into 20k–40k+ tokens; model context limits may be hit.
    severity: medium
    mitigation: Enforce a configurable inline-doc budget (e.g. 8k tokens); fill agent-field-guide first, then doc_paths/skill_docs until budget; document in cli-reference.
  - description: Parallel tasks each get a full copy of same docs; duplicate content across batch.
    severity: low
    mitigation: Accept as trade-off for simpler orchestration; optional future optimization is shared doc cache per batch.
tests:
  - "Context --json with --inline-docs returns doc_content shape and respects budget (if CLI task implemented)"
  - "Orchestrator-built prompt contains inlined snippet when DOC_CONTENT populated (manual or integration)"
todos:
  - id: doc-content-placeholder
    content: "Add {{DOC_CONTENT}} placeholder and conditional wording to implementer template"
    agent: implementer
    intent: |
      Add a single placeholder {{DOC_CONTENT}} to .cursor/agents/implementer.md (Input contract and Step 2).
      When {{DOC_CONTENT}} is non-empty: instruct "Key doc content is inlined below; use it instead of reading the same paths again." and render the content in the prompt.
      When empty or omitted: keep current wording "Read any domain docs and skill guides listed" and "Also read docs/agent-field-guide.md".
      Update .cursor/agents/README.md placeholder table to list {{DOC_CONTENT}} (optional; when orchestrator inlines doc bodies).
    changeType: modify
    docs: [agent-contract]
  - id: inlining-policy-and-config
    content: "Define doc-inlining policy and optional config key; document in dispatch rule and cli-reference"
    agent: documenter
    intent: |
      Define policy: (1) What to inline: agent-field-guide first, then doc_paths, then skill_docs in order. (2) Size guard: max tokens (or chars/4) for inlined content per task; default e.g. 8000 tokens. (3) Optional config: context_inline_doc_budget in .taskgraph/config.json (number; omit = no inlining or use default).
      Document in .cursor/rules/subagent-dispatch.mdc under "Building prompts" or "Optional — reduce implementer orientation further": orchestrator reads agent-field-guide and listed paths up to budget, concatenates with clear delimiters, sets {{DOC_CONTENT}}.
      Document in docs/cli-reference.md any new config key and (if CLI task done) tg context --inline-docs.
      Reference docs/architecture.md for config table if adding context_inline_doc_budget.
    changeType: modify
    docs: [cli-reference, architecture]
  - id: orchestrator-inject-doc-content
    content: "Wire orchestrator to read and inject doc content into implementer prompt"
    agent: implementer
    blockedBy: [doc-content-placeholder, inlining-policy-and-config]
    intent: |
      In .cursor/skills/work/SKILL.md loop (step 6c) and .cursor/rules/subagent-dispatch.mdc Pattern 1 step 4: after building context from tg context --json, from repo root read (1) docs/agent-field-guide.md, (2) each path in doc_paths, (3) each path in skill_docs. Concatenate with clear section labels (e.g. ## Agent field guide, ## Domain docs, ## Skill guides). Apply size guard (chars/4 as token estimate; stop when at or over context_inline_doc_budget or default 8000). Set {{DOC_CONTENT}} in the implementer prompt. If budget is 0 or config absent, leave {{DOC_CONTENT}} empty. Use same repo root as tg (process.cwd() or config).
    changeType: modify
    docs: [agent-contract, multi-agent]
  - id: context-inline-docs-flag
    content: "Add tg context --json --inline-docs that returns doc_content key with file bodies"
    agent: implementer
    blockedBy: [inlining-policy-and-config]
    intent: |
      In src/cli/context.ts: add optional flag --inline-docs (or --include-doc-bodies). When set, after building context JSON, read from repo (config.repoPath or cwd): docs/agent-field-guide.md, then each doc_paths entry, then each skill_docs entry. Build an object e.g. doc_content: { agent_field_guide?: string, docs?: Record<string, string>, skills?: Record<string, string> } (keyed by path or slug). Apply context_inline_doc_budget (or default) via chars/4 estimate; truncate or omit later docs when over budget. Include doc_content in the JSON output. Document in docs/cli-reference.md. Add integration test in __tests__/integration/ that context with --inline-docs returns doc_content and respects budget.
    changeType: modify
    docs: [cli-reference]
    skill: cli-command-implementation
  - id: tests-inline-docs
    content: "Add tests for inlined doc content (context --inline-docs shape and/or prompt content)"
    agent: implementer
    blockedBy: [orchestrator-inject-doc-content, context-inline-docs-flag]
    intent: |
      If context-inline-docs-flag was implemented: add or extend __tests__/integration/context-budget.test.ts (or new context-inline-docs.test.ts) to assert context --json --inline-docs returns doc_content with expected keys and that total inlined size respects context_inline_doc_budget. If only orchestrator path was implemented: add a minimal test or doc example that an orchestrator-built prompt with {{DOC_CONTENT}} non-empty contains a known substring from agent-field-guide (or document as manual check in agent-field-guide or testing.md).
    changeType: modify
    docs: [testing]
    skill: integration-testing
isProject: false
---

# Inline Doc Content in Implementer Prompts

## Analysis

The orchestrator already pre-starts tasks and injects `{{WORKTREE_PATH}}` and context JSON (title, intent, doc_paths, skill_docs, etc.). Implementers still perform N+1 `read_file` calls: one per path in DOC_PATHS and SKILL_DOCS, plus `docs/agent-field-guide.md`. Inlining the content of those docs into the prompt removes those orientation reads at the cost of larger prompts and a need for a size guard.

**Existing data:** `tg context --json` already returns `doc_paths` and `skill_docs` (paths only). `context_token_budget` and `compactContext` exist for the context JSON blob; the full implementer prompt is not capped by the CLI. `estimateJsonTokens` (chars/4) can be reused for inlined content.

**Risks:** (1) Token growth — agent-field-guide ~5.5k tokens, plus 2–3 domain docs and 1–2 skill guides can reach 20k–40k tokens per prompt; we cap via a configurable budget. (2) Duplicate inlining across parallel tasks — each task gets its own copy; acceptable for v1.

**Policy:** Inline in order: agent-field-guide first, then doc_paths, then skill_docs, until `context_inline_doc_budget` (or default 8000 tokens) is reached. When budget is 0 or unset, do not inline (leave `{{DOC_CONTENT}}` empty).

## Dependency graph

```
Parallel start (2 unblocked):
  ├── doc-content-placeholder (implementer template + README)
  └── inlining-policy-and-config (policy and docs)

After both:
  ├── orchestrator-inject-doc-content (work skill + subagent-dispatch)
  └── context-inline-docs-flag (CLI --inline-docs; optional)

After orchestrator-inject-doc-content and/or context-inline-docs-flag:
  └── tests-inline-docs
```

## Proposed changes

- **Implementer template:** One new optional placeholder `{{DOC_CONTENT}}`. Step 2 branches: if present, "Key doc content is inlined below; use it instead of reading the same paths again." and render content; else keep "Read any domain docs and skill guides listed" and "Also read docs/agent-field-guide.md".
- **Dispatch and work skill:** After `tg context <taskId> --json`, read from repo root: `docs/agent-field-guide.md`, then each `doc_paths` entry, then each `skill_docs` entry. Concatenate with section headers. Estimate tokens (chars/4); stop when at or over budget. Set `{{DOC_CONTENT}}`.
- **Config:** Optional `context_inline_doc_budget` in `.taskgraph/config.json` (number; default 8000 if inlining enabled; 0 or omit = no inlining).
- **CLI (optional):** `tg context <taskId> --json --inline-docs` adds a `doc_content` key to the JSON with `agent_field_guide`, `docs`, `skills` (file bodies), respecting the same budget.

## Open questions

- Whether to add `intent` to `tg context --json` in this plan (analyst noted it is missing and implementer template expects `{{INTENT}}`). Deferred; can be a separate small task.

## Original prompt

<original_prompt>
/plan for have the orchestrator inline key doc content (e.g. docs/agent-field-guide.md and critical DOC_PATHS) so the implementer can skip extra read_file calls if you want to reduce orientation further.
</original_prompt>
