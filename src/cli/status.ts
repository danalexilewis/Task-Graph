import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import type { Command } from "commander";
import { okAsync, ResultAsync } from "neverthrow";
import type { QueryCache } from "../db/cache";
import { cachedQuery } from "../db/cached-query";
import { sqlEscape } from "../db/escape";
import { tableExists } from "../db/migrate";
import { query } from "../db/query";
import type { AppError } from "../domain/errors";
import {
  getSchemaFlags,
  getStatusCache,
  statusCacheTtlMs,
} from "./status-cache";
import { renderTable } from "./table";
import { getTerminalHeight, getTerminalWidth } from "./terminal";
import {
  boxedSection,
  getBoxInnerWidth,
  getBoxInnerWidthDashboard,
  getBoxInnerWidthTight,
} from "./tui/boxen";
import { type Config, readConfig, rootOpts } from "./utils";

const INITIATIVES_STUB_MESSAGE =
  "Initiatives view requires the Initiative-Project hierarchy (initiative table). Add the initiative table and optional plan.initiative_id to enable this view.";

export type StatusViewMode = "dashboard" | "tasks" | "projects" | "initiatives";

export interface StatusOptions {
  plan?: string;
  domain?: string;
  skill?: string;
  changeType?: string;
  all?: boolean;
  projects?: boolean;
  initiatives?: boolean;
  tasks?: boolean;
  filter?: string;
  /** Set by action from flags; when present, selects which fetch/print path to use. */
  view?: StatusViewMode;
  /** When true (e.g. tg dashboard --tasks), show three sections: Active, Next 7, Last 7. */
  tasksView?: boolean;
  /** Hours threshold for stale doing-task warning (default: 2). */
  staleThreshold?: number;
}

export interface ProjectRow {
  plan_id: string;
  title: string;
  status: string;
  todo: number;
  doing: number;
  blocked: number;
  done: number;
  /** Initiative title when initiative table exists; otherwise absent. */
  initiative_title?: string | null;
}

export interface InitiativeRow {
  /** Cycle name when cycle table exists; otherwise absent. */
  cycle_name?: string | null;
  initiative_id: string;
  title: string;
  status: string;
  cycle_start: string | null;
  cycle_end: string | null;
  project_count: number;
}

export interface TaskRow {
  task_id: string;
  hash_id: string | null;
  title: string;
  plan_title: string;
  status: string;
  owner: string;
  /** When status is 'blocked', set to the first pending gate name if blocked by a gate. */
  blocked_by_gate_name?: string | null;
}

export interface StaleDoingTaskRow {
  task_id: string;
  hash_id: string | null;
  title: string;
  owner: string | null;
  age_hours: number;
}

function bt(name: string): string {
  return `\`${name}\``;
}

/** Sub-agent types that can be dispatched (Task tool / mcp_task). Matches available-agents.mdc. */
const DEFINED_SUB_AGENT_TYPES = [
  "generalPurpose",
  "explore",
  "shell",
  "browser-use",
  "investigator",
  "planner-analyst",
  "implementer",
  "documenter",
  "reviewer",
  "test-quality-auditor",
  "test-infra-mapper",
  "test-coverage-scanner",
  "debugger",
  "fixer",
  "spec-reviewer",
  "quality-reviewer",
];

function getRepoRootFromConfig(config: Config): string {
  const doltAbs = resolve(process.cwd(), config.doltRepoPath);
  return resolve(doltAbs, "..", "..");
}

/** Count defined agent templates in .cursor/agents/*.md (excluding README.md). */
function getDefinedAgentCount(repoRoot: string): number {
  const agentsDir = resolve(repoRoot, ".cursor", "agents");
  if (!existsSync(agentsDir)) return 0;
  const entries = readdirSync(agentsDir, { withFileTypes: true });
  return entries.filter(
    (e) => e.isFile() && e.name.endsWith(".md") && e.name !== "README.md",
  ).length;
}

interface ActivePlanRow {
  plan_id: string;
  title: string;
  status: string;
  count: number;
  initiative_title?: string | null;
}

interface NextTaskRow {
  task_id: string;
  hash_id: string | null;
  title: string;
  plan_title: string;
  /** Present when fetched for dashboard Next 7 (used for stale indicator). */
  updated_at?: string | null;
}

/** Row for last N completed tasks (dashboard); includes updated_at for recency display. */
export interface LastCompletedTaskRow {
  task_id: string;
  hash_id: string | null;
  title: string;
  plan_title: string;
  updated_at: string | null;
}

/** Row for next N upcoming plans (status draft/active/paused) or last N completed plans (status done). */
export interface PlanSummaryRow {
  plan_id: string;
  title: string;
  status: string;
  updated_at: string | null;
  /** Initiative title when initiative table exists; otherwise absent. */
  initiative_title?: string | null;
}

interface ActiveWorkRow {
  task_id: string;
  hash_id: string | null;
  title: string;
  plan_title: string;
  body: string | object | null;
  created_at: string | null;
}

export interface StatusData {
  completedPlans: number;
  completedTasks: number;
  canceledTasks: number;
  activePlans: Array<{
    plan_id: string;
    title: string;
    todo: number;
    doing: number;
    blocked: number;
    done: number;
    actionable: number;
    /** Initiative title when initiative table exists. */
    initiative_title?: string | null;
  }>;
  staleTasks: Array<{ task_id: string; hash_id: string | null; title: string }>;
  staleDoingTasks: StaleDoingTaskRow[];
  nextTasks: NextTaskRow[];
  /** Next 7 runnable tasks (same condition as nextSql; order matches tg next). */
  next7RunnableTasks: NextTaskRow[];
  /** Last 7 completed tasks (plan not abandoned), ordered by updated_at DESC. */
  last7CompletedTasks: LastCompletedTaskRow[];
  /** Next 7 upcoming plans (status in draft/active/paused), ordered by priority DESC, updated_at DESC. */
  next7UpcomingPlans: PlanSummaryRow[];
  /** Last 7 completed plans (status = done), ordered by updated_at DESC. */
  last7CompletedPlans: PlanSummaryRow[];
  activeWork: ActiveWorkRow[];
  plansCount: number;
  statusCounts: Record<string, number>;
  actionableCount: number;
  /** When in default dashboard view: current cycle (today between start and end), if any. */
  currentCycle?: {
    name: string;
    start_date: string;
    end_date: string;
    initiative_count: number;
  } | null;
  /** Number of defined agent templates (.cursor/agents/*.md, excluding README). */
  agentCount: number;
  /** Number of defined sub-agent types (Task/mcp_task dispatchable). */
  subAgentTypesDefined: number;
  /** Number of task completions (done events). */
  subAgentRuns: number;
  /** Sum of started→done elapsed time in hours. */
  totalAgentHours: number;
  investigatorRuns: number;
  investigatorFixRate: number;
}

