import { Command } from "commander";
import { readConfig, Config, rootOpts } from "./utils";
import { ResultAsync } from "neverthrow";
import { AppError } from "../domain/errors";
import { query } from "../db/query";
import { sqlEscape } from "../db/escape";

function backtickWrap(name: string): string {
  return `\`${name}\``;
}

export function statusCommand(program: Command) {
  program
    .command("status")
    .description(
      "Quick overview: plans count, tasks by status, next runnable tasks",
    )
    .option("--plan <planId>", "Filter by plan ID or title")
    .action(async (options, cmd) => {
      const result = await readConfig().asyncAndThen((config: Config) => {
        const q = query(config.doltRepoPath);

        const isUUID =
          options.plan &&
          /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
            options.plan,
          );

        let planWhere = "";
        if (options.plan) {
          if (isUUID) {
            planWhere = `WHERE ${backtickWrap("plan_id")} = '${sqlEscape(options.plan)}'`;
          } else {
            planWhere = `WHERE ${backtickWrap("title")} = '${sqlEscape(options.plan)}'`;
          }
        }

        const plansCountSql = `SELECT COUNT(*) AS count FROM \`plan\` ${planWhere}`;
        const planFilter = options.plan
          ? isUUID
            ? `WHERE p.plan_id = '${sqlEscape(options.plan)}'`
            : `WHERE p.title = '${sqlEscape(options.plan)}'`
          : "";
        const statusCountsSql = `SELECT t.status, COUNT(*) AS count FROM \`task\` t JOIN \`plan\` p ON t.plan_id = p.plan_id ${planFilter} GROUP BY t.status`;
        const nextSql = `
          SELECT t.task_id, t.title, p.title as plan_title
          FROM \`task\` t
          JOIN \`plan\` p ON t.plan_id = p.plan_id
          WHERE t.status = 'todo'
          AND (SELECT COUNT(*) FROM \`edge\` e
               JOIN \`task\` bt ON e.from_task_id = bt.task_id
               WHERE e.to_task_id = t.task_id AND e.type = 'blocks'
               AND bt.status NOT IN ('done','canceled')) = 0
          ${options.plan ? (isUUID ? `AND p.plan_id = '${sqlEscape(options.plan)}'` : `AND p.title = '${sqlEscape(options.plan)}'`) : ""}
          ORDER BY p.priority DESC, t.created_at ASC
          LIMIT 2
        `;

        return q.raw<{ count: number }>(plansCountSql).andThen((plansRes) => {
          const plansCount = plansRes[0]?.count ?? 0;
          return q
            .raw<{ status: string; count: number }>(statusCountsSql)
            .andThen((statusRows) => {
              const statusCounts: Record<string, number> = {};
              statusRows.forEach((r) => {
                statusCounts[r.status] = r.count;
              });
              return q
                .raw<{
                  task_id: string;
                  title: string;
                  plan_title: string;
                }>(nextSql)
                .map((nextTasks) => ({
                  plansCount,
                  statusCounts,
                  nextTasks,
                }));
            });
        });
      });

      result.match(
        (data: unknown) => {
          const d = data as {
            plansCount: number;
            statusCounts: Record<string, number>;
            nextTasks: Array<{
              task_id: string;
              title: string;
              plan_title: string;
            }>;
          };
          if (!rootOpts(cmd).json) {
            console.log(`Plans: ${d.plansCount}`);
            const statusOrder = [
              "todo",
              "doing",
              "blocked",
              "done",
              "canceled",
            ];
            statusOrder.forEach((s) => {
              const count = d.statusCounts[s] ?? 0;
              if (count > 0) console.log(`  ${s}: ${count}`);
            });
            if (d.nextTasks.length > 0) {
              console.log("Next runnable:");
              d.nextTasks.forEach((t) => {
                console.log(`  ${t.task_id}  ${t.title} (${t.plan_title})`);
              });
            }
          } else {
            console.log(JSON.stringify(d, null, 2));
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
