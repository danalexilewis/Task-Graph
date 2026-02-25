import { Command } from "commander";
import { v4 as uuidv4 } from "uuid";
import { doltCommit } from "../db/commit";
import { readConfig, Config } from "./utils"; // Import Config
import { checkRunnable, checkValidTransition } from "../domain/invariants";
import { TaskStatus } from "../domain/types";
import { ResultAsync, err, okAsync, errAsync } from "neverthrow";
import { AppError, buildError, ErrorCode } from "../domain/errors";
import { query, now, jsonObj } from "../db/query";
import { doltSql } from "../db/connection";
import { sqlEscape } from "../db/escape";

export function startCommand(program: Command) {
  program
    .command("start")
    .description("Start a task")
    .argument("<taskId>", "ID of the task to start")
    .option("--agent <name>", "Agent identifier for multi-agent visibility")
    .option("--force", "Override claim when task is already being worked")
    .action(async (taskId, options, cmd) => {
      const agentName = options.agent ?? "default";
      const force = options.force ?? false;
      const result = await readConfig().asyncAndThen((config: Config) => {
        const currentTimestamp = now();
        const q = query(config.doltRepoPath);

        return q
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

            if (currentStatus === "doing" && !force) {
              const sql = `SELECT body FROM \`event\` WHERE task_id = '${sqlEscape(taskId)}' AND kind = 'started' ORDER BY created_at DESC LIMIT 1`;
              return doltSql(sql, config.doltRepoPath).andThen((rows) => {
                const row = (rows as { body: string | object }[])[0];
                const raw = row?.body;
                const parsed =
                  raw != null
                    ? typeof raw === "string"
                      ? (JSON.parse(raw) as { agent?: string })
                      : (raw as { agent?: string })
                    : null;
                const claimant = parsed?.agent ?? "unknown";
                return err(
                  buildError(
                    ErrorCode.TASK_ALREADY_CLAIMED,
                    `Task is being worked by ${claimant}. Use --force to override.`,
                  ),
                );
              });
            }

            if (currentStatus === "todo") {
              return checkRunnable(taskId, config.doltRepoPath);
            }

            if (currentStatus === "doing" && force) {
              return okAsync(undefined); // Bypass claim guard
            }

            const tr = checkValidTransition(currentStatus, "doing");
            return tr.isOk() ? okAsync(undefined) : errAsync(tr.error);
          })
          .andThen(() =>
            q.update(
              "task",
              { status: "doing", updated_at: currentTimestamp },
              { task_id: taskId },
            ),
          )
          .andThen(() =>
            q.insert("event", {
              event_id: uuidv4(),
              task_id: taskId,
              kind: "started",
              body: jsonObj({
                agent: agentName,
                timestamp: currentTimestamp,
              }),
              created_at: currentTimestamp,
            }),
          )
          .andThen(() =>
            doltCommit(
              `task: start ${taskId}`,
              config.doltRepoPath,
              cmd.parent?.opts().noCommit,
            ),
          )
          .map(() => ({ task_id: taskId, status: "doing" }));
      });

      result.match(
        (data: unknown) => {
          const resultData = data as { task_id: string; status: TaskStatus };
          if (!cmd.parent?.opts().json) {
            console.log(`Task ${resultData.task_id} started.`);
          } else {
            console.log(JSON.stringify(resultData, null, 2));
          }
        },
        (error: AppError) => {
          console.error(`Error starting task: ${error.message}`);
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
