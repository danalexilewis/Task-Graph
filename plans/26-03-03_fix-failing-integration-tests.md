---
name: Fix Failing Integration Tests
overview: Fix 34 failing and 2 skipped integration tests across agent context, gates, status-live, recover, blocked status, cache, initiative, hive context, worktree, stats, and start-error-cause clusters.
fileTree: |
  __tests__/
  ├── integration/
  │   ├── agent-context.test.ts          (modify)
  │   ├── blocked-status-materialized.test.ts (modify)
  │   ├── gates.test.ts                  (modify)
  │   ├── hive-context.test.ts           (modify)
  │   ├── initiative.test.ts             (modify)
  │   ├── recover.test.ts                (modify)
  │   ├── status-cache.test.ts           (modify)
  │   ├── worktree.test.ts               (modify)
  │   └── ...
  ├── cli/
  │   └── dashboard.test.ts              (modify)
  scripts/
  └── run-integration-global-setup.ts    (verify)
  src/
  ├── cli/
  │   ├── status.ts                      (modify - process.exit)
  │   └── context.ts                     (modify - hive alias)
risks:
  - description: Changing CLI --json output shape breaks consumers
    severity: medium
    mitigation: Align tests with implementation; document any intentional shape in docs/cli-reference.md
  - description: Golden template or migration order causes blocked-status / worktree cascading failures
    severity: medium
    mitigation: Verify global-setup migrations and initiative_id default before task INSERT fixes
tests:
  - Run pnpm build && pnpm test:integration after each wave; gate:full at plan end
todos:
  - id: fix-recover-json-parse
    content: Fix tg recover event.body JSON parse - Dolt returns object not string in server mode
    agent: implementer
    intent: |
      recover.test.ts line 84 does JSON.parse(events[0].body) but Dolt/mysql2 returns JSON columns as objects in server mode.
      Per docs/agent-field-guide.md: use defensive parse - typeof raw === 'string' ? JSON.parse(raw) : raw.
    suggestedChanges: |
      const raw = events[0].body;
      const body = typeof raw === "string" ? JSON.parse(raw) : (raw as Record<string, unknown>);
    changeType: modify
  - id: fix-hive-context-output-shape
    content: Align hive-context tests with HiveSnapshot shape (tasks, as_of) not entries/generatedAt
    agent: implementer
    intent: |
      domain/hive.ts defines HiveSnapshot with tasks, as_of, doing_count. Tests expect entries and generatedAt.
      Prefer updating tests to match domain type (tasks, as_of).
      Third test (tg context without taskId): use runTgCli(..., expectError=true) and assert stderr matches.
    suggestedChanges: |
      hive-context.test.ts: expect snapshot.tasks (array), snapshot.as_of (string); entry keys task_id, agent_name; context-without-taskId use expectError.
    changeType: modify
  - id: fix-initiative-without-init
    content: Fix initiative commands without init - use stderr and relax regex for tg init message
    agent: implementer
    intent: |
      Tests check stdout but error goes to stderr. Use runTgCli with expectError true, assert stderr.
      Regex /run tg init/i fails on "Please run 'tg init' first" (quotes break match). Use /tg init/i.
    suggestedChanges: |
      runTgCli(`initiative list`, tempDir, true); expect(stderr).toMatch(/tg init/i);
    changeType: modify
  - id: fix-initiative-status-default-view
    content: Fix tg status default view - accept JSON when !isTTY (test env)
    agent: implementer
    intent: |
      shouldUseJson returns true when !process.stdout.isTTY. Tests run piped so they get JSON.
      Test expects human "Cycle:|Sprint 1|initiatives|Active Plans". Fix: parse JSON when output is JSON and assert initiative/cycle presence.
    suggestedChanges: |
      const out = stdout.trim();
      if (out.startsWith('{')) {
        const j = JSON.parse(out);
        expect(j.activePlans?.some((p) => p.initiative)).toBeTruthy();
      } else {
        expect(stdout).toMatch(/Cycle:|Sprint 1|initiatives|Active Plans/);
      }
    changeType: modify
  - id: fix-fetchstatus-cache-timeout
    content: Fix fetchStatusData cache clear test - address timeout and dangling process
    agent: implementer
    intent: |
      Test "cache.size is 0 after clear() and grows again" times out at 5000ms. Possible: fetch before cache write fails, or clear() triggers async work that hangs.
      Inspect status-cache.test.ts, QueryCache.clear(), and fetchStatusData flow. Ensure test uses isolated cache and no shared singleton.
    changeType: modify
  - id: fix-status-live-sigint
    content: Fix status-live/dashboard SIGINT tests - process.exit race with piped stdout
    agent: implementer
    intent: |
      dashboard.test.ts sends SIGINT; Node may exit before stdout flushes when piped.
      Use process.exitCode = 0 and natural exit instead of process.exit(0) in success paths. See memory.md and status.ts.
    changeType: modify
  - id: fix-gate-lifecycle
    content: Fix Gate lifecycle - task stays blocked after gate resolve
    agent: implementer
    intent: |
      gates.test.ts: after gate resolve, show returns status blocked instead of todo.
      syncBlockedStatusForTask is called; verify gate resolve triggers it for affected task. Check gate.ts resolve flow and blocked-status materialization.
    changeType: modify
  - id: fix-blocked-status-materialized
    content: Fix Blocked status materialized - task rows 0, Task not found, INSERT fails
    agent: implementer
    intent: |
      blocked-status-materialized.test.ts: SELECT task returns 0 rows; tg start "Task not found"; task new INSERT fails (plan_id FK).
      Golden template may lack project table or initiative_id. Import creates project; task INSERT uses plan_id. Verify: project table exists, initiative default, task.plan_id FK to project.plan_id.
    changeType: modify
  - id: fix-agent-context-collector
    content: Fix Agent context collector - bounded poll fails, collector startup/schema
    agent: implementer
    intent: |
      agent-context.test.ts: boundedPoll fails after 20 attempts waiting for [collector] Started or agent_events rows.
      Verify collect-agent-events.ts starts, writes to SQLite agent_events, schema matches. Check TTY/env for collector child.
    changeType: modify
  - id: fix-worktree-tests
    content: Fix Worktree creation and Dolt sync tests - Task not found, copy-ignored
    agent: implementer
    intent: |
      worktree.test.ts: "Task not found" on tg start; second task undefined in next; copy-ignored fails.
      dolt-sync.test.ts: tg sync --push/pull file remote may share DB/workspace isolation issues.
      Likely shares root cause with blocked-status (plan/project, task resolution). After blocked-status fix, re-run worktree and dolt-sync tests.
    changeType: modify
  - id: fix-stats-tests
    content: Fix tg stats --plan and --benchmark filter tests
    agent: implementer
    intent: |
      stats.test.ts and stats-benchmark-plain-filter.test.ts fail on output shape.
      Verify stats --plan --json returns planSummary; stats --json returns agent_metrics; stats --benchmark --json returns plan array.
    changeType: modify
  - id: unskip-start-error-cause
    content: Unskip tg start worktree error cause tests when wt not on PATH
    agent: implementer
    intent: |
      start-error-cause.test.ts has 2 skipped tests. Conditional skip when wt not on PATH.
      Either enable when wt is on PATH, or add fallback test that mocks wt absence and asserts cause in stderr.
    changeType: modify
  - id: run-gate-full
    content: Run gate:full and fix any remaining failures
    agent: implementer
    blockedBy: [fix-recover-json-parse, fix-hive-context-output-shape, fix-initiative-without-init, fix-initiative-status-default-view, fix-fetchstatus-cache-timeout, fix-status-live-sigint, fix-gate-lifecycle, fix-blocked-status-materialized, fix-agent-context-collector, fix-worktree-tests, fix-stats-tests, unskip-start-error-cause]
    intent: |
      pnpm build && pnpm gate:full. Address any remaining flaky or new failures.
    changeType: modify