export function fetchStatusData(
  config: Config,
  options: StatusOptions,
  cache?: QueryCache,
): ResultAsync<StatusData, AppError> {
  const resolvedCache = cache ?? getStatusCache();
  const q = cachedQuery(config.doltRepoPath, resolvedCache, statusCacheTtlMs);

  const isUUID =
    options.plan &&
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      options.plan,
    );

  const dimFilter =
    (options.domain
      ? ` AND EXISTS (SELECT 1 FROM ${bt("task_doc")} td WHERE td.task_id = t.task_id AND td.doc = '${sqlEscape(options.domain)}')`
      : "") +
    (options.skill
      ? ` AND EXISTS (SELECT 1 FROM ${bt("task_skill")} ts WHERE ts.task_id = t.task_id AND ts.skill = '${sqlEscape(options.skill)}')`
      : "") +
    (options.changeType
      ? ` AND t.${bt("change_type")} = '${sqlEscape(options.changeType)}'`
      : "");

  const excludeCanceledAbandoned = options.all
    ? ""
    : " AND t.status != 'canceled' AND p.status != 'abandoned' ";
  const planAbandonedFilter = options.all
    ? ""
    : " AND `status` != 'abandoned' ";

  let planWhere = "";
  if (options.plan) {
    if (isUUID) {
      planWhere = `WHERE ${bt("plan_id")} = '${sqlEscape(options.plan)}'`;
    } else {
      planWhere = `WHERE ${bt("title")} = '${sqlEscape(options.plan)}'`;
    }
  }

  const planFilter = options.plan
    ? isUUID
      ? `WHERE p.plan_id = '${sqlEscape(options.plan)}'`
      : `WHERE p.title = '${sqlEscape(options.plan)}'`
    : "";

  const completedPlansSql = `SELECT COUNT(*) AS count FROM ${bt("project")} WHERE status = 'done'`;
  const completedTasksSql = `SELECT COUNT(*) AS count FROM ${bt("task")} WHERE status = 'done'`;
  const canceledTasksSql = `SELECT COUNT(*) AS count FROM ${bt("task")} WHERE status = 'canceled'`;
  const agentMetricsSql = `
    SELECT
      (SELECT COUNT(DISTINCT JSON_UNQUOTE(JSON_EXTRACT(body, '$.agent'))) FROM ${bt("event")} WHERE kind = 'started' AND JSON_EXTRACT(body, '$.agent') IS NOT NULL) AS agent_count,
      (SELECT COUNT(*) FROM ${bt("event")} WHERE kind = 'done') AS sub_agent_runs,
      (SELECT COUNT(*) FROM ${bt("event")} WHERE kind = 'done' AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.agent')) = 'investigator') AS investigator_runs,
      (SELECT COALESCE(SUM(sec), 0) / 3600 FROM (
        SELECT TIMESTAMPDIFF(SECOND,
          (SELECT created_at FROM ${bt("event")} e2 WHERE e2.task_id = d.task_id AND e2.kind = 'started' ORDER BY e2.created_at DESC LIMIT 1),
          d.created_at
        ) AS sec
        FROM ${bt("event")} d WHERE d.kind = 'done'
      ) x) AS total_agent_minutes
  `;

  const buildPlansSql = (initiativeExists: boolean) => {
    const initiativeSelect = initiativeExists
      ? ", i.title AS initiative_title"
      : "";
    const initiativeJoin = initiativeExists
      ? ` LEFT JOIN ${bt("initiative")} i ON p.initiative_id = i.initiative_id`
      : "";
    return `
    SELECT p.plan_id, p.title, t.status, COUNT(*) AS count${initiativeSelect}
    FROM ${bt("project")} p${initiativeJoin}
    JOIN ${bt("task")} t ON t.plan_id = p.plan_id
    WHERE p.status NOT IN ('done', 'abandoned')
      AND t.status NOT IN ('canceled')
    ${options.plan ? (isUUID ? `AND p.plan_id = '${sqlEscape(options.plan)}'` : `AND p.title = '${sqlEscape(options.plan)}'`) : ""}
    ${dimFilter}
    GROUP BY p.plan_id, p.title, p.status, p.priority, p.updated_at, t.status${initiativeExists ? ", p.initiative_id, i.title" : ""}
    ORDER BY CASE WHEN p.status = 'draft' THEN 1 ELSE 0 END, p.priority DESC, p.updated_at DESC, p.title ASC
  `;
  };

  const actionablePerPlanSql = `
    SELECT p.plan_id, COUNT(*) AS count
    FROM ${bt("task")} t
    JOIN ${bt("project")} p ON t.plan_id = p.plan_id
    WHERE t.status = 'todo'
      AND p.status NOT IN ('done', 'abandoned')
      AND (SELECT COUNT(*) FROM ${bt("edge")} e
           JOIN ${bt("task")} bt ON e.from_task_id = bt.task_id
           WHERE e.to_task_id = t.task_id AND e.type = 'blocks'
           AND bt.status NOT IN ('done','canceled')) = 0
    ${options.plan ? (isUUID ? `AND p.plan_id = '${sqlEscape(options.plan)}'` : `AND p.title = '${sqlEscape(options.plan)}'`) : ""}
    ${dimFilter}
    GROUP BY p.plan_id
  `;

  const staleSql = `
    SELECT t.task_id, t.hash_id, t.title
    FROM ${bt("task")} t
    WHERE t.status = 'doing'
  `;

  const plansCountSql = dimFilter
    ? `SELECT COUNT(DISTINCT p.plan_id) AS count FROM ${bt("project")} p JOIN ${bt("task")} t ON t.plan_id = p.plan_id ${planFilter || "WHERE 1=1"} ${dimFilter}${excludeCanceledAbandoned}`
    : `SELECT COUNT(*) AS count FROM ${bt("project")} ${planWhere || "WHERE 1=1"}${planAbandonedFilter}`;
  const statusCountsSql = `SELECT t.status, COUNT(*) AS count FROM ${bt("task")} t JOIN ${bt("project")} p ON t.plan_id = p.plan_id ${planFilter || "WHERE 1=1"} ${dimFilter}${excludeCanceledAbandoned} GROUP BY t.status`;
  const actionableCountSql = `
    SELECT COUNT(*) AS count FROM ${bt("task")} t
    JOIN ${bt("project")} p ON t.plan_id = p.plan_id
    WHERE t.status = 'todo'
    AND (SELECT COUNT(*) FROM ${bt("edge")} e
         JOIN ${bt("task")} bt ON e.from_task_id = bt.task_id
         WHERE e.to_task_id = t.task_id AND e.type = 'blocks'
         AND bt.status NOT IN ('done','canceled')) = 0
    ${options.plan ? (isUUID ? `AND p.plan_id = '${sqlEscape(options.plan)}'` : `AND p.title = '${sqlEscape(options.plan)}'`) : ""}
    ${dimFilter}
    ${excludeCanceledAbandoned}
  `;
  const nextSql = `
    SELECT t.task_id, t.hash_id, t.title, p.title as plan_title, t.updated_at
    FROM ${bt("task")} t
    JOIN ${bt("project")} p ON t.plan_id = p.plan_id
    WHERE t.status = 'todo'
    AND (SELECT COUNT(*) FROM ${bt("edge")} e
         JOIN ${bt("task")} bt ON e.from_task_id = bt.task_id
         WHERE e.to_task_id = t.task_id AND e.type = 'blocks'
         AND bt.status NOT IN ('done','canceled')) = 0
    ${options.plan ? (isUUID ? `AND p.plan_id = '${sqlEscape(options.plan)}'` : `AND p.title = '${sqlEscape(options.plan)}'`) : ""}
    ${dimFilter}
    ${excludeCanceledAbandoned}
    ORDER BY p.priority DESC, t.created_at ASC
    LIMIT 3
  `;
  const next7Sql = `
    SELECT t.task_id, t.hash_id, t.title, p.title as plan_title, t.updated_at
    FROM ${bt("task")} t
    JOIN ${bt("project")} p ON t.plan_id = p.plan_id
    WHERE t.status = 'todo'
    AND (SELECT COUNT(*) FROM ${bt("edge")} e
         JOIN ${bt("task")} bt ON e.from_task_id = bt.task_id
         WHERE e.to_task_id = t.task_id AND e.type = 'blocks'
         AND bt.status NOT IN ('done','canceled')) = 0
    ${options.plan ? (isUUID ? `AND p.plan_id = '${sqlEscape(options.plan)}'` : `AND p.title = '${sqlEscape(options.plan)}'`) : ""}
    ${dimFilter}
    ${excludeCanceledAbandoned}
    ORDER BY p.priority DESC, t.risk ASC, CASE WHEN t.estimate_mins IS NULL THEN 1 ELSE 0 END, t.estimate_mins ASC, t.created_at ASC
    LIMIT 7
  `;
  const last7CompletedSql = `
    SELECT t.task_id, t.hash_id, t.title, p.title as plan_title, t.updated_at
    FROM ${bt("task")} t
    JOIN ${bt("project")} p ON t.plan_id = p.plan_id
    WHERE t.status = 'done'
    AND p.status != 'abandoned'
    ${options.plan ? (isUUID ? `AND p.plan_id = '${sqlEscape(options.plan)}'` : `AND p.title = '${sqlEscape(options.plan)}'`) : ""}
    ${dimFilter}
    ORDER BY t.updated_at DESC
    LIMIT 7
  `;
  const buildNext7UpcomingPlansSql = (initiativeExists: boolean) => {
    const initiativeSelect = initiativeExists
      ? ", i.title AS initiative_title"
      : "";
    const initiativeJoin = initiativeExists
      ? ` LEFT JOIN ${bt("initiative")} i ON p.initiative_id = i.initiative_id`
      : "";
    return `
    SELECT p.plan_id AS plan_id, p.title, p.status, p.updated_at${initiativeSelect}
    FROM ${bt("project")} p${initiativeJoin}
    WHERE p.status IN ('draft', 'active', 'paused')
    ${options.plan ? (isUUID ? `AND p.plan_id = '${sqlEscape(options.plan)}'` : `AND p.title = '${sqlEscape(options.plan)}'`) : ""}
    ORDER BY CASE WHEN p.status = 'draft' THEN 1 ELSE 0 END, p.priority DESC, p.updated_at DESC
    LIMIT 7
  `;
  };
  const buildLast7CompletedPlansSql = (initiativeExists: boolean) => {
    const initiativeSelect = initiativeExists
      ? ", i.title AS initiative_title"
      : "";
    const initiativeJoin = initiativeExists
      ? ` LEFT JOIN ${bt("initiative")} i ON p.initiative_id = i.initiative_id`
      : "";
    return `
    SELECT p.plan_id AS plan_id, p.title, p.status, p.updated_at${initiativeSelect}
    FROM ${bt("project")} p${initiativeJoin}
    WHERE p.status = 'done'
    ${options.plan ? (isUUID ? `AND p.plan_id = '${sqlEscape(options.plan)}'` : `AND p.title = '${sqlEscape(options.plan)}'`) : ""}
    ORDER BY p.updated_at ASC
    LIMIT 7
  `;
  };
  const activeWorkSql = `
    SELECT t.task_id, t.hash_id, t.title, p.title as plan_title, e.body, e.created_at
    FROM ${bt("task")} t
    JOIN ${bt("project")} p ON t.plan_id = p.plan_id
    LEFT JOIN ${bt("event")} e ON e.task_id = t.task_id AND e.kind = 'started'
      AND e.created_at = (
        SELECT MAX(e2.created_at) FROM ${bt("event")} e2
        WHERE e2.task_id = t.task_id AND e2.kind = 'started'
      )
    WHERE t.status = 'doing'
    ${options.plan ? (isUUID ? `AND p.plan_id = '${sqlEscape(options.plan)}'` : `AND p.title = '${sqlEscape(options.plan)}'`) : ""}
    ${dimFilter}
    ${excludeCanceledAbandoned}
    ORDER BY e.created_at DESC, t.task_id
  `;

  interface AgentMetricsRow {
    agent_count: number;
    sub_agent_runs: number;
    total_agent_minutes: number;
    investigator_runs: number;
  }

  // Fetch both optional-table flags in one memoized call (5-min TTL).
  return getSchemaFlags(config.doltRepoPath).andThen(
    ({ initiativeExists, cycleExists }) => {
      const activePlansSql = buildPlansSql(initiativeExists);
      const next7UpcomingPlansSql =
        buildNext7UpcomingPlansSql(initiativeExists);
      const last7CompletedPlansSql =
        buildLast7CompletedPlansSql(initiativeExists);
      // All queries are independent reads — run them all in parallel.
      return ResultAsync.combine([
        q.raw<{ count: number }>(completedPlansSql),
        q.raw<{ count: number }>(completedTasksSql),
        q.raw<{ count: number }>(canceledTasksSql),
        q.raw<AgentMetricsRow>(agentMetricsSql),
        q.raw<ActivePlanRow>(activePlansSql),
        q.raw<{ plan_id: string; count: number }>(actionablePerPlanSql),
        q.raw<{ task_id: string; hash_id: string | null; title: string }>(
          staleSql,
        ),
        q.raw<{ count: number }>(plansCountSql),
        q.raw<{ status: string; count: number }>(statusCountsSql),
        q.raw<{ count: number }>(actionableCountSql),
        q.raw<NextTaskRow>(nextSql),
        q.raw<NextTaskRow>(next7Sql),
        q.raw<LastCompletedTaskRow>(last7CompletedSql),
        q.raw<PlanSummaryRow>(next7UpcomingPlansSql),
        q.raw<PlanSummaryRow>(last7CompletedPlansSql),
        q.raw<ActiveWorkRow>(activeWorkSql),
        fetchStaleDoingTasks(config.doltRepoPath, options.staleThreshold ?? 2),
      ] as const).andThen(
        ([
          cpRes,
          ctRes,
          canRes,
          amRes,
          apRows,
          actionableRows,
          staleRows,
          plansRes,
          statusRows,
          actionableRes,
          nextTasks,
          next7RunnableTasks,
          last7CompletedTasks,
          next7UpcomingPlans,
          last7CompletedPlans,
          activeWork,
          staleDoingTasks,
        ]) => {
          {
            const completedPlans = cpRes[0]?.count ?? 0;
            const completedTasks = ctRes[0]?.count ?? 0;
            const canceledTasks = canRes[0]?.count ?? 0;
            const repoRoot = getRepoRootFromConfig(config);
            const agentCount = getDefinedAgentCount(repoRoot);
            const subAgentTypesDefined = DEFINED_SUB_AGENT_TYPES.length;
            const subAgentRuns = Number(amRes[0]?.sub_agent_runs ?? 0);
            const totalAgentHours = Math.round(
              Number(amRes[0]?.total_agent_minutes ?? 0),
            );
            const investigatorRuns = Number(amRes[0]?.investigator_runs ?? 0);
            const investigatorFixRate =
              subAgentRuns > 0
                ? Math.round((investigatorRuns / subAgentRuns) * 100)
                : 0;

            const actionableMap = new Map(
              actionableRows.map((r) => [r.plan_id, r.count]),
            );
            const planMap = new Map<
              string,
              {
                plan_id: string;
                title: string;
                todo: number;
                doing: number;
                blocked: number;
                done: number;
                actionable: number;
                initiative_title?: string | null;
              }
            >();
            for (const row of apRows) {
              if (!planMap.has(row.plan_id)) {
                planMap.set(row.plan_id, {
                  plan_id: row.plan_id,
                  title: row.title,
                  todo: 0,
                  doing: 0,
                  blocked: 0,
                  done: 0,
                  actionable: actionableMap.get(row.plan_id) ?? 0,
                  initiative_title: row.initiative_title ?? null,
                });
              }
              const entry = planMap.get(row.plan_id);
              if (entry) {
                if (row.status === "todo") entry.todo = row.count;
                else if (row.status === "doing") entry.doing = row.count;
                else if (row.status === "blocked") entry.blocked = row.count;
                else if (row.status === "done") entry.done = row.count;
              }
            }
            const activePlans = Array.from(planMap.values()).filter(
              (p) => p.todo > 0 || p.doing > 0 || p.blocked > 0,
            );

            const statusCounts: Record<string, number> = {};
            statusRows.forEach((r) => {
              statusCounts[r.status] = r.count;
            });

            const base: StatusData = {
              completedPlans,
              completedTasks,
              canceledTasks,
              activePlans,
              staleTasks: staleRows,
              staleDoingTasks,
              nextTasks,
              next7RunnableTasks,
              last7CompletedTasks,
              next7UpcomingPlans,
              last7CompletedPlans,
              activeWork,
              plansCount: plansRes[0]?.count ?? 0,
              statusCounts,
              actionableCount: actionableRes[0]?.count ?? 0,
              agentCount,
              subAgentTypesDefined,
              subAgentRuns,
              totalAgentHours,
              investigatorRuns,
              investigatorFixRate,
            };

            return ((): ResultAsync<StatusData, AppError> => {
              if (!cycleExists) return okAsync(base);
              const currentCycleSql = `
          SELECT c.name, c.start_date, c.end_date,
                 COUNT(DISTINCT i.initiative_id) AS initiative_count
          FROM ${bt("cycle")} c
          LEFT JOIN ${bt("initiative")} i ON i.cycle_id = c.cycle_id
          WHERE CURDATE() BETWEEN c.start_date AND c.end_date
          GROUP BY c.cycle_id, c.name, c.start_date, c.end_date
          LIMIT 1`;
              return q
                .raw<{
                  name: string;
                  start_date: string;
                  end_date: string;
                  initiative_count: number;
                }>(currentCycleSql)
                .map((rows) => ({ ...base, currentCycle: rows[0] ?? null }));
            })();
          }
        },
      );
    },
  );
}

