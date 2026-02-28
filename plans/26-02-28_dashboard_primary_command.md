---
name: Dashboard as primary command
overview: Move the live dashboard from a flag on tg status to a top-level tg dashboard command; default shows only active items; add focused views --tasks and --projects with active + next 7 + last 7 (or N for plans). Deprecate tg status --dashboard for cleanliness. The dashboard command opens the TUI; do not add a separate tg tui command.
fileTree: |
  src/
  └── cli/
      ├── index.ts                (modify)
      ├── status.ts               (modify)
      ├── dashboard.ts           (create)
      └── tui/
          └── live-opentui.ts     (modify)
  __tests__/
  ├── cli/
  │   ├── status.test.ts         (modify)
  │   └── dashboard.test.ts      (create)
  └── integration/
      └── status-live.test.ts    (modify)
  docs/
  └── cli-reference.md            (modify)
risks:
  - description: Duplication if dashboard and status live paths are not shared
    severity: medium
    mitigation: Extract shared "run dashboard" / fetch+format layer used by both tg dashboard and tg status --dashboard
  - description: Next-7 ordering may drift from tg next ordering
    severity: low
    mitigation: Reuse or document single runnable order (e.g. priority, risk, estimate_mins, created_at) in one place
tests:
  - "tg dashboard exits 0 and shows live sections (default)"
  - "tg dashboard --tasks returns active + next 7 + last 7 in output or live view"
  - "tg dashboard --projects returns active + next N + last N"
  - "tg status --dashboard prints deprecation warning and delegates to tg dashboard (or is removed)"
