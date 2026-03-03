import { Command } from "commander";
import { errAsync, okAsync, type ResultAsync } from "neverthrow";
import { sqlEscape } from "../db/escape";
import { query } from "../db/query";
import { type AppError, buildError, ErrorCode } from "../domain/errors";
import { type Config, readConfig, rootOpts } from "./utils";

interface ProjectRow {
  plan_id: string;
  title: string;
  intent: string;
}

interface TaskRow {
  task_id: string;
  title: string;
  hash_id: string | null;
}

interface EventRow {
  task_id: string;
  kind: string;
  body: unknown;
}

function parseBody(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      return (JSON.parse(raw) as Record<string, unknown>) ?? {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

/** Build PR-style message body sections (What changed, Why, Key insights, Deliverables). */
function buildMessageBody(
  title: string,
  intent: string,
  doneTasks: TaskRow[],
  evidenceByTaskId: Map<string, string>,
  noteMessages: string[],
): string {
  const lines: string[] = [];

  lines.push("## What changed");
  lines.push("");
  lines.push(title);
  for (const t of doneTasks) {
    lines.push(`- ${t.title}`);
  }
  lines.push("");

  lines.push("## Why");
  lines.push("");
  lines.push(intent.trim() || "(No intent recorded)");
  lines.push("");

  lines.push("## Key insights");
  lines.push("");
  if (noteMessages.length > 0) {
    for (const msg of noteMessages) {
      lines.push(`- ${msg}`);
    }
  } else {
    lines.push("(None)");
  }
  lines.push("");

  lines.push("## Deliverables");
  lines.push("");
  for (const t of doneTasks) {
    const evidence = evidenceByTaskId.get(t.task_id);
    const trimmed = evidence?.trim();
    if (trimmed) {
      lines.push(`- ${t.title}: ${trimmed}`);
    } else {
      lines.push(`- ${t.title}`);
    }
  }

  return lines.join("\n");
}

/**
 * Generate a PR-style plan summary message (subject + body) for use as a commit message or display.
 * If plan is not found, returns Err. If plan exists but no done tasks, returns minimal "plan: <title> — 0 tasks" so merge step never blocks.
 */
export function generatePlanSummaryMessage(
  planId: string,
  format: "full" | "commit",
  basePath?: string,
): ResultAsync<string, AppError> {
  return readConfig(basePath).asyncAndThen((config: Config) => {
    const q = query(config.doltRepoPath);

    return q
      .select<ProjectRow>("project", {
        columns: ["plan_id", "title", "intent"],
        where: { plan_id: planId },
      })
      .andThen((rows) => {
        if (rows.length === 0) {
          return errAsync(
            buildError(ErrorCode.PLAN_NOT_FOUND, `Plan ${planId} not found`),
          );
        }
        const project = rows[0];

        return q
          .select<TaskRow>("task", {
            columns: ["task_id", "title", "hash_id"],
            where: { plan_id: planId, status: "done" },
            orderBy: "`updated_at` ASC",
          })
          .andThen((doneTasks) => {
            const taskIds = doneTasks.map((t) => t.task_id);
            const evidenceByTaskId = new Map<string, string>();
            const noteMessages: string[] = [];

            if (taskIds.length > 0) {
              const inList = taskIds
                .map((id) => `'${sqlEscape(id)}'`)
                .join(",");
              return q
                .raw<EventRow>(
                  `SELECT task_id, kind, body FROM \`event\` WHERE task_id IN (${inList}) AND kind IN ('done','note') ORDER BY created_at ASC`,
                )
                .map((eventRows) => {
                  for (const row of eventRows) {
                    const body = parseBody(row.body);
                    if (row.kind === "done") {
                      const evidence = body.evidence;
                      if (typeof evidence === "string" && evidence.trim()) {
                        // Keep latest per task (rows ordered by created_at ASC, so last wins)
                        evidenceByTaskId.set(row.task_id, evidence);
                      }
                    } else if (row.kind === "note") {
                      const message = body.message;
                      if (typeof message === "string" && message.trim()) {
                        noteMessages.push(message.trim());
                      }
                    }
                  }
                  return { evidenceByTaskId, noteMessages };
                })
                .map(({ evidenceByTaskId: ev, noteMessages: notes }) => {
                  const subject = `plan: ${project.title} — ${doneTasks.length} tasks`;
                  const body = buildMessageBody(
                    project.title,
                    project.intent ?? "",
                    doneTasks,
                    ev,
                    notes,
                  );
                  const full = `${subject}\n\n${body}`;
                  if (format === "commit") {
                    return full; // first line = subject, blank line, then body
                  }
                  return full;
                });
            }

            // No done tasks: minimal message so merge step never blocks
            const subject = `plan: ${project.title} — 0 tasks`;
            return okAsync(`${subject}\n`);
          });
      });
  });
}

export function planSummaryCommand(): Command {
  return new Command("summary")
    .description(
      "Generate PR-style message body for a plan (for git commit -F or -m -m)",
    )
    .requiredOption("--plan <planId>", "Plan (project) ID")
    .option(
      "--format <format>",
      "Output format: full (default) or commit (subject line, blank line, body)",
      "full",
    )
    .action(async (options, cmd) => {
      const format =
        options.format === "commit" ? "commit" : ("full" as "full" | "commit");
      const result = await generatePlanSummaryMessage(
        options.plan,
        format,
        process.cwd(),
      );

      result.match(
        (message: string) => {
          console.log(message);
        },
        (error: AppError) => {
          console.error(`Error: ${error.message}`);
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