/**
 * Fetch doing tasks that have been in-progress longer than thresholdHours.
 * Joins the most recent 'started' event per task to compute elapsed hours.
 */
export function fetchStaleDoingTasks(
  repoPath: string,
  thresholdHours = 2,
): ResultAsync<StaleDoingTaskRow[], AppError> {
  const q = query(repoPath);
  const threshold = Math.max(0, Math.floor(thresholdHours));
  const sql = `
    SELECT
      t.task_id,
      t.hash_id,
      t.title,
      t.owner,
      TIMESTAMPDIFF(HOUR, e.created_at, NOW()) AS age_hours
    FROM ${bt("task")} t
    JOIN ${bt("event")} e ON e.task_id = t.task_id AND e.kind = 'started'
      AND e.created_at = (
        SELECT MAX(e2.created_at) FROM ${bt("event")} e2
        WHERE e2.task_id = t.task_id AND e2.kind = 'started'
      )
    WHERE t.status = 'doing'
      AND TIMESTAMPDIFF(HOUR, e.created_at, NOW()) > ${threshold}
    ORDER BY age_hours DESC
  `;
  return q.raw<StaleDoingTaskRow>(sql);
}

/**
 * Fetch projects (plans) table: one row per plan with task counts.
 * Reuses --plan, --domain, --skill, --all. When --filter active, plan status NOT IN ('done','abandoned').
 * When initiative table exists, includes initiative_title (from initiative join).
 */
export function fetchProjectsTableData(
  config: Config,
  options: StatusOptions,
  cache?: QueryCache,
): ResultAsync<ProjectRow[], AppError> {
  const resolvedCache = cache ?? getStatusCache();
  const q = cachedQuery(config.doltRepoPath, resolvedCache, statusCacheTtlMs);
  const isUUID =
    options.plan &&
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      options.plan,
    );

  const planWhere = options.plan
    ? isUUID
      ? `AND p.${bt("plan_id")} = '${sqlEscape(options.plan)}'`
      : `AND p.${bt("title")} = '${sqlEscape(options.plan)}'`
    : "";

  const dimJoin =
    (options.domain
      ? ` AND EXISTS (SELECT 1 FROM ${bt("task_doc")} td WHERE td.task_id = t.task_id AND td.doc = '${sqlEscape(options.domain)}')`
      : "") +
    (options.skill
      ? ` AND EXISTS (SELECT 1 FROM ${bt("task_skill")} ts WHERE ts.task_id = t.task_id AND ts.skill = '${sqlEscape(options.skill)}')`
      : "");

  const taskNotCanceled = options.all ? "" : " AND t.status != 'canceled' ";
  const planNotAbandoned = options.all ? "" : " AND p.status != 'abandoned' ";
  const filterActive =
    options.filter === "active"
      ? ` AND p.${bt("status")} NOT IN ('done', 'abandoned') `
      : "";

  const projectsSqlNoInitiative = `
    SELECT p.plan_id, p.title, p.status, p.updated_at,
      COALESCE(SUM(CASE WHEN t.status = 'todo' THEN 1 ELSE 0 END), 0) AS todo,
      COALESCE(SUM(CASE WHEN t.status = 'doing' THEN 1 ELSE 0 END), 0) AS doing,
      COALESCE(SUM(CASE WHEN t.status = 'blocked' THEN 1 ELSE 0 END), 0) AS blocked,
      COALESCE(SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END), 0) AS done
    FROM ${bt("project")} p
    LEFT JOIN ${bt("task")} t ON t.plan_id = p.plan_id ${taskNotCanceled} ${dimJoin}
    WHERE 1=1 ${planWhere} ${planNotAbandoned} ${filterActive}
    GROUP BY p.plan_id, p.title, p.status, p.updated_at
    ORDER BY CASE WHEN p.status = 'draft' THEN 2 WHEN p.status = 'done' THEN 0 ELSE 1 END,
      CASE WHEN p.status = 'done' THEN p.updated_at END ASC,
      CASE WHEN p.status IN ('active','paused') THEN p.updated_at END DESC,
      p.title ASC
  `;

  const projectsSqlWithInitiative = `
    SELECT p.plan_id, p.title, p.status, p.updated_at,
      COALESCE(SUM(CASE WHEN t.status = 'todo' THEN 1 ELSE 0 END), 0) AS todo,
      COALESCE(SUM(CASE WHEN t.status = 'doing' THEN 1 ELSE 0 END), 0) AS doing,
      COALESCE(SUM(CASE WHEN t.status = 'blocked' THEN 1 ELSE 0 END), 0) AS blocked,
      COALESCE(SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END), 0) AS done,
      i.title AS initiative_title
    FROM ${bt("project")} p
    LEFT JOIN ${bt("initiative")} i ON p.initiative_id = i.initiative_id
    LEFT JOIN ${bt("task")} t ON t.plan_id = p.plan_id ${taskNotCanceled} ${dimJoin}
    WHERE 1=1 ${planWhere} ${planNotAbandoned} ${filterActive}
    GROUP BY p.plan_id, p.title, p.status, p.updated_at, p.initiative_id, i.title
    ORDER BY CASE WHEN p.status = 'draft' THEN 2 WHEN p.status = 'done' THEN 0 ELSE 1 END,
      CASE WHEN p.status = 'done' THEN p.updated_at END ASC,
      CASE WHEN p.status IN ('active','paused') THEN p.updated_at END DESC,
      p.title ASC
  `;

  return tableExists(config.doltRepoPath, "initiative").andThen(
    (initiativeExists) =>
      initiativeExists
        ? q.raw<ProjectRow>(projectsSqlWithInitiative)
        : q.raw<ProjectRow>(projectsSqlNoInitiative),
  );
}

/**
 * Fetch tasks table: one row per task with task id or hash, title, plan title, status, owner.
 * Reuses --plan, --domain, --skill, --change-type, --all. When --filter active: status IN (todo, doing, blocked).
 */
