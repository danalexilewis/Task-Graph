# Agent Hours Stat — Calculation and Query Cost

## What it measures

**Agent Hours** in the dashboard footer is the sum of elapsed time (in hours) between each task’s start and end.

- **Data source**: Denormalized `task.started_at` and `task.ended_at` (footprint columns).
- **Population**: Set on `tg start` and `tg done`; historical tasks backfilled from `event` by `applyTaskFootprintBackfillMigration`.
- **Result**: `SUM(TIMESTAMPDIFF(SECOND, started_at, ended_at)) / 3600` over tasks with both set, rounded to whole hours in the UI.

## SQL (current query in code)

```sql
SELECT COALESCE(SUM(TIMESTAMPDIFF(SECOND, started_at, ended_at)), 0) / 3600 AS total_agent_hours
FROM `task`
WHERE started_at IS NOT NULL AND ended_at IS NOT NULL;
```

## What makes it cheap

| Layer | Mechanism |
|-------|-----------|
| **No event joins** | Single table scan on `task`; no `event` access for Agent Hours. |
| **Footprint columns** | `started_at` / `ended_at` maintained on start/done and by backfill migration. |
| **Cache** | `cachedQuery.raw()` caches the result; invalidation on writes to tables used in the query (status cache keys on `event`; task writes also invalidate when status cache includes task). |

## Backfill and write path

- **Write path**: `tg start` sets `task.started_at`; `tg done` sets `task.ended_at` (see `src/cli/start.ts`, `src/cli/done.ts`).
- **Backfill**: `applyTaskFootprintBackfillMigration` in `src/db/migrate.ts` populates `started_at`/`ended_at` from the latest `started` and `done` events per task (same pairing as the old event-based query). Idempotent; only updates rows where `started_at IS NULL`.

## Location in code

- **Query**: `src/cli/status.ts` → `agentMetricsSql` inside `fetchStatusData`.
- **Display**: `getDashboardFooterContent()` → `["Agent hours", bright(String(d.totalAgentHours))]`.
- **Schema**: `docs/schema.md` → task table `started_at`, `ended_at`.

## Edge cases

- **Tasks without footprint**: Tasks that were done before the migration (and not backfilled) or that have no started/done events do not contribute to Agent Hours until backfill or write path sets the columns.
- **Human vs agent**: The stat counts all tasks with footprint set; it does not filter by `actor`.

## Diagnosing

To see tasks with both timestamps set:

```sql
SELECT COUNT(*) FROM `task` WHERE started_at IS NOT NULL AND ended_at IS NOT NULL;
```

To find done tasks still missing footprint (candidates for backfill or manual fix):

```sql
SELECT task_id, status FROM `task` WHERE status = 'done' AND (started_at IS NULL OR ended_at IS NULL);
```