isProject: true
---

# Fix Failing Integration Tests

## Analysis

34 tests fail and 2 are skipped across multiple clusters. Root causes were analyzed by planner-analyst.

## Dependency Graph

```
Parallel Wave 1:
├── fix-recover-json-parse
├── fix-hive-context-output-shape
├── fix-initiative-without-init
├── fix-initiative-status-default-view
└── fix-fetchstatus-cache-timeout

Parallel Wave 2:
├── fix-status-live-sigint
└── fix-gate-lifecycle

Parallel Wave 3:
├── fix-blocked-status-materialized
└── fix-agent-context-collector

Parallel Wave 4:
├── fix-worktree-tests
├── fix-stats-tests
└── unskip-start-error-cause

After all above:
└── run-gate-full
```

## Key Root Causes

| Cluster | Cause |
|---------|-------|
| recover | Dolt JSON columns return object in server mode; JSON.parse(string) fails |
| hive-context | Tests expect entries/generatedAt; impl uses tasks/as_of |
| initiative | Error to stderr not stdout; regex /run tg init/ doesn't match "run 'tg init'" |
| initiative status | !isTTY → shouldUseJson=true → JSON output; test expects human |
| fetchStatusData cache | Timeout / dangling process in clear+fetch flow |
| status-live | process.exit(0) cuts off piped stdout before flush |
| gate lifecycle | syncBlockedStatusForTask not run or gate resolution doesn't trigger it |
| blocked-status | project/plan schema, initiative_id, or FK mismatch |
| agent-context | Collector not starting or agent_events schema mismatch |
| worktree | Shares blocked-status root cause; task resolution |
| stats | Output shape mismatch (planSummary, agent_metrics, benchmark filter) |

## Proposed Changes

- **recover**: Defensive parse per agent-field-guide (typeof body === 'string' ? JSON.parse : body)
- **hive-context**: Update tests to expect tasks, as_of, task_id, agent_name
- **initiative**: expectError=true, assert stderr, regex /tg init/i
- **initiative status**: Accept JSON; assert activePlans has initiative
- **status-live**: Use exitCode = 0, avoid process.exit(0) in success path
- **blocked-status/worktree**: Verify golden template migrations, project table, initiative default

<original_prompt>
/plan to fix these tests

2 tests skipped:
» tg start surfaces error cause when worktree fails (wt not on PATH) > human output includes cause line when start fails with worktree error
» tg start surfaces error cause when worktree fails (wt not on PATH) > JSON output includes cause when start fails with worktree error

34 tests failed: Agent context collector (5), Gate lifecycle (1), status-live (6), tg recover (1), Blocked status materialized (4), fetchStatusData cache (1), tg initiative (3), Context --hive (3), Worktree (5), tg stats (4), Dolt sync (1)
</original_prompt>