export function fetchTasksTableData(
  config: Config,
  options: StatusOptions,
  cache?: QueryCache,
): ResultAsync<TaskRow[], AppError> {
  const resolvedCache = cache ?? getStatusCache();
  const q = cachedQuery(config.doltRepoPath, resolvedCache, statusCacheTtlMs);
  const isUUID =
    options.plan &&
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      options.plan,
    );

  const planFilter = options.plan
    ? isUUID
      ? `AND p.${bt("plan_id")} = '${sqlEscape(options.plan)}'`
      : `AND p.${bt("title")} = '${sqlEscape(options.plan)}'`
    : "";

  const dimFilter =
    (options.domain
      ? ` AND EXISTS (SELECT 1 FROM ${bt("task_doc")} td WHERE td.task_id = t.task_id AND td.doc = '${sqlEscape(options.domain)}')`
      : "") +
    (options.skill
      ? ` AND EXISTS (SELECT 1 FROM ${bt("task_skill")} ts WHERE ts.task_id = t.task_id AND ts.skill = '${sqlEscape(options.skill)}')`
      : "") +
    (options.changeType
      ? ` AND t.${bt("change_type")} = '${sqlEscape(options.changeType)}'`
      : "");

  const excludeCanceledAbandoned = options.all
    ? ""
    : " AND t.status != 'canceled' AND p.status != 'abandoned' ";
  const filterActive =
    options.filter === "active"
      ? ` AND t.${bt("status")} IN ('todo', 'doing', 'blocked') `
      : "";

  const tasksSql = `
    SELECT t.task_id, t.hash_id, t.title, p.title AS plan_title, t.status, t.owner,
      (SELECT g.name FROM ${bt("gate")} g WHERE g.task_id = t.task_id AND g.status = 'pending' ORDER BY g.created_at ASC LIMIT 1) AS blocked_by_gate_name
    FROM ${bt("task")} t
    JOIN ${bt("project")} p ON t.plan_id = p.plan_id
    WHERE 1=1 ${planFilter} ${dimFilter} ${excludeCanceledAbandoned} ${filterActive}
    ORDER BY p.title ASC, t.created_at ASC
  `;

  return q.raw<TaskRow>(tasksSql);
}

/**
 * Fetch initiatives table: one row per initiative (initiative_id, title, status, cycle_start, cycle_end, project_count).
 * When --filter upcoming: status = 'draft' OR cycle_start > CURDATE(). Requires initiative table to exist.
 */
export function fetchInitiativesTableData(
  config: Config,
  options: StatusOptions,
  cache?: QueryCache,
): ResultAsync<InitiativeRow[], AppError> {
  const resolvedCache = cache ?? getStatusCache();
  const q = cachedQuery(config.doltRepoPath, resolvedCache, statusCacheTtlMs);
  const filterUpcoming =
    options.filter === "upcoming"
      ? ` AND (i.${bt("status")} = 'draft' OR i.${bt("cycle_start")} > CURDATE()) `
      : "";

  const initiativesSql = `
    SELECT i.initiative_id, i.title, i.status, c.name AS cycle_name, i.cycle_start, i.cycle_end,
      COUNT(p.plan_id) AS project_count
    FROM ${bt("initiative")} i
    LEFT JOIN ${bt("cycle")} c ON i.cycle_id = c.cycle_id
    LEFT JOIN ${bt("project")} p ON p.initiative_id = i.initiative_id
    WHERE 1=1 ${filterUpcoming}
    GROUP BY i.initiative_id, i.title, i.status, cycle_name, i.cycle_start, i.cycle_end
    ORDER BY i.cycle_start ASC, i.title ASC
  `;

  return q.raw<InitiativeRow>(initiativesSql);
}

