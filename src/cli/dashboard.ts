import type { Command } from "commander";
import { ResultAsync } from "neverthrow";
import type { AppError } from "../domain/errors";
import {
  fetchStatusData,
  fetchTasksTableData,
  formatDashboardProjectsView,
  formatDashboardTasksView,
  formatStatusAsString,
  type StatusOptions,
  type StatusViewMode,
} from "./status";
import { getTerminalWidth } from "./terminal";
import type { Config } from "./utils";
import { readConfig } from "./utils";

const REFRESH_MS = 2000;

async function runLiveFallbackDashboard(
  config: Config,
  statusOptions: StatusOptions,
): Promise<void> {
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
    (d) => {
      const w = getTerminalWidth();
      console.log(`\n${formatStatusAsString(d, w, { dashboard: true })}\n`);
      timer = setInterval(async () => {
        const r = await readConfig().asyncAndThen((c: Config) =>
          fetchStatusData(c, statusOptions),
        );
        r.match(
          (data) => {
            process.stdout.write("\x1b[2J\x1b[H");
            console.log(
              `\n${formatStatusAsString(data, getTerminalWidth(), { dashboard: true })}\n`,
            );
          },
          () => {},
        );
      }, REFRESH_MS);
    },
    (e: AppError) => {
      console.error(e.message);
      process.exit(1);
    },
  );
}

/** Live fallback for tg dashboard --tasks: Active + Next 7 + Last 7 sections, 2s refresh. */
async function runLiveFallbackDashboardTasks(
  config: Config,
  statusOptions: StatusOptions,
): Promise<void> {
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
  const activeOptions = { ...statusOptions, filter: "active" as const };
  const [statusResult, activeResult] = await Promise.all([
    fetchStatusData(config, statusOptions),
    fetchTasksTableData(config, activeOptions),
  ]);
  statusResult.match(
    (d) => {
      activeResult.match(
        (activeRows) => {
          const w = getTerminalWidth();
          console.log(`\n${formatDashboardTasksView(d, activeRows, w)}\n`);
          timer = setInterval(async () => {
            const r = await readConfig().asyncAndThen((c: Config) =>
              ResultAsync.combine([
                fetchStatusData(c, statusOptions),
                fetchTasksTableData(c, activeOptions),
              ]),
            );
            r.match(
              ([data, active]) => {
                process.stdout.write("\x1b[2J\x1b[H");
                console.log(
                  `\n${formatDashboardTasksView(data, active, getTerminalWidth())}\n`,
                );
              },
              () => {},
            );
          }, REFRESH_MS);
        },
        (e: AppError) => {
          console.error(e.message);
          process.exit(1);
        },
      );
    },
    (e: AppError) => {
      console.error(e.message);
      process.exit(1);
    },
  );
}

/** Live fallback for tg dashboard --projects: Active plans + Next 7 + Last 7 sections, 2s refresh. */
async function runLiveFallbackDashboardProjects(
  config: Config,
  statusOptions: StatusOptions,
): Promise<void> {
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
    (d) => {
      const w = getTerminalWidth();
      console.log(`\n${formatDashboardProjectsView(d, w)}\n`);
      timer = setInterval(async () => {
        const r = await readConfig().asyncAndThen((c: Config) =>
          fetchStatusData(c, statusOptions),
        );
        r.match(
          (data) => {
            process.stdout.write("\x1b[2J\x1b[H");
            console.log(
              `\n${formatDashboardProjectsView(data, getTerminalWidth())}\n`,
            );
          },
          () => {},
        );
      }, REFRESH_MS);
    },
    (e: AppError) => {
      console.error(e.message);
      process.exit(1);
    },
  );
}

export function dashboardCommand(program: Command) {
  program
    .command("dashboard")
    .description(
      "Open status dashboard (live-updating TUI; 2s refresh, q or Ctrl+C to quit). Use --tasks or --projects for table view.",
    )
    .option("--tasks", "Live tasks table view")
    .option("--projects", "Live projects table view")
    .action(async (options) => {
      if (options.tasks && options.projects) {
        console.error(
          "tg dashboard: only one of --tasks or --projects is allowed.",
        );
        process.exit(1);
      }

      const viewMode: StatusViewMode = options.tasks
        ? "tasks"
        : options.projects
          ? "projects"
          : "dashboard";

      const configResult = await readConfig();
      if (configResult.isErr()) {
        console.error(configResult.error.message);
        process.exit(1);
      }
      const config = configResult.value;

      const statusOptions: StatusOptions = {
        view: viewMode,
        tasksView: options.tasks === true,
      };

      if (viewMode === "projects") {
        const { runOpenTUILiveDashboardProjects } = await import(
          "./tui/live-opentui.js"
        );
        try {
          await runOpenTUILiveDashboardProjects(config, statusOptions);
          return;
        } catch {
          // OpenTUI not available; use fallback live loop
        }
        await runLiveFallbackDashboardProjects(config, statusOptions);
        return;
      }

      if (viewMode === "tasks") {
        const { runOpenTUILiveDashboardTasks } = await import(
          "./tui/live-opentui.js"
        );
        try {
          await runOpenTUILiveDashboardTasks(config, statusOptions);
          return;
        } catch {
          // OpenTUI not available; use fallback live loop
        }
        await runLiveFallbackDashboardTasks(config, statusOptions);
        return;
      }

      const { runOpenTUILive } = await import("./tui/live-opentui.js");
      try {
        await runOpenTUILive(config, statusOptions);
        return;
      } catch {
        // OpenTUI not available; use fallback live loop
      }
      await runLiveFallbackDashboard(config, statusOptions);
    });
}
