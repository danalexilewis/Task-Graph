import { Command } from "commander";
import { v4 as uuidv4 } from "uuid";
import { doltCommit } from "../db/commit";
import { readConfig, Config } from "./utils";
import { ResultAsync, err } from "neverthrow";
import { AppError, buildError, ErrorCode } from "../domain/errors";
import { query, now, jsonObj } from "../db/query";

export function noteCommand(program: Command) {
  program
    .command("note")
    .description(
      "Append a note event to a task (breadcrumbs for other agents and the human)",
    )
    .argument("<taskId>", "ID of the task to annotate")
    .option("--msg <text>", "Note message (required)")
    .option("--agent <name>", "Agent identifier")
    .action(async (taskId, options, cmd) => {
      const msg = options.msg;
      if (!msg || typeof msg !== "string") {
        console.error("Error: --msg <text> is required.");
        process.exit(1);
      }
      const agentName = options.agent ?? "default";
      const result = await readConfig().asyncAndThen((config: Config) => {
        const currentTimestamp = now();
        const q = query(config.doltRepoPath);

        return q
          .select<{ task_id: string }>("task", {
            columns: ["task_id"],
            where: { task_id: taskId },
          })
          .andThen((rows) => {
            if (rows.length === 0) {
              return err(
                buildError(
                  ErrorCode.TASK_NOT_FOUND,
                  `Task with ID ${taskId} not found.`,
                ),
              );
            }
            return q
              .insert("event", {
                event_id: uuidv4(),
                task_id: taskId,
                kind: "note",
                body: jsonObj({
                  message: msg,
                  agent: agentName,
                  timestamp: currentTimestamp,
                }),
                created_at: currentTimestamp,
              })
              .andThen(() =>
                doltCommit(
                  `task: note ${taskId}`,
                  config.doltRepoPath,
                  cmd.parent?.opts().noCommit,
                ),
              )
              .map(() => ({ task_id: taskId }));
          });
      });

      result.match(
        (data: { task_id: string }) => {
          if (!cmd.parent?.opts().json) {
            console.log(`Note added to task ${data.task_id}.`);
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