export function statusCommand(program: Command) {
  program
    .command("status")
    .description(
      "Quick overview: plans count, tasks by status, next runnable tasks",
    )
    .option("--plan <planId>", "Filter by plan ID or title")
    .option("--domain <domain>", "Filter by task domain")
    .option("--skill <skill>", "Filter by task skill")
    .option(
      "--change-type <type>",
      "Filter by change type: create, modify, refactor, fix, investigate, test, document",
    )
    .option("--all", "Include canceled tasks and abandoned plans")
    .option(
      "--projects",
      "Show projects (plans) table: Plan, Initiative, Status, Todo, Blocked (not done), Doing, Done",
    )
    .option(
      "--tasks",
      "Show tasks table: Id, Title, Project, Status, Owner (reuses --plan, --domain, --skill, --filter active)",
    )
    .option(
      "--initiatives",
      "Show initiatives table (requires initiative table); stub message if missing",
    )
    .option(
      "--filter <filter>",
      "Filter: active (--projects or --tasks: plans not done/abandoned, or tasks todo/doing/blocked), upcoming (--initiatives)",
    )
    .option(
      "--dashboard",
      "Open status dashboard (live-updating TUI; 2s refresh, q or Ctrl+C to quit)",
    )
    .option(
      "--stale-threshold <hours>",
      "Hours threshold for stale doing-task warning (default: 2)",
      "2",
    )
    .action(async (options, cmd) => {
      const useLive = options.dashboard;
      const statusOptions: StatusOptions = {
        plan: options.plan,
        domain: options.domain,
        skill: options.skill,
        changeType: options.changeType,
        all: options.all,
        projects: options.projects,
        initiatives: options.initiatives,
        tasks: options.tasks,
        filter: options.filter,
        staleThreshold: Number.parseInt(options.staleThreshold, 10) || 2,
      };

      const viewCount = [
        options.tasks,
        options.projects,
        options.initiatives,
      ].filter(Boolean).length;
      if (viewCount > 1) {
        console.error(
          "tg status: only one of --tasks, --projects, or --initiatives is allowed.",
        );
        process.exit(1);
      }

      const viewMode: StatusViewMode = options.tasks
        ? "tasks"
        : options.initiatives
          ? "initiatives"
          : options.projects
            ? "projects"
            : "dashboard";
      statusOptions.view = viewMode;

      if (viewMode === "initiatives") {
        const configResult = await readConfig();
        if (configResult.isErr()) {
          console.error(configResult.error.message);
          process.exit(1);
        }
        const config = configResult.value;
        const existsResult = await tableExists(
          config.doltRepoPath,
          "initiative",
        );
        if (existsResult.isErr()) {
          console.error(existsResult.error.message);
          process.exit(1);
        }
        if (!existsResult.value) {
          if (!rootOpts(cmd).json) {
            console.log(INITIATIVES_STUB_MESSAGE);
          } else {
            console.log(
              JSON.stringify({
                stub: true,
                message: INITIATIVES_STUB_MESSAGE,
              }),
            );
          }
          process.exit(0);
        }
        if (!useLive) {
          const result = await fetchInitiativesTableData(config, statusOptions);
          result.match(
            (rows: InitiativeRow[]) => {
              if (!rootOpts(cmd).json) {
                const w = getTerminalWidth();
                console.log(`\n${formatInitiativesAsString(rows, w)}\n`);
              } else {
                console.log(JSON.stringify(rows, null, 2));
              }
            },
            (e: AppError) => {
              console.error(`Error fetching initiatives: ${e.message}`);
              if (rootOpts(cmd).json) {
                console.log(
                  JSON.stringify({
                    status: "error",
                    code: e.code,
                    message: e.message,
                    cause: e.cause,
                  }),
                );
              }
              process.exit(1);
            },
          );
          return;
        }
        if (rootOpts(cmd).json) {
          console.error("tg status --dashboard does not support --json");
          process.exit(1);
        }
        const { runOpenTUILiveInitiatives } =
          await import("./tui/live-opentui.js");
        try {
          await runOpenTUILiveInitiatives(config, statusOptions);
          return;
        } catch {
          // OpenTUI not available; use fallback live loop
        }
        const stdin = process.stdin;
        let timer: ReturnType<typeof setInterval>;
        const cleanup = () => {
          if (timer) clearInterval(timer);
          if (stdin.isTTY && stdin.setRawMode) stdin.setRawMode(false);
          process.exit(0);
        };
        process.on("SIGINT", cleanup);
        process.on("SIGTERM", cleanup);
        if (stdin.isTTY && stdin.setRawMode) {
          stdin.setRawMode(true);
          stdin.resume();
          stdin.on("data", (ch) => {
            if (ch.toString().toLowerCase() === "q") cleanup();
          });
        }
        const firstResult = await fetchInitiativesTableData(
          config,
          statusOptions,
        );
        firstResult.match(
          (rows: InitiativeRow[]) => {
            const w = getTerminalWidth();
            console.log(`\n${formatInitiativesAsString(rows, w)}\n`);
            timer = setInterval(async () => {
              const r = await readConfig().asyncAndThen((c: Config) =>
                fetchInitiativesTableData(c, statusOptions),
              );
              r.match(
                (data) => {
                  process.stdout.write("\x1b[2J\x1b[H");
                  console.log(
                    `\n${formatInitiativesAsString(data, getTerminalWidth())}\n`,
                  );
                },
                () => {},
              );
            }, 2000);
          },
          (e: AppError) => {
            console.error(e.message);
            process.exit(1);
          },
        );
        return;
      }

      if (viewMode === "tasks" && !useLive) {
        const result = await readConfig().asyncAndThen((config: Config) =>
          fetchTasksTableData(config, statusOptions).andThen((rows) =>
            fetchStaleDoingTasks(
              config.doltRepoPath,
              statusOptions.staleThreshold ?? 2,
            ).map((staleDoingTasks) => [rows, staleDoingTasks] as const),
          ),
        );
        result.match(
          ([rows, staleDoingTasks]) => {
            if (!rootOpts(cmd).json) {
              const w = getTerminalWidth();
              const staleIds = new Set(staleDoingTasks.map((t) => t.task_id));
              console.log(
                `\n${formatTasksAsString(rows, w, { staleTaskIds: staleIds })}\n`,
              );
            } else {
              console.log(JSON.stringify(rows, null, 2));
            }
          },
          (e: AppError) => {
            console.error(`Error fetching tasks: ${e.message}`);
            if (rootOpts(cmd).json) {
              console.log(
                JSON.stringify({
                  status: "error",
                  code: e.code,
                  message: e.message,
                  cause: e.cause,
                }),
              );
            }
            process.exit(1);
          },
        );
        return;
      }

      if (viewMode === "projects" && !useLive) {
        const result = await readConfig().asyncAndThen((config: Config) =>
          fetchProjectsTableData(config, statusOptions),
        );
        result.match(
          (rows: ProjectRow[]) => {
            if (!rootOpts(cmd).json) {
              const w = getTerminalWidth();
              console.log(`\n${formatProjectsAsString(rows, w)}\n`);
            } else {
              console.log(JSON.stringify(rows, null, 2));
            }
          },
          (e: AppError) => {
            console.error(`Error fetching projects: ${e.message}`);
            if (rootOpts(cmd).json) {
              console.log(
                JSON.stringify({
                  status: "error",
                  code: e.code,
                  message: e.message,
                  cause: e.cause,
                }),
              );
            }
            process.exit(1);
          },
        );
        return;
      }

      if (useLive) {
        if (rootOpts(cmd).json) {
          console.error("tg status --dashboard does not support --json");
          process.exit(1);
        }
        const configResult = await readConfig();
        if (configResult.isErr()) {
          console.error(configResult.error.message);
          process.exit(1);
        }
        const config = configResult.value;

        if (viewMode === "projects") {
          const { runOpenTUILiveProjects } =
            await import("./tui/live-opentui.js");
          try {
            await runOpenTUILiveProjects(config, statusOptions);
            return;
          } catch {
            // OpenTUI not available; use fallback live loop
          }
          const stdin = process.stdin;
          let timer: ReturnType<typeof setInterval>;
          const cleanup = () => {
            if (timer) clearInterval(timer);
            if (stdin.isTTY && stdin.setRawMode) stdin.setRawMode(false);
            process.exit(0);
          };
          process.on("SIGINT", cleanup);
          process.on("SIGTERM", cleanup);
          if (stdin.isTTY && stdin.setRawMode) {
            stdin.setRawMode(true);
            stdin.resume();
            stdin.on("data", (ch) => {
              if (ch.toString().toLowerCase() === "q") cleanup();
            });
          }
          const firstResult = await fetchProjectsTableData(
            config,
            statusOptions,
          );
          firstResult.match(
            (rows: ProjectRow[]) => {
              const w = getTerminalWidth();
              console.log(`\n${formatProjectsAsString(rows, w)}\n`);
              timer = setInterval(async () => {
                const r = await readConfig().asyncAndThen((c: Config) =>
                  fetchProjectsTableData(c, statusOptions),
                );
                r.match(
                  (data) => {
                    process.stdout.write("\x1b[2J\x1b[H");
                    console.log(
                      `\n${formatProjectsAsString(data, getTerminalWidth())}\n`,
                    );
                  },
                  () => {},
                );
              }, 2000);
            },
            (e: AppError) => {
              console.error(e.message);
              process.exit(1);
            },
          );
          return;
        }

        if (viewMode === "tasks") {
          const { runOpenTUILiveTasks } = await import("./tui/live-opentui.js");
          try {
            await runOpenTUILiveTasks(config, statusOptions);
            return;
          } catch {
            // OpenTUI not available; use fallback live loop
          }
          const stdin = process.stdin;
          let timer: ReturnType<typeof setInterval>;
          const cleanup = () => {
            if (timer) clearInterval(timer);
            if (stdin.isTTY && stdin.setRawMode) stdin.setRawMode(false);
            process.exit(0);
          };
          process.on("SIGINT", cleanup);
          process.on("SIGTERM", cleanup);
          if (stdin.isTTY && stdin.setRawMode) {
            stdin.setRawMode(true);
            stdin.resume();
            stdin.on("data", (ch) => {
              if (ch.toString().toLowerCase() === "q") cleanup();
            });
          }
          const firstResult = await readConfig().asyncAndThen((c: Config) =>
            fetchTasksTableData(c, statusOptions).andThen((rows) =>
              fetchStaleDoingTasks(
                c.doltRepoPath,
                statusOptions.staleThreshold ?? 2,
              ).map((staleDoingTasks) => [rows, staleDoingTasks] as const),
            ),
          );
          firstResult.match(
            ([rows, staleDoingTasks]) => {
              const w = getTerminalWidth();
              const staleIds = new Set(staleDoingTasks.map((t) => t.task_id));
              console.log(
                `\n${formatTasksAsString(rows, w, { staleTaskIds: staleIds })}\n`,
              );
              timer = setInterval(async () => {
                const r = await readConfig().asyncAndThen((c: Config) =>
                  fetchTasksTableData(c, statusOptions).andThen((data) =>
                    fetchStaleDoingTasks(
                      c.doltRepoPath,
                      statusOptions.staleThreshold ?? 2,
                    ).map((stale) => [data, stale] as const),
                  ),
                );
                r.match(
                  ([data, stale]) => {
                    process.stdout.write("\x1b[2J\x1b[H");
                    const ids = new Set(stale.map((t) => t.task_id));
                    console.log(
                      `\n${formatTasksAsString(data, getTerminalWidth(), { staleTaskIds: ids })}\n`,
                    );
                  },
                  () => {},
                );
              }, 2000);
            },
            (e: AppError) => {
              console.error(e.message);
              process.exit(1);
            },
          );
          return;
        }

        if (viewMode === "dashboard") {
          process.stderr.write(
            "tg status --dashboard is deprecated; use 'tg dashboard' instead.\n",
          );
        }
        const { runOpenTUILive } = await import("./tui/live-opentui.js");
        try {
          await runOpenTUILive(config, statusOptions);
          return;
        } catch {
          // OpenTUI not available (e.g. Node); use fallback live loop
        }

        const stdin = process.stdin;
        let timer: ReturnType<typeof setInterval>;
        const cleanup = () => {
          if (timer) clearInterval(timer);
          if (stdin.isTTY && stdin.setRawMode) stdin.setRawMode(false);
          process.exit(0);
        };
        process.on("SIGINT", cleanup);
        process.on("SIGTERM", cleanup);
        if (stdin.isTTY && stdin.setRawMode) {
          stdin.setRawMode(true);
          stdin.resume();
          stdin.on("data", (ch) => {
            if (ch.toString().toLowerCase() === "q") cleanup();
          });
        }
        const result = await fetchStatusData(config, statusOptions);
        result.match(
          (d: StatusData) => {
            printHumanStatus(d, { dashboard: true });
            timer = setInterval(async () => {
              const r = await readConfig().asyncAndThen((c: Config) =>
                fetchStatusData(c, statusOptions),
              );
              r.match(
                (data) => {
                  process.stdout.write("\x1b[2J\x1b[H");
                  printHumanStatus(data, { dashboard: true });
                },
                () => {},
              );
            }, 2000);
          },
          (e: AppError) => {
            console.error(e.message);
            process.exit(1);
          },
        );
        return;
      }

      const result = await readConfig().asyncAndThen((config: Config) =>
        fetchStatusData(config, statusOptions),
      );
      result.match(
        (data: unknown) => {
          const d = data as StatusData;
          if (!rootOpts(cmd).json) {
            printHumanStatus(d);
            console.log(
              "Tip: Run 'tg status --initiatives' or 'tg initiative list' to view initiative details.",
            );
          } else {
            printJsonStatus(d);
          }
        },
        (error: AppError) => {
          console.error(`Error fetching status: ${error.message}`);
          if (rootOpts(cmd).json) {
            console.log(
              JSON.stringify({
                status: "error",
                code: error.code,
                message: error.message,
                cause: error.cause,
              }),
            );
          }
          process.exit(1);
        },
      );
    });
}

function getCompletedSectionContent(d: StatusData): string {
  return (
    `  Plans: ${chalk.green(d.completedPlans)} done    ` +
    `Tasks: ${chalk.green(d.completedTasks)} done    ` +
    `Canceled: ${chalk.gray(d.canceledTasks)}`
  );
}

/** One-line footer for dashboard (legacy); prefer getDashboardFooterBox for dashboard UI. */
export function getDashboardFooterLine(d: StatusData): string {
  const activeAgents = d.statusCounts.doing ?? 0;
  return `Active agents: ${activeAgents}  Agents (defined): ${d.agentCount}  Sub-agents (defined): ${d.subAgentTypesDefined}  Total Agent Invocations: ${d.subAgentRuns}  Total Agent hours: ${d.totalAgentHours}  Investigator runs: ${d.investigatorRuns}  Investigator fix rate: ${d.investigatorFixRate}%`;
}

/** Min width per column in the footer grid so columns stay readable; allows up to 5 columns on wide screens. */
const FOOTER_COL_MIN = 20;
/** Number of columns for the footer grid (1–5 depending on width). */
function getFooterGridColumns(innerWidth: number): number {
  if (innerWidth >= FOOTER_COL_MIN * 5) return 5;
  if (innerWidth >= FOOTER_COL_MIN * 4) return 4;
  if (innerWidth >= FOOTER_COL_MIN * 3) return 3;
  if (innerWidth >= FOOTER_COL_MIN * 2) return 2;
  return 1;
}

/** Label style for Stats: bright, high contrast. */
const STATS_LABEL = chalk.yellow;

/**
 * Dashboard footer content as a borderless table so stats line up and use full width.
 * Includes Plans done, Tasks done, and Stale doing when > 0. Uses 1–5 columns.
 */
function getDashboardFooterContent(d: StatusData, innerWidth: number): string {
  const activeAgents = d.statusCounts.doing ?? 0;
  const bright = (s: string) => chalk.white(s);
  const pairs: [string, string][] = [
    ["Plans done", chalk.green(String(d.completedPlans))],
    ["Tasks done", chalk.green(String(d.completedTasks))],
    ["Active agents", bright(String(activeAgents))],
    ["Agents (defined)", bright(String(d.agentCount))],
    ["Sub-agents (defined)", bright(String(d.subAgentTypesDefined))],
    ["Total invocations", bright(String(d.subAgentRuns))],
    ["Agent hours", bright(String(d.totalAgentHours))],
    ["Investigator runs", bright(String(d.investigatorRuns))],
    ["Investigator fix rate", bright(`${d.investigatorFixRate}%`)],
  ];
  if (d.staleDoingTasks.length > 0) {
    pairs.push([
      "Stale doing (>2h)",
      chalk.yellow(String(d.staleDoingTasks.length)),
    ]);
  }
  const cols = getFooterGridColumns(innerWidth);
  const rows: string[][] = [];
  const emptyRow = (): string[] => Array.from({ length: cols }, () => "");
  for (let i = 0; i < pairs.length; i += cols) {
    if (rows.length > 0) rows.push(emptyRow());
    const rowPairs = pairs.slice(i, i + cols);
    const cells = rowPairs.map(
      ([label, value]) => STATS_LABEL(`${label}: `) + value,
    );
    while (cells.length < cols) cells.push("");
    rows.push(cells);
  }
  const headers = emptyRow();
  return renderTable({
    headers,
    rows,
    maxWidth: innerWidth,
    minWidths: Array(cols).fill(FOOTER_COL_MIN),
    flexColumnIndex: 0,
    borderVisible: false,
  });
}

