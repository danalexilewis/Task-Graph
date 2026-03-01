import { Command } from "commander";
import { errAsync, okAsync } from "neverthrow";
import { v4 as uuidv4 } from "uuid";
import { doltCommit } from "../db/commit";
import { sqlEscape } from "../db/escape";
import { tableExists } from "../db/migrate";
import { now, query } from "../db/query";
import { type AppError, buildError, ErrorCode } from "../domain/errors";
import { type Config, readConfig, rootOpts } from "./utils";
import { renderTable } from "./table";
import { getTerminalWidth } from "./terminal";
import { boxedSection, getBoxInnerWidth } from "./tui/boxen";

const STATUS_VALUES = [
  "draft",
  "active",
  "paused",
  "done",
  "abandoned",
] as const;

function parseDate(s: string | undefined): string | null {
  if (s == null || s === "") return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function initiativeCommand(program: Command) {
  program
    .command("initiative")
    .description("Manage initiatives (strategic containers for projects)")
    .addCommand(initiativeNewCommand())
    .addCommand(initiativeListCommand())
    .addCommand(initiativeAssignProjectCommand());
}

function initiativeNewCommand(): Command {
  return new Command("new")
    .description("Create a new initiative")
    .argument("<title>", "Title of the initiative")
    .option("--description <text>", "Description of the initiative", "")
    .option(
      "--status <status>",
      `Status: one of ${STATUS_VALUES.join(", ")}`,
      "draft",
    )
    .option("--cycle <cycleId>", "Link to a strategic cycle (sets cycle_id and derives cycle_start/cycle_end)")
    .option("--cycle-start <date>", "Cycle start date (YYYY-MM-DD); overrides value from --cycle")
    .option("--cycle-end <date>", "Cycle end date (YYYY-MM-DD); overrides value from --cycle")
    .action(async (title, options, cmd) => {
      const result = await readConfig().asyncAndThen((config: Config) => {
        const rawStatus = String(options.status ?? "draft").toLowerCase();
        if (!(STATUS_VALUES as readonly string[]).includes(rawStatus)) {
          return errAsync(
            buildError(
              ErrorCode.VALIDATION_FAILED,
              `Invalid status "${options.status}". Must be one of: ${STATUS_VALUES.join(", ")}`,
            ),
          );
        }
        const status = rawStatus as (typeof STATUS_VALUES)[number];
        return tableExists(config.doltRepoPath, "initiative").andThen(
          (exists) => {
            if (!exists) {
              return errAsync(
                buildError(
                  ErrorCode.DB_QUERY_FAILED,
                  "Initiative table does not exist. Run tg init (or ensure migrations have run) so the initiative table is created.",
                ),
              );
            }
            const q = query(config.doltRepoPath);
            type CycleRow = {
              cycle_id: string;
              start_date: string;
              end_date: string;
            };
            const loadCycle = () => {
              if (!options.cycle) return okAsync<CycleRow[]>([]);
              return tableExists(config.doltRepoPath, "cycle").andThen(
                (cycleExists) => {
                  if (!cycleExists) {
                    return errAsync(
                      buildError(
                        ErrorCode.DB_QUERY_FAILED,
                        "Cycle table does not exist. Run tg init so the cycle table is created.",
                      ),
                    );
                  }
                  return q
                    .raw<CycleRow>(
                      `SELECT cycle_id, start_date, end_date FROM \`cycle\` WHERE cycle_id = '${sqlEscape(options.cycle)}' LIMIT 1`,
                    )
                    .andThen((rows) => {
                      if (rows.length === 0) {
                        return errAsync(
                          buildError(
                            ErrorCode.VALIDATION_FAILED,
                            `Cycle not found: ${options.cycle}. Run \`tg cycle list\` to see existing cycles.`,
                          ),
                        );
                      }
                      return okAsync(rows);
                    });
                },
              );
            };
            return loadCycle().andThen((cycleRows) => {
              const cycleRow = cycleRows.length > 0 ? cycleRows[0] : null;
              const cycleStart =
                parseDate(options.cycleStart) ??
                (cycleRow?.start_date ?? null);
              const cycleEnd =
                parseDate(options.cycleEnd) ?? (cycleRow?.end_date ?? null);
              const initiative_id = uuidv4();
              const currentTimestamp = now();
              const insertPayload: Record<string, string | null> = {
                initiative_id,
                title,
                description: options.description ?? "",
                status,
                cycle_start: cycleStart,
                cycle_end: cycleEnd,
                created_at: currentTimestamp,
                updated_at: currentTimestamp,
              };
              return q
                .raw<{ "1": number }>(
                  "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'initiative' AND COLUMN_NAME = 'cycle_id' LIMIT 1",
                )
                .andThen((colRows) => {
                  if (
                    colRows.length > 0 &&
                    options.cycle &&
                    cycleRow
                  ) {
                    insertPayload.cycle_id = options.cycle;
                  }
                  return q
                    .insert("initiative", insertPayload)
                    .andThen(() =>
                      doltCommit(
                        `initiative: create ${initiative_id} - ${title}`,
                        config.doltRepoPath,
                        rootOpts(cmd).noCommit,
                      ),
                    )
                    .map(() => ({
                      initiative_id,
                      title,
                      description: options.description ?? "",
                      status,
                      cycle_start: cycleStart,
                      cycle_end: cycleEnd,
                      ...(options.cycle && cycleRow
                        ? { cycle_id: options.cycle }
                        : {}),
                    }));
                });
            });
          },
        );
      });

      result.match(
        (data) => {
          if (!rootOpts(cmd).json) {
            console.log(`Initiative created: ${data.initiative_id}`);
            console.log(`  Title: ${data.title}`);
            if (data.description)
              console.log(`  Description: ${data.description}`);
            console.log(`  Status: ${data.status}`);
            if (data.cycle_start)
              console.log(`  Cycle start: ${data.cycle_start}`);
            if (data.cycle_end) console.log(`  Cycle end: ${data.cycle_end}`);
            console.log("View with: pnpm tg status --initiatives");
          } else {
            console.log(JSON.stringify(data, null, 2));
          }
        },
        (error: AppError) => {
          console.error(`Error creating initiative: ${error.message}`);
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

interface InitiativeListRow {
  initiative_id: string;
  title: string;
  status: string;
  cycle_start: string | null;
  cycle_end: string | null;
  cycle_id?: string | null;
  cycle_name?: string | null;
  created_at: string;
}

function formatCycleColumn(row: InitiativeListRow): string {
  if (row.cycle_name) return row.cycle_name;
  if (row.cycle_start && row.cycle_end)
    return `${row.cycle_start} – ${row.cycle_end}`;
  return "—";
}

function initiativeListCommand(): Command {
  return new Command("list")
    .description("List initiatives (newest first)")
    .option("--json", "Output full rows as JSON array")
    .action(async (_options, cmd) => {
      const result = await readConfig().asyncAndThen((config: Config) =>
        tableExists(config.doltRepoPath, "initiative").andThen((exists) => {
          if (!exists) {
            return errAsync(
              buildError(
                ErrorCode.DB_QUERY_FAILED,
                "Initiative table does not exist. Run tg init (or ensure migrations have run) so the initiative table is created.",
              ),
            );
          }
          const q = query(config.doltRepoPath);
          const baseSql =
            "SELECT initiative_id, title, status, cycle_start, cycle_end, created_at FROM `initiative` ORDER BY created_at DESC";
          const withCycleSql = `SELECT i.initiative_id, i.title, i.status, i.cycle_start, i.cycle_end, i.cycle_id, c.name AS cycle_name, i.created_at FROM \`initiative\` i LEFT JOIN \`cycle\` c ON i.cycle_id = c.cycle_id ORDER BY i.created_at DESC`;
          return tableExists(config.doltRepoPath, "cycle").andThen(
            (cycleExists) => {
              if (!cycleExists) return q.raw<InitiativeListRow>(baseSql);
              return q
                .raw<{ "1": number }>(
                  "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'initiative' AND COLUMN_NAME = 'cycle_id' LIMIT 1",
                )
                .andThen((colRows) =>
                  colRows.length > 0
                    ? q.raw<InitiativeListRow>(withCycleSql)
                    : q.raw<InitiativeListRow>(baseSql),
                );
            },
          );
        }),
      );

      result.match(
        (rows) => {
          if (rootOpts(cmd).json) {
            console.log(JSON.stringify(rows, null, 2));
            return;
          }
          const w = getTerminalWidth();
          const innerW = getBoxInnerWidth(w);
          const tableRows = rows.map((r) => [
            r.initiative_id.slice(0, 8),
            r.title,
            r.status,
            formatCycleColumn(r),
          ]);
          const table = renderTable({
            headers: ["Id", "Title", "Status", "Cycle"],
            rows:
              tableRows.length > 0
                ? tableRows
                : [["—", "No initiatives", "—", "—"]],
            maxWidth: innerW,
            minWidths: [8, 10, 8, 10],
          });
          console.log(`\n${boxedSection("Initiatives", table, w)}\n`);
        },
        (error: AppError) => {
          console.error(`Error listing initiatives: ${error.message}`);
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

function initiativeAssignProjectCommand(): Command {
  return new Command("assign-project")
    .description("Assign a project (plan) to an initiative")
    .argument("<initiativeId>", "Initiative ID")
    .argument("<planId>", "Plan (project) ID")
    .option("--json", "Output { ok, planId, initiativeId }")
    .action(async (initiativeId, planId, _options, cmd) => {
      const result = await readConfig().asyncAndThen((config: Config) => {
        const q = query(config.doltRepoPath);
        return tableExists(config.doltRepoPath, "initiative")
          .andThen((initExists) => {
            if (!initExists) {
              return errAsync(
                buildError(
                  ErrorCode.DB_QUERY_FAILED,
                  "Initiative table does not exist. Run tg init (or ensure migrations have run) so the initiative table is created.",
                ),
              );
            }
            return q
              .raw<{ initiative_id: string; title: string }>(
                `SELECT initiative_id, title FROM \`initiative\` WHERE initiative_id = '${sqlEscape(initiativeId)}' LIMIT 1`,
              )
              .andThen((rows) => {
                if (rows.length === 0) {
                  return errAsync(
                    buildError(
                      ErrorCode.VALIDATION_FAILED,
                      `Initiative not found: ${initiativeId}. Run \`tg initiative list\` to see existing initiatives.`,
                    ),
                  );
                }
                return okAsync(rows[0]);
              });
          })
          .andThen((initiative) =>
            q
              .raw<{ plan_id: string }>(
                `SELECT plan_id FROM \`project\` WHERE plan_id = '${sqlEscape(planId)}' LIMIT 1`,
              )
              .andThen((planRows) => {
                if (planRows.length === 0) {
                  return errAsync(
                    buildError(
                      ErrorCode.VALIDATION_FAILED,
                      `Project (plan) not found: ${planId}. Run \`tg plan list\` to see existing plans.`,
                    ),
                  );
                }
                return okAsync(initiative);
              }),
          )
          .andThen((initiative) =>
            q
              .update(
                "project",
                { initiative_id: initiativeId, updated_at: now() },
                { plan_id: planId },
              )
              .andThen(() =>
                doltCommit(
                  `initiative: assign project ${planId} to initiative ${initiativeId}`,
                  config.doltRepoPath,
                  rootOpts(cmd).noCommit,
                ),
              )
              .map(() => ({ initiative, planId, initiativeId })),
          );
      });

      result.match(
        (data) => {
          if (rootOpts(cmd).json) {
            console.log(
              JSON.stringify({
                ok: true,
                planId: data.planId,
                initiativeId: data.initiativeId,
              }),
            );
          } else {
            console.log(
              `Project ${data.planId} assigned to initiative '${data.initiative.title}' (${data.initiativeId})`,
            );
          }
        },
        (error: AppError) => {
          console.error(`Error assigning project: ${error.message}`);
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