todos:
  - id: add-dashboard-cmd
    content: Add tg dashboard command and dashboard.ts entrypoint
    agent: implementer
    intent: |
      Register a new top-level command `tg dashboard` in src/cli/index.ts (dashboardCommand(program)).
      Do NOT add a separate tg tui command; the dashboard command is the sole TUI entrypoint.
      Create src/cli/dashboard.ts that parses `tg dashboard [--tasks] [--projects]` and invokes the same
      live path currently used by tg status --dashboard (reuse fetchStatusData / live-opentui or a shared
      runner). No new data shapes yet; goal is tg dashboard and tg dashboard --tasks/--projects to exist
      and run the existing live flow. Follow existing status command pattern for options and config read.
    changeType: create
  - id: queries-tasks-next-last
    content: Add next 7 runnable and last 7 completed task queries
    agent: implementer
    intent: |
      In status.ts (or a shared data module used by status/dashboard), add:
      (1) Runnable tasks LIMIT 7 - same condition as current nextSql (todo, no unmet blockers), same
      dimension filters; order consistent with tg next (priority, risk, estimate_mins, created_at).
      (2) Last 7 completed tasks - task.status = 'done', plan not abandoned, ORDER BY updated_at DESC
      LIMIT 7. Expose in a type (e.g. extend StatusData or add DashboardTasksData) used by dashboard.
      Reuse existing runnable logic from status/next where possible; add new query for "last 7 done".
    changeType: modify
  - id: queries-plans-next-last
    content: Add next N and last N completed plan queries
    agent: implementer
    intent: |
      Add queries for plans: (1) Next N "upcoming" plans - e.g. status IN (draft, active, paused)
      ORDER BY updated_at DESC (or priority) LIMIT N. (2) Last N completed plans - plan.status = 'done'
      ORDER BY updated_at DESC LIMIT N. Use N=7 for parity with tasks. Expose in a type used by
      dashboard (e.g. DashboardProjectsData). Active plans (not done/abandoned) already exist in
      fetchStatusData/fetchProjectsTableData; this task adds the "next N" and "last N" result sets.
    changeType: modify
  - id: dashboard-default-view
    content: Default tg dashboard shows only active items plus optional Completed one-liner
    agent: implementer
    blockedBy: [add-dashboard-cmd, queries-tasks-next-last]
    intent: |
      When user runs `tg dashboard` (no --tasks/--projects), show live dashboard with only active
      items in each section: Active Plans (unchanged), Active Work (unchanged), Next Runnable (can
      stay 3 or use 7; product said "only active" so no historical rows). Add optional one-line
      "Completed" summary (e.g. "Plans: 37 done, Tasks: 256 done") so user has context. Remove or
      collapse any full "Completed" table. Reuse formatStatusAsString / boxen sections; ensure
      fetch path for default dashboard returns only active-focused data (or filter in format).
    changeType: modify
  - id: dashboard-tasks-view
    content: Wire tg dashboard --tasks to active + next 7 + last 7 tasks
    agent: implementer
    blockedBy: [add-dashboard-cmd, queries-tasks-next-last]
    intent: |
      When user runs `tg dashboard --tasks`, show three sections (or three tables) in the live view:
      (1) Active tasks (todo, doing, blocked) - reuse fetchTasksTableData with filter active.
      (2) Next 7 upcoming - use new runnable LIMIT 7 query from queries-tasks-next-last.
      (3) Last 7 completed - use new "last 7 done" query. Format as boxen sections or single
      table with section headers; plug into existing live path (runOpenTUILiveTasks or new
      runOpenTUILiveDashboardTasks) with 2s refresh. Extend StatusOptions or dashboard options
      to carry tasksView: true and pass through to fetcher/formatter.
    changeType: modify
  - id: dashboard-projects-view
    content: Wire tg dashboard --projects to active + next N + last N plans
    agent: implementer
    blockedBy: [add-dashboard-cmd, queries-plans-next-last]
    intent: |
      When user runs `tg dashboard --projects`, show three sections: (1) Active projects (plans
      not done/abandoned) - reuse existing projects fetch. (2) Next N upcoming plans - use new
      query from queries-plans-next-last. (3) Last N completed plans - use new "last N done"
      query. N=7. Same live path pattern as --tasks; add runOpenTUILiveDashboardProjects or
      extend existing runOpenTUILiveProjects. Mutual exclusion: only one of --tasks or --projects.
    changeType: modify
  - id: deprecate-status-dashboard
    content: Deprecate tg status --dashboard in favor of tg dashboard
    agent: implementer
    blockedBy: [add-dashboard-cmd, dashboard-default-view]
    intent: |
      Deprecate `tg status --dashboard` for cleanliness. When the user passes --dashboard to
      tg status, print a deprecation warning to stderr (e.g. "tg status --dashboard is
      deprecated; use 'tg dashboard' instead.") and then run the same dashboard implementation
      (delegate to runDashboard(config, options) or equivalent) so behavior is unchanged.
      Remove the --dashboard option from the status command's option list, or keep it but
      document as deprecated. Update docs/cli-reference.md to state that tg status --dashboard
      is deprecated and will be removed in a future version; use tg dashboard instead.
    changeType: modify
  - id: dashboard-tests-docs
    content: Add tests and update cli-reference for tg dashboard
    agent: implementer
    blockedBy: [dashboard-default-view, dashboard-tasks-view, dashboard-projects-view, deprecate-status-dashboard]
    intent: |
      Unit/integration tests: (1) tg dashboard exits 0 and output contains expected sections
      (or live starts). (2) tg dashboard --tasks (one-shot or live) includes next 7 and last 7
      in data or formatted output. (3) tg dashboard --projects same for plans. (4) tg status
      --dashboard prints deprecation and runs dashboard (or is removed). Add __tests__/cli/dashboard.test.ts
      if needed; extend __tests__/integration/status-live.test.ts for dashboard command. Update
      docs/cli-reference.md: new section for tg dashboard (default, --tasks, --projects), and document
      that tg status --dashboard is deprecated in favor of tg dashboard.
    changeType: modify
isProject: false
---

## Analysis

**CLI surface:** The only new command is `tg dashboard`. It opens the live TUI (2s refresh, OpenTUI or setInterval fallback). Do **not** add a separate `tg tui` command; the dashboard command is the TUI entrypoint. The `src/cli/tui/` directory is existing code (live-opentui.ts) that the dashboard will use, not a new CLI subcommand.

The dashboard today is a mode of `tg status`: `--dashboard` enables that same live-updating TUI. Sections shown are Completed (counts), Active Plans, Active Work, Next Runnable (limit 3). Focused views `--tasks` and `--projects` show a single table and with `--dashboard` that table refreshes; there is no "next 7 / last 7" structure.

User requested: (1) `tg dashboard` as its own primary command; (2) default = only active items; (3) `tg dashboard --tasks` = active tasks + next 7 upcoming + last 7 completed; (4) `tg dashboard --projects` = same pattern for plans (active + next N + last N). Clarification confirmed the "next 7 / last 7" pattern for both --tasks and --projects.

Implementation approach: Add a new command and entrypoint so `tg dashboard` is first-class. Reuse existing fetch and live paths (fetchStatusData, fetchTasksTableData, fetchProjectsTableData, live-opentui) to avoid duplication. Introduce new queries only for "next 7 runnable", "last 7 completed tasks", "next N upcoming plans", "last N completed plans"; existing data (plan/task/edge/event) suffices. Deprecate `tg status --dashboard`: warn and delegate to `tg dashboard`, then document as deprecated for cleanliness.

## Dependency graph

```
Parallel start (3 unblocked):
  ├── add-dashboard-cmd (tg dashboard command + dashboard.ts)
  ├── queries-tasks-next-last (next 7 runnable, last 7 done tasks)
  └── queries-plans-next-last (next N, last N plans)

After add-dashboard-cmd + queries-tasks-next-last:
  ├── dashboard-default-view (default dashboard active-only)
  └── dashboard-tasks-view (tg dashboard --tasks)

After add-dashboard-cmd + queries-plans-next-last:
  └── dashboard-projects-view (tg dashboard --projects)

After add-dashboard-cmd + dashboard-default-view:
  └── deprecate-status-dashboard (tg status --dashboard deprecated; warn and delegate)

After dashboard-default-view, dashboard-tasks-view, dashboard-projects-view, deprecate-status-dashboard:
  └── dashboard-tests-docs (tests and cli-reference)
```

## Proposed changes

- **dashboard.ts:** New file. Parse `dashboard [--tasks] [--projects] [--initiatives]`; read config; call shared runDashboard(config, options) or existing live runners with appropriate view mode. Exit on invalid combo (e.g. --tasks and --projects together)
- **status.ts:** Add functions or extend fetch to return `next7RunnableTasks`, `last7CompletedTasks`, `nextNUpcomingPlans`, `lastNCompletedPlans`. Reuse nextSql pattern for runnable (increase limit to 7); add SELECT for done tasks ordered by updated_at DESC LIMIT 7; similar for plans. Default dashboard format: when view is "dashboard", only output active sections + one-line Completed summary.
- **live-opentui.ts:** Accept dashboard-specific payload (e.g. next 7, last 7) when view is tasks/projects; render three sections for --tasks and for --projects.
- **index.ts:** Register `program.command('dashboard')` and pass to dashboardCommand.

- **Deprecation:** When `tg status --dashboard` is used, emit a deprecation warning to stderr and delegate to the same dashboard implementation; document in cli-reference that the flag is deprecated in favor of `tg dashboard`.

## Open questions

- None; "next 7 / last 7" and "next N / last N" for plans with N=7 are decided.

<original_prompt>
Move dashboard from tg status --dashboard to tg dashboard as primary command. Default tg dashboard: live view, only active items. tg dashboard --tasks: active tasks + next 7 upcoming + last 7 completed. tg dashboard --projects: same pattern (active + next N + last N). User confirmed same pattern for --projects. Create a new plan for this work.
</original_prompt>