/** Dashboard box padding: top/bottom 1 (combine with neighbours); left/right 2 (double, matches vertical total). */
const DASHBOARD_BOX_PADDING = { top: 1, bottom: 1, left: 2, right: 2 };

/**
 * Boxed dashboard footer with stats in a grid. Use this for tg dashboard and live views.
 * Uses DASHBOARD_BOX_PADDING so L/R match vertical gap; rows fill full width; tiny gap between KPI rows.
 */
export function getDashboardFooterBox(d: StatusData, width: number): string {
  const innerW = getBoxInnerWidthDashboard(width);
  const gridContent = getDashboardFooterContent(d, innerW);
  const content = chalk.yellow.bold("Stats") + "\n" + gridContent;
  return boxedSection("", content, width, {
    borderColor: "yellow",
    padding: DASHBOARD_BOX_PADDING,
    fullWidth: true,
  });
}

const NARROW_PLAN_WIDTH = 50;

/**
 * First line of a boxed section: the table/section name as a clear header row.
 * Use with boxedSection("", this + "\n" + tableContent, w) so the name is inside the box.
 */
function formatSectionTitleRow(sectionName: string): string {
  return chalk.cyan.bold("  " + sectionName);
}

/** Reserve lines for box borders, section titles, completed summary. */
const DASHBOARD_RESERVED_LINES = 12;

/**
 * Max data rows per dashboard table from terminal height. Plans get ~40%, tasks ~60%.
 * Ensures no scrolling on small terminals.
 */
export function getDashboardRowLimits(terminalRows: number): {
  maxPlanRows: number;
  maxTaskRows: number;
} {
  const dataLines = Math.max(4, terminalRows - DASHBOARD_RESERVED_LINES);
  return {
    maxPlanRows: Math.max(2, Math.floor(dataLines * 0.4)),
    maxTaskRows: Math.max(2, Math.floor(dataLines * 0.6)),
  };
}

function getActivePlansSectionContent(
  d: StatusData,
  w: number,
  maxRows?: number,
  innerWidthOverride?: number,
): string {
  if (d.activePlans.length === 0) return "";
  const innerW = innerWidthOverride ?? getBoxInnerWidth(w);
  const narrow = innerW < NARROW_PLAN_WIDTH;
  let plans = d.activePlans;
  if (maxRows != null && maxRows > 0) {
    plans = plans.slice(0, maxRows - 1);
  }
  const planRows = plans.map((p) => [
    p.title,
    p.initiative_title ?? "—",
    String(p.todo),
    p.blocked > 0 ? chalk.red(String(p.blocked)) : "0",
    p.actionable > 0 ? chalk.greenBright(String(p.actionable)) : "0",
    p.doing > 0 ? chalk.cyan(String(p.doing)) : "0",
    p.done > 0 ? chalk.green(String(p.done)) : "0",
  ]);
  const sumTodo = d.activePlans.reduce((s, p) => s + Number(p.todo), 0);
  const sumDoing = d.activePlans.reduce((s, p) => s + Number(p.doing), 0);
  const sumBlocked = d.activePlans.reduce((s, p) => s + Number(p.blocked), 0);
  const sumDone = d.activePlans.reduce((s, p) => s + Number(p.done), 0);
  const sumReady = d.activePlans.reduce((s, p) => s + Number(p.actionable), 0);
  const totalTasks = sumTodo + sumBlocked + sumReady;
  const aggRow = [
    chalk.dim("Total"),
    chalk.dim(`Total Outstanding Tasks: ${totalTasks}`),
    String(sumTodo),
    sumBlocked > 0 ? chalk.red(String(sumBlocked)) : "0",
    sumReady > 0 ? chalk.greenBright(String(sumReady)) : "0",
    sumDoing > 0 ? chalk.cyan(String(sumDoing)) : "0",
    sumDone > 0 ? chalk.green(String(sumDone)) : "0",
  ];
  const headers = narrow
    ? ["Project name", "Init", "To", "Blk", "Rdy", "Do", "Done"]
    : [
        "Project name",
        "Initiative",
        "Todo",
        "Blocked",
        "Ready",
        "Doing",
        "Done",
      ];
  const numericHeaders = headers.slice(2);
  const numericColW = Math.max(...numericHeaders.map((h) => h.length));
  return renderTable({
    headers,
    rows: [...planRows, aggRow],
    maxWidth: innerW,
    minWidths: narrow
      ? [8, 10, numericColW, numericColW, numericColW, numericColW, numericColW]
      : [
          12,
          10,
          numericColW,
          numericColW,
          numericColW,
          numericColW,
          numericColW,
        ],
    maxWidths: [
      undefined,
      undefined,
      numericColW,
      numericColW,
      numericColW,
      numericColW,
      numericColW,
    ],
  });
}

/** displayId: hash_id if set, else first 8 chars of task_id so we never show full UUID in this table. */
function displayId(taskId: string, hashId: string | null): string {
  return hashId ?? taskId.slice(0, 8);
}

const PLAN_TITLE_MAX_LEN = 18;

/** Status string for display: "blocked (gate: <name>)" when blocked by a gate, else raw status. */
function displayStatus(
  status: string,
  blockedByGateName?: string | null,
): string {
  if (status === "blocked" && blockedByGateName) {
    return `blocked (gate: ${blockedByGateName})`;
  }
  return status;
}

/** Status-only icon (no stale): used when Stale has its own column. */
function statusIconOnly(status: string, isRecentlyDone: boolean): string {
  if (isRecentlyDone || status === "done") return chalk.green("✓");
  if (status === "blocked") return chalk.red("●");
  return chalk.green("●");
}

function truncatePlan(s: string): string {
  if (s.length <= PLAN_TITLE_MAX_LEN) return s;
  return `${s.slice(0, PLAN_TITLE_MAX_LEN - 1)}…`;
}

/**
 * Single merged section: active work (doing) first, then next runnable (todo).
 * Table headers: Id, Task, Project, Stale, Status, Agent. Id is thin (max 10); Task is flex; Project truncated.
 * Stale column: yellow ▲ for doing tasks started >2h ago; yellow ▲ for todo tasks unchanged >2h.
 * When maxRows is set (dashboard), slice to that many rows so the screen does not scroll.
 */
function getMergedActiveNextContent(
  d: StatusData,
  w: number,
  maxRows?: number,
  innerWidthOverride?: number,
): string {
  const innerW = innerWidthOverride ?? getBoxInnerWidth(w);
  const staleDoingSet = new Set(d.staleDoingTasks.map((t) => t.task_id));
  const now = Date.now();
  const doingRows = d.activeWork.map((work) => {
    const body =
      work.body == null
        ? null
        : typeof work.body === "string"
          ? (JSON.parse(work.body) as { agent?: string })
          : (work.body as { agent?: string });
    const agent = body?.agent ?? "—";
    const isStale = staleDoingSet.has(work.task_id);
    return [
      displayId(work.task_id, work.hash_id),
      work.title,
      truncatePlan(work.plan_title),
      isStale ? chalk.yellow("▲") : "—",
      "doing",
      agent,
    ];
  });
  const todoRows = d.nextTasks.map((t) => {
    const staleRunnable =
      t.updated_at != null &&
      now - new Date(t.updated_at).getTime() >= STALE_HOURS_MS;
    return [
      displayId(t.task_id, t.hash_id),
      t.title,
      truncatePlan(t.plan_title),
      staleRunnable ? chalk.yellow("▲") : "—",
      "todo",
      "—",
    ];
  });
  let rows = [...doingRows, ...todoRows];
  if (maxRows != null && maxRows > 0) rows = rows.slice(0, maxRows);
  const tableRows =
    rows.length > 0
      ? rows
      : [["—", "No active or runnable tasks", "—", "—", "—", "—"]];
  return renderTable({
    headers: ["Id", "Task", "Project", "Stale", "Status", "Agent"],
    rows: tableRows,
    maxWidth: innerW,
    minWidths: [10, 15, 9, 1, 6, 12],
    flexColumnIndex: 1,
    maxWidths: [10, undefined, undefined, 1],
  });
}

/**
 * Format projects table as a single string (boxed). Used for one-shot and live projects view.
 * Includes Initiative column when initiative_title is present on rows.
 */
export function formatProjectsAsString(
  rows: ProjectRow[],
  width: number,
): string {
  const w = width;
  const innerW = getBoxInnerWidth(w);
  const projectRows = rows.map((p) => [
    p.title,
    p.initiative_title ?? "—",
    p.status,
    String(p.todo),
    p.blocked > 0 ? chalk.red(String(p.blocked)) : "0",
    p.doing > 0 ? chalk.cyan(String(p.doing)) : "0",
    p.done > 0 ? chalk.green(String(p.done)) : "0",
  ]);
  const table = renderTable({
    headers: [
      "Project name",
      "Initiative",
      "Status",
      "Todo",
      "Blocked",
      "Doing",
      "Done",
    ],
    rows:
      projectRows.length > 0
        ? projectRows
        : [["No projects", "—", "—", "0", "0", "0", "0"]],
    maxWidth: innerW,
    minWidths: [12, 10, 8, 4, 5, 3, 3],
    maxWidths: [undefined, 10, undefined, undefined, 7, 5, 4],
  });
  return boxedSection("Projects", table, w);
}

/**
 * Format tasks table as a single string (boxed). Used for one-shot and live tasks view.
 * When staleTaskIds is provided, adds Stale column (⚠ or —) and Status as icon (last column).
 */
