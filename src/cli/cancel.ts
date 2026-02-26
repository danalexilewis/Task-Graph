import { Command } from "commander";
import { v4 as uuidv4 } from "uuid";
import { doltCommit } from "../db/commit";
import { readConfig, Config } from "./utils";
import { checkValidTransition } from "../domain/invariants";
import { TaskStatus } from "../domain/types";
import { ResultAsync } from "neverthrow";
import { AppError, buildError, ErrorCode } from "../domain/errors";
import { query, now, jsonObj } from "../db/query";

type PlanRow = { plan_id: string; status: string };
type TaskRow = { task_id: string; status: TaskStatus };

export function cancelCommand(program: Command) {
  program
    .command("cancel")
    .description("Soft-delete a plan (abandoned) or task (canceled)")
    .argument("<id>", "Plan ID, plan title, or task ID")
    .option("--type <type>", "Resolve as plan or task (default: auto-detect)", "auto")
    .option("--reason <reason>", "Reason for canceling")
    .action(async (id, options, cmd) => {
      const result = await readConfig().asyncAndThen((config: Config) => {
        const currentTimestamp = now();
        const q = query(config.doltRepoPath);

        return ResultAsync.fromPromise(
          (async () => {
            const typeHint = options.type === "plan" || options.type === "task" ? options.type : "auto";

            const tryCancelPlan = async (plan: PlanRow) => {
              if (plan.status === "done" || plan.status === "abandoned") {
                throw buildError(
                  ErrorCode.INVALID_TRANSITION,
                  `Plan is in terminal state '${plan.status}'. Refusing to cancel.`,
                );
              }
              const updateResult = await q.update(
                "plan",
                { status: "abandoned", updated_at: currentTimestamp },
                { plan_id: plan.plan_id },
              );
              if (updateResult.isErr()) throw updateResult.error;
              const commitResult = await doltCommit(
                `cancel: plan ${plan.plan_id}`,
                config.doltRepoPath,
                cmd.parent?.opts().noCommit,
              );
              if (commitResult.isErr()) throw commitResult.error;
              return { type: "plan" as const, id: plan.plan_id, status: "abandoned" as const };
            };

            if (typeHint === "plan" || typeHint === "auto") {
              const byPlanId = await q.select<PlanRow>("plan", {
                columns: ["plan_id", "status"],
                where: { plan_id: id },
              });
              if (byPlanId.isErr()) throw byPlanId.error;
              if (byPlanId.value.length > 0) return tryCancelPlan(byPlanId.value[0]);

              const byTitle = await q.select<PlanRow>("plan", {
                columns: ["plan_id", "status"],
                where: { title: id },
              });
              if (byTitle.isErr()) throw byTitle.error;
              if (byTitle.value.length > 0) return tryCancelPlan(byTitle.value[0]);

              if (typeHint === "plan") {
                throw buildError(ErrorCode.PLAN_NOT_FOUND, `Plan with ID or title '${id}' not found.`);
              }
            }

            if (typeHint === "task" || typeHint === "auto") {
              const taskResult = await q.select<TaskRow>("task", {
                columns: ["task_id", "status"],
                where: { task_id: id },
              });
              if (taskResult.isErr()) throw taskResult.error;
              if (taskResult.value.length > 0) {
                const task = taskResult.value[0];
                const transitionResult = checkValidTransition(task.status, "canceled");
                if (transitionResult.isErr()) throw transitionResult.error;

                const updateResult = await q.update(
                  "task",
                  { status: "canceled", updated_at: currentTimestamp },
                  { task_id: task.task_id },
                );
                if (updateResult.isErr()) throw updateResult.error;

                const insertEventResult = await q.insert("event", {
                  event_id: uuidv4(),
                  task_id: task.task_id,
                  kind: "note",
                  body: jsonObj({
                    type: "cancel",
                    reason: options.reason ?? null,
                  }),
                  created_at: currentTimestamp,
                });
                if (insertEventResult.isErr()) throw insertEventResult.error;

                const commitResult = await doltCommit(
                  `cancel: task ${task.task_id}`,
                  config.doltRepoPath,
                  cmd.parent?.opts().noCommit,
                );
                if (commitResult.isErr()) throw commitResult.error;
                return { type: "task" as const, id: task.task_id, status: "canceled" };
              }
            }

            throw buildError(
              ErrorCode.PLAN_NOT_FOUND,
              `Plan or task '${id}' not found.`,
            );
          })(),
          (e) => e as AppError,
        );
      });

      result.match(
        (data: { type: "plan" | "task"; id: string; status: string }) => {
          if (!cmd.parent?.opts().json) {
            console.log(`${data.type === "plan" ? "Plan" : "Task"} ${data.id} ${data.status}.`);
          } else {
            console.log(JSON.stringify(data, null, 2));
          }
        },
        (error: AppError) => {
          console.error(`Error: ${error.message}`);
          if (cmd.parent?.opts().json) {
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
