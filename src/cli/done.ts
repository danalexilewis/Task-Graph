import { Command } from "commander";
import { v4 as uuidv4 } from "uuid";
import { doltCommit } from "../db/commit";
import { readConfig, Config, parseIdList } from "./utils";
import { checkValidTransition } from "../domain/invariants";
import { TaskStatus } from "../domain/types";
import { ok, err } from "neverthrow";
import { AppError, buildError, ErrorCode } from "../domain/errors";
import { query, now, jsonObj, JsonValue } from "../db/query";

type DoneResult =
  | { id: string; status: "done" }
  | { id: string; error: string };

export function doneCommand(program: Command) {
  program
    .command("done")
    .description("Mark a task as done")
    .argument(
      "<taskIds...>",
      "One or more task IDs (space- or comma-separated)",
    )
    .option("--evidence <text>", "Evidence of completion", "")
    .option("--checks <json>", "JSON array of acceptance checks")
    .option(
      "--force",
      "Allow marking as done even if not in 'doing' status",
      false,
    )
    .action(async (taskIds: string[], options, cmd) => {
      const ids = parseIdList(taskIds);
      if (ids.length === 0) {
        console.error("At least one task ID required.");
        process.exit(1);
      }

      const configResult = await readConfig();
      if (configResult.isErr()) {
        console.error(configResult.error.message);
        process.exit(1);
      }
      const config = configResult.value;
      const json = cmd.parent?.opts().json;
      const results: DoneResult[] = [];
      let anyFailed = false;

      for (const taskId of ids) {
        const currentTimestamp = now();
        const q = query(config.doltRepoPath);

        const singleResult = await q
          .select<{ status: TaskStatus }>("task", {
            columns: ["status"],
            where: { task_id: taskId },
          })
          .andThen((currentStatusResult) => {
            if (currentStatusResult.length === 0) {
              return err(
                buildError(
                  ErrorCode.TASK_NOT_FOUND,
                  `Task with ID ${taskId} not found.`,
                ),
              );
            }
            const currentStatus = currentStatusResult[0].status;

            if (!options.force) {
              const transitionResult = checkValidTransition(
                currentStatus,
                "done",
              );
              if (transitionResult.isErr()) return err(transitionResult.error);
            }
            return ok(currentStatus);
          })
          .andThen(() =>
            q.update(
              "task",
              { status: "done", updated_at: currentTimestamp },
              { task_id: taskId },
            ),
          )
          .andThen(() => {
            let parsedChecks: JsonValue | null = null;
            if (options.checks) {
              try {
                parsedChecks = JSON.parse(options.checks) as JsonValue;
              } catch (e: unknown) {
                return err(
                  buildError(
                    ErrorCode.VALIDATION_FAILED,
                    `Invalid JSON for acceptance checks: ${options.checks}`,
                    e as Error,
                  ),
                );
              }
            }
            const eventBody = {
              evidence: options.evidence,
              checks: parsedChecks,
              timestamp: currentTimestamp,
            };

            return q.insert("event", {
              event_id: uuidv4(),
              task_id: taskId,
              kind: "done",
              body: jsonObj({
                evidence: eventBody.evidence,
                checks: eventBody.checks,
                timestamp: eventBody.timestamp,
              }),
              created_at: currentTimestamp,
            });
          })
          .andThen(() =>
            doltCommit(
              `task: done ${taskId}`,
              config.doltRepoPath,
              cmd.parent?.opts().noCommit,
            ),
          )
          .map(() => ({ task_id: taskId, status: "done" as const }));

        singleResult.match(
          () => results.push({ id: taskId, status: "done" }),
          (error: AppError) => {
            results.push({ id: taskId, error: error.message });
            anyFailed = true;
            return 0;
          },
        );
      }

      if (!json) {
        for (const r of results) {
          if ("error" in r) {
            console.error(`Task ${r.id}: ${r.error}`);
          } else {
            console.log(`Task ${r.id} done.`);
          }
        }
      } else {
        console.log(JSON.stringify(results));
      }

      if (anyFailed) process.exit(1);
    });
}