export function formatTasksAsString(
  rows: TaskRow[],
  width: number,
  options?: { staleTaskIds?: Set<string> },
): string {
  const w = width;
  const innerW = getBoxInnerWidth(w);
  const staleSet = options?.staleTaskIds;
  const withStale = staleSet !== undefined;
  const taskRows = withStale
    ? rows.map((r) => {
        const isStale = staleSet?.has(r.task_id);
        return [
          displayId(r.task_id, r.hash_id),
          r.title,
          r.plan_title,
          isStale ? chalk.yellow("⚠") : "—",
          r.owner ?? "—",
          statusIconOnly(r.status, false),
        ];
      })
    : rows.map((r) => {
        const id = r.hash_id ?? r.task_id;
        const status = displayStatus(r.status, r.blocked_by_gate_name);
        return [id, r.title, r.plan_title, status, r.owner ?? "—"];
      });

  const headers = withStale
    ? ["Id", "Title", "Project", "Stale", "Owner", "Status"]
    : ["Id", "Title", "Project", "Status", "Owner"];
  const emptyRow = withStale
    ? [["—", "No tasks", "—", "—", "—", "—"]]
    : [["—", "No tasks", "—", "—", "—"]];
  const table = renderTable({
    headers,
    rows: taskRows.length > 0 ? taskRows : emptyRow,
    maxWidth: innerW,
    minWidths: withStale ? [10, 12, 12, 1, 6, 1] : [10, 12, 12, 8, 6],
    flexColumnIndex: 1,
    maxWidths: withStale ? [10, undefined, 12, 1, 6, 1] : [10],
  });
  return boxedSection("Tasks", table, w);
}

const RECENTLY_DONE_TASK_MS = 15 * 1000;
const STALE_HOURS_MS = 2 * 60 * 60 * 1000;

/**
 * Format dashboard tasks view: three boxed sections — Active tasks, Next 7 runnable, Last 7 completed.
 * Used by tg dashboard --tasks (live and fallback).
 * Active and Next 7 tables include a Stale column: yellow ▲ when task has been in that section ≥2h.
 * Active also shows status (red ● blocked, green ● ok, green ✓ done).
 * Tasks that just became done appear in Active for 15s with a green tick before moving to Last 7.
 */
export function formatDashboardTasksView(
  d: StatusData,
  activeTaskRows: TaskRow[],
  width: number,
): string {
  const w = width;
  const innerW = getBoxInnerWidth(w);
  const parts: string[] = [];
  const staleSet = new Set(d.staleDoingTasks.map((t) => t.task_id));
  const now = Date.now();
  const recentlyDone = d.last7CompletedTasks.filter((t) => {
    if (t.updated_at == null) return false;
    const ago = now - new Date(t.updated_at).getTime();
    return ago >= 0 && ago <= RECENTLY_DONE_TASK_MS;
  });

  const activeRowsFromActive = activeTaskRows.map((r) => {
    const isStale = staleSet.has(r.task_id);
    return [
      displayId(r.task_id, r.hash_id),
      r.title,
      r.plan_title,
      isStale ? chalk.yellow("▲") : "—",
      r.owner ?? "—",
      statusIconOnly(r.status, false),
    ];
  });
  const recentlyDoneRows = recentlyDone.map((t) => [
    displayId(t.task_id, t.hash_id),
    t.title,
    t.plan_title,
    "—",
    "—",
    chalk.green("✓"),
  ]);
  const activeRows =
    activeRowsFromActive.length > 0 || recentlyDoneRows.length > 0
      ? [...activeRowsFromActive, ...recentlyDoneRows]
      : [["—", "No active tasks", "—", "—", "—", "—"]];
  const activeTable = renderTable({
    headers: ["Id", "Title", "Project", "Stale", "Owner", "Status"],
    rows: activeRows,
    maxWidth: innerW,
    minWidths: [10, 12, 10, 1, 6, 1],
    flexColumnIndex: 1,
    maxWidths: [10, undefined, 10, 1, 6, 1],
  });
  parts.push(boxedSection("Active tasks", activeTable, w, { fullWidth: true }));

  const next7Rows =
    d.next7RunnableTasks.length > 0
      ? d.next7RunnableTasks.map((t) => {
          const staleRunnable =
            t.updated_at != null &&
            now - new Date(t.updated_at).getTime() >= STALE_HOURS_MS;
          return [
            chalk.green("●"),
            t.hash_id ?? t.task_id,
            t.title,
            t.plan_title,
            staleRunnable ? chalk.yellow("▲") : "—",
          ];
        })
      : [["—", "No runnable tasks", "—", "—", "—"]];
  const next7Table = renderTable({
    headers: ["", "Id", "Task", "Project", "Stale"],
    rows: next7Rows,
    maxWidth: innerW,
    minWidths: [1, 10, 12, 10, 1],
    flexColumnIndex: 2,
    maxWidths: [1, 10, undefined, undefined, 1],
  });
  parts.push(boxedSection("Next 7 runnable", next7Table, w));

  const last7Rows =
    d.last7CompletedTasks.length > 0
      ? d.last7CompletedTasks.map((t) => [
          chalk.green("✓"),
          t.hash_id ?? t.task_id,
          t.title,
          t.plan_title,
          t.updated_at ?? "—",
        ])
      : [["—", "No completed tasks", "—", "—", "—"]];
  const last7Table = renderTable({
    headers: ["", "Id", "Task", "Project", "Updated"],
    rows: last7Rows,
    maxWidth: innerW,
    minWidths: [1, 10, 12, 10, 16],
    flexColumnIndex: 2,
    maxWidths: [1, 10],
  });
  parts.push(boxedSection("Last 7 completed", last7Table, w));

  return parts.join("\n\n");
}

/**
 * Format dashboard projects view: three boxed sections — Active plans, Next 7 upcoming, Last 7 completed.
 * Used by tg dashboard --projects (live and fallback). Uses StatusData.activePlans, next7UpcomingPlans, last7CompletedPlans.
 */
export function formatDashboardProjectsView(
  d: StatusData,
  width: number,
): string {
  const w = width;
  const innerW = getBoxInnerWidth(w);
  const parts: string[] = [];

  const activePlanRows =
    d.activePlans.length > 0
      ? d.activePlans.map((p) => [
          p.title,
          p.initiative_title ?? "—",
          String(p.todo),
          p.blocked > 0 ? chalk.red(String(p.blocked)) : "0",
          p.actionable > 0 ? chalk.greenBright(String(p.actionable)) : "0",
          p.doing > 0 ? chalk.cyan(String(p.doing)) : "0",
          p.done > 0 ? chalk.green(String(p.done)) : "0",
        ])
      : [["No active plans", "—", "0", "0", "0", "0", "0"]];
  const sumTodo = d.activePlans.reduce((s, p) => s + Number(p.todo), 0);
  const sumDoing = d.activePlans.reduce((s, p) => s + Number(p.doing), 0);
  const sumBlocked = d.activePlans.reduce((s, p) => s + Number(p.blocked), 0);
  const sumDone = d.activePlans.reduce((s, p) => s + Number(p.done), 0);
  const sumReady = d.activePlans.reduce((s, p) => s + Number(p.actionable), 0);
  const totalTasks = sumTodo + sumBlocked + sumReady;
  const totalRow = [
    chalk.dim("Total"),
    chalk.dim(`Total Outstanding Tasks: ${totalTasks}`),
    String(sumTodo),
    sumBlocked > 0 ? chalk.red(String(sumBlocked)) : "0",
    sumReady > 0 ? chalk.greenBright(String(sumReady)) : "0",
    sumDoing > 0 ? chalk.cyan(String(sumDoing)) : "0",
    sumDone > 0 ? chalk.green(String(sumDone)) : "0",
  ];
  const activeRows =
    d.activePlans.length > 0 ? [...activePlanRows, totalRow] : activePlanRows;
  const planHeaders = [
    "Project name",
    "Initiative",
    "Todo",
    "Blocked",
    "Ready",
    "Doing",
    "Done",
  ];
  const numericColW = Math.max(...planHeaders.slice(2).map((h) => h.length));
  const activeTable = renderTable({
    headers: planHeaders,
    rows: activeRows,
    maxWidth: innerW,
    minWidths: [
      12,
      10,
      numericColW,
      numericColW,
      numericColW,
      numericColW,
      numericColW,
    ],
    maxWidths: [
      undefined,
      10,
      numericColW,
      numericColW,
      numericColW,
      numericColW,
      numericColW,
    ],
  });
  parts.push(boxedSection("Active plans", activeTable, w, { fullWidth: true }));

  const next7Rows =
    d.next7UpcomingPlans.length > 0
      ? d.next7UpcomingPlans.map((p) => [
          p.title,
          p.initiative_title ?? "—",
          p.status,
          p.updated_at ?? "—",
        ])
      : [["No upcoming plans", "—", "—", "—"]];
  const next7Table = renderTable({
    headers: ["Project name", "Initiative", "Status", "Updated"],
    rows: next7Rows,
    maxWidth: innerW,
    minWidths: [12, 10, 8, 16],
  });
  parts.push(
    boxedSection("Next 7 upcoming", next7Table, w, { fullWidth: true }),
  );

  const DONE_VISIBLE_MS = 2 * 60 * 1000;
  const now = Date.now();
  const last7Rows =
    d.last7CompletedPlans.length > 0
      ? d.last7CompletedPlans.map((p) => {
          const completedAgo =
            p.updated_at != null
              ? now - new Date(p.updated_at).getTime()
              : Infinity;
          const justDone = completedAgo >= 0 && completedAgo <= DONE_VISIBLE_MS;
          return [
            justDone ? chalk.green("✓") : "—",
            p.title,
            p.initiative_title ?? "—",
            p.status,
            p.updated_at ?? "—",
          ];
        })
      : [["—", "No completed plans", "—", "—", "—"]];
  const last7Table = renderTable({
    headers: ["", "Project name", "Initiative", "Status", "Updated"],
    rows: last7Rows,
    maxWidth: innerW,
    minWidths: [1, 12, 10, 8, 16],
    maxWidths: [1],
  });
  parts.push(
    boxedSection("Last 7 completed", last7Table, w, { fullWidth: true }),
  );

  return parts.join("\n\n");
}

/**
 * Format initiatives table as a single string (boxed). Used for one-shot and live initiatives view.
 */
