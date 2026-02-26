---
name: Context Budget and Compaction
overview: Add token measurement, configurable budget, and compaction of old done-tasks to tg context output.
fileTree: |
  src/cli/context.ts            (modify)
  src/domain/token-estimate.ts  (create)
  .taskgraph/config.json        (modify)
  docs/cli-reference.md         (modify)
  __tests__/domain/token-estimate.test.ts (create)
  __tests__/integration/context-budget.test.ts (create)
risks:
  - description: Token estimation is approximate (no real tokenizer in the CLI)
    severity: low
    mitigation: Use char/4 heuristic; accurate enough for budgeting. Note approximation in docs.
  - description: Aggressive compaction could drop useful context
    severity: medium
    mitigation: Prioritize by recency and domain relevance; always include the current task's full context
  - description: Config schema change needs backward compat
    severity: low
    mitigation: New fields are optional with sensible defaults
tests:
  - "Token estimate function returns reasonable count for sample strings"
  - "tg context --json includes token_estimate field"
  - "Context output respects configured budget by truncating related_done lists"
  - "Current task context is never truncated regardless of budget"
  - "Default budget (no config) produces full output (backward compat)"
todos:
  - id: token-estimator
    content: "Create token estimation utility in src/domain/token-estimate.ts"
    intent: |
      Simple function estimateTokens(text: string): number using chars/4 heuristic.
      Also export estimateJsonTokens(obj: unknown): number that stringifies then estimates.
      This is intentionally simple - no tiktoken dependency needed.
    changeType: create
  - id: token-estimator-tests
    content: "Unit tests for token estimation"
    intent: |
      Test with known strings. Verify JSON estimation works for nested objects.
      Test edge cases: empty string, null, very large objects.
    changeType: test
  - id: config-budget
    content: "Add context_token_budget to .taskgraph/config.json schema"
    intent: |
      Add optional context_token_budget (number, default null = unlimited) to config.
      Read it in readConfig(). When set, tg context will aim to keep output under this budget.
      Typical value: 4000-8000 tokens.
    suggestedChanges: |
      In config.json: { "context_token_budget": 6000 }
      In utils.ts readConfig: add contextTokenBudget?: number to Config type
    changeType: modify
  - id: compact-related-done
    content: "Compact related_done lists when context exceeds budget"
    intent: |
      In context.ts, after assembling the full context object, estimate its token size.
      If over budget: (1) truncate related_done_by_domain and related_done_by_skill to
      just task_id + title (drop plan_id), (2) reduce limit from 5 to 3, then 1.
      (3) If still over, summarize as "N related done tasks in domain X".
      Never truncate the current task's own fields (title, intent, suggested_changes, etc).
    suggestedChanges: |
      function compactContext(ctx: ContextOutput, budget: number): ContextOutput {
        let est = estimateJsonTokens(ctx);
        if (est <= budget) return ctx;
        // Stage 1: slim related lists
        ctx.related_done_by_domain = ctx.related_done_by_domain.slice(0, 3).map(t => ({ task_id: t.task_id, title: t.title }));
        // Stage 2: further reduction...
      }
    blockedBy: [token-estimator, config-budget]
    changeType: modify
    domain: [cli]
    skill: [cli-command-implementation]
  - id: display-token-count
    content: "Add token_estimate to tg context JSON output"
    intent: |
      After building context (and optionally compacting), add a token_estimate field
      to the JSON output so the orchestrator can see how much context is being injected.
      In human-readable mode, print "Context size: ~N tokens" at the end.
    blockedBy: [token-estimator]
    changeType: modify
    domain: [cli]
  - id: ctx-integration-tests
    content: "Integration tests for context budget and compaction"
    intent: |
      Create tasks with domain/skill that produce related_done lists.
      Set a low budget in config. Verify context output is compacted.
      Verify full output when budget is null/absent.
    blockedBy: [compact-related-done]
    changeType: test
    skill: [integration-testing]
  - id: ctx-update-docs
    content: "Document context budget in cli-reference.md"
    intent: |
      Document the context_token_budget config option and the compaction behavior.
      Explain the token estimation heuristic.
    changeType: document
    skill: [documentation-sync]
isProject: false
---

## Analysis

As projects grow, `tg context` output grows unboundedly. Beads addresses this with "memory decay" -
summarizing old closed tasks. Anthropic's context engineering guide emphasizes treating context as a
finite resource with diminishing marginal returns.

Currently `tg context` fetches up to 5 related done tasks per domain and per skill. For a task with
2 domains and 3 skills, that's up to 25 related tasks with full details. This can easily consume
2000+ tokens of context that may not be relevant.

## Compaction strategy

```
Full context → estimate tokens → over budget?
  No  → return as-is
  Yes → Stage 1: slim related lists (remove plan_id, reduce to 3)
      → Stage 2: reduce to 1 per category
      → Stage 3: replace with summary counts
```

The current task's own fields (title, intent, suggested_changes, file_tree, risks) are never
compacted - they're the primary payload.

## Token estimation

Using chars/4 as a simple heuristic avoids adding a tiktoken dependency. For context budgeting
purposes, +/-20% accuracy is fine - we're preventing gross overflows, not optimizing to the token.

<original_prompt>
Add context budget management and compaction to tg context, inspired by Beads'
memory decay and Anthropic's context engineering guidance.
</original_prompt>