export function formatInitiativesAsString(
  rows: InitiativeRow[],
  width: number,
): string {
  const w = width;
  const innerW = getBoxInnerWidth(w);
  const initiativeRows = rows.map((r) => [
    r.title,
    r.status,
    r.cycle_name ?? "—",
    r.cycle_start ?? "—",
    r.cycle_end ?? "—",
    String(r.project_count),
  ]);
  const table = renderTable({
    headers: [
      "Initiative",
      "Status",
      "Cycle",
      "Cycle Start",
      "Cycle End",
      "Projects",
    ],
    rows:
      initiativeRows.length > 0
        ? initiativeRows
        : [["No initiatives", "—", "—", "—", "0"]],
    maxWidth: innerW,
    minWidths: [12, 8, 12, 10, 8],
  });
  return boxedSection("Initiatives", table, w);
}

export interface FormatStatusOptions {
  /** When true, show only two stacked tables (Active Projects, Active tasks and upcoming) plus one-line summary (for tg dashboard). */
  dashboard?: boolean;
  /** When true, format three sections: Active tasks, Next 7 runnable, Last 7 completed (for tg dashboard --tasks). */
  tasksView?: boolean;
}

/**
 * Format status as a single string (with section headers). Used by OpenTUI live view
 * and for consistent section content. When dashboard is true, outputs only two stacked
 * tables with row limits so the screen does not scroll.
 */
export function formatStatusAsString(
  d: StatusData,
  width: number,
  options?: FormatStatusOptions,
): string {
  const w = width;
  const parts: string[] = [];
  const dashboard = options?.dashboard === true;

  if (!dashboard) {
    parts.push("Completed");
    parts.push(getCompletedSectionContent(d));
  }

  if (dashboard) {
    const totalTasks =
      (d.statusCounts.todo ?? 0) +
      (d.statusCounts.blocked ?? 0) +
      (d.actionableCount ?? 0);
    if (d.currentCycle) {
      const c = d.currentCycle;
      const startShort = c.start_date.slice(0, 10);
      const endShort = c.end_date.slice(0, 10);
      parts.push(
        chalk.cyan(
          `◆ Cycle: ${c.name}  (${startShort} – ${endShort})  │  ${c.initiative_count} initiatives  │  Total Outstanding Tasks: ${totalTasks}`,
        ),
      );
    } else {
      parts.push(chalk.dim(`Total Outstanding Tasks: ${totalTasks}`));
    }
    const height = getTerminalHeight();
    const { maxPlanRows, maxTaskRows } = getDashboardRowLimits(height);
    const innerW = getBoxInnerWidthDashboard(w);
    const activePlansContent = getActivePlansSectionContent(
      d,
      w,
      maxPlanRows,
      innerW,
    );
    const tasksContent = getMergedActiveNextContent(d, w, maxTaskRows, innerW);
    if (activePlansContent) {
      parts.push(
        boxedSection(
          "",
          formatSectionTitleRow("Active Projects") + "\n" + activePlansContent,
          w,
          {
            borderColor: "cyan",
            fullWidth: true,
            padding: DASHBOARD_BOX_PADDING,
          },
        ),
      );
    }
    parts.push(
      boxedSection(
        "",
        formatSectionTitleRow("Active tasks and upcoming") +
          "\n" +
          tasksContent,
        w,
        {
          borderColor: "cyan",
          fullWidth: true,
          padding: DASHBOARD_BOX_PADDING,
        },
      ),
    );
    parts.push(getDashboardFooterBox(d, w));
    return parts.join("\n");
  }

  const activePlans = getActivePlansSectionContent(d, w);
  if (activePlans) {
    parts.push("Active Plans");
    parts.push(activePlans);
  }
  if (d.staleDoingTasks.length > 0) {
    parts.push(chalk.yellow("⚠  Stale Doing Tasks (>2h)"));
    parts.push(getStaleDoingTasksContent(d.staleDoingTasks, w));
  }
  parts.push("Active & next");
  parts.push(getMergedActiveNextContent(d, w));
  return parts.join("\n\n");
}

function formatAgeHours(ageHours: number): string {
  const h = Math.floor(ageHours);
  return `${h}h`;
}

function getStaleDoingTasksContent(
  tasks: StaleDoingTaskRow[],
  w: number,
): string {
  const innerW = getBoxInnerWidth(w);
  const narrow = innerW < 45;
  const rows = tasks.map((t) => [
    (t.hash_id ?? "—").slice(0, narrow ? 8 : 10),
    t.title,
    (t.owner ?? "—").slice(0, narrow ? 6 : 12),
    formatAgeHours(t.age_hours),
  ]);
  return renderTable({
    headers: ["Id", "Title", "Owner", "Age"],
    rows,
    maxWidth: innerW,
    minWidths: narrow ? [8, 10, 6, 3] : [10, 16, 8, 6],
    flexColumnIndex: 1,
    maxWidths: narrow ? [8, undefined, 6, 4] : [10],
  });
}

const SIDE_BY_SIDE_GAP = 2;

/**
 * Render two boxed sections side by side to reduce vertical height.
 * Each box is given half of the terminal width (minus gap). Lines are merged with left padded to max left width.
 */
function _renderSideBySideBoxes(
  leftTitle: string,
  leftContent: string,
  rightTitle: string,
  rightContent: string,
  totalWidth: number,
): string {
  const halfW = Math.max(24, Math.floor((totalWidth - SIDE_BY_SIDE_GAP) / 2));
  const leftBox = boxedSection(leftTitle, leftContent, halfW);
  const rightBox = boxedSection(rightTitle, rightContent, halfW);
  const leftLines = leftBox.split("\n");
  const rightLines = rightBox.split("\n");
  const maxLeftLen = Math.max(...leftLines.map((l) => l.length), halfW);
  const gap = " ".repeat(SIDE_BY_SIDE_GAP);
  const merged: string[] = [];
  const maxRows = Math.max(leftLines.length, rightLines.length);
  for (let i = 0; i < maxRows; i++) {
    const left = (leftLines[i] ?? "").padEnd(maxLeftLen);
    const right = rightLines[i] ?? "";
    merged.push(left + gap + right);
  }
  return merged.join("\n");
}

function printHumanStatus(
  d: StatusData,
  options?: { dashboard?: boolean },
): void {
  const w = getTerminalWidth();
  const dashboard = options?.dashboard === true;

  const totalTasks =
    (d.statusCounts.todo ?? 0) +
    (d.statusCounts.blocked ?? 0) +
    (d.actionableCount ?? 0);
  if (dashboard && d.currentCycle) {
    const c = d.currentCycle;
    const startShort = c.start_date.slice(0, 10);
    const endShort = c.end_date.slice(0, 10);
    const line = chalk.cyan(
      `◆ Cycle: ${c.name}  (${startShort} – ${endShort})  │  ${c.initiative_count} initiatives  │  Total Outstanding Tasks: ${totalTasks}`,
    );
    console.log(`\n  ${line}\n`);
  } else if (dashboard) {
    console.log(`\n  ${chalk.dim(`Total Outstanding Tasks: ${totalTasks}`)}\n`);
  }

  if (dashboard) {
    const height = getTerminalHeight();
    const { maxPlanRows, maxTaskRows } = getDashboardRowLimits(height);
    const innerW = getBoxInnerWidthDashboard(w);
    const activePlansContent = getActivePlansSectionContent(
      d,
      w,
      maxPlanRows,
      innerW,
    );
    const tasksContent = getMergedActiveNextContent(d, w, maxTaskRows, innerW);
    if (activePlansContent) {
      const plansBox = boxedSection(
        "",
        formatSectionTitleRow("Active Projects") + "\n" + activePlansContent,
        w,
        {
          borderColor: "cyan",
          fullWidth: true,
          padding: DASHBOARD_BOX_PADDING,
        },
      );
      console.log(`\n${plansBox}`);
    }
    const tasksBox = boxedSection(
      "",
      formatSectionTitleRow("Active tasks and upcoming") + "\n" + tasksContent,
      w,
      {
        borderColor: "cyan",
        fullWidth: true,
        padding: DASHBOARD_BOX_PADDING,
      },
    );
    console.log(`${tasksBox}`);
    console.log(`${getDashboardFooterBox(d, w)}\n`);
    return;
  }

  if (!dashboard) {
    console.log(
      `\n${boxedSection("Completed", getCompletedSectionContent(d), w)}`,
    );
  }

  const activePlansContent = getActivePlansSectionContent(d, w);
  if (activePlansContent) {
    console.log(`\n${boxedSection("Active Plans", activePlansContent, w)}`);
  }
  if (d.staleDoingTasks.length > 0) {
    const staleTitle = chalk.yellow("⚠  Stale Doing Tasks (>2h)");
    const staleContent = getStaleDoingTasksContent(d.staleDoingTasks, w);
    console.log(`\n${boxedSection(staleTitle, staleContent, w)}`);
  }
  console.log(
    `\n${boxedSection("Active & next", getMergedActiveNextContent(d, w), w)}`,
  );
  console.log("");
}

function printJsonStatus(d: StatusData): void {
  const todo = d.statusCounts.todo ?? 0;
  const doing = d.statusCounts.doing ?? 0;
  const blocked = d.statusCounts.blocked ?? 0;
  console.log(
    JSON.stringify(
      {
        completedPlans: d.completedPlans,
        completedTasks: d.completedTasks,
        canceledTasks: d.canceledTasks,
        activePlans: d.activePlans,
        staleTasks: d.staleTasks,
        stale_tasks: d.staleDoingTasks,
        plansCount: d.plansCount,
        statusCounts: d.statusCounts,
        actionableCount: d.actionableCount,
        nextTasks: d.nextTasks,
        next7RunnableTasks: d.next7RunnableTasks,
        last7CompletedTasks: d.last7CompletedTasks,
        next7UpcomingPlans: d.next7UpcomingPlans,
        last7CompletedPlans: d.last7CompletedPlans,
        activeWork: d.activeWork,
        agentCount: d.agentCount,
        subAgentTypesDefined: d.subAgentTypesDefined,
        subAgentRuns: d.subAgentRuns,
        totalAgentHours: d.totalAgentHours,
        investigatorRuns: d.investigatorRuns,
        investigatorFixRate: d.investigatorFixRate,
        summary: {
          not_done: todo + doing + blocked,
          in_progress: doing,
          blocked,
          actionable: d.actionableCount,
        },
      },
      null,
      2,
    ),
  );
}
