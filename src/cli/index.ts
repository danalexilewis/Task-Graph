import { Command } from "commander";
import { initCommand } from "./init";
import { planCommand } from "./plan";
import { taskCommand } from "./task";
import { edgeCommand } from "./edge";
import { nextCommand } from "./next";
import { showCommand } from "./show";
import { startCommand } from "./start";
import { doneCommand } from "./done";
import { blockCommand } from "./block";
import { splitCommand } from "./split";
import { exportCommand } from "./export";
import { portfolioCommand } from "./portfolio";
import { importCommand } from "./import";
import { statusCommand } from "./status";
import { contextCommand } from "./context";
import { noteCommand } from "./note";
import { setupCommand } from "./setup";
import { crossplanCommand } from "./crossplan";
import { readConfig, rootOpts } from "./utils";
import { ensureMigrations } from "../db/migrate";
import { ErrorCode } from "../domain/errors";

const program = new Command();

/** Commands that create or scaffold; skip auto-migrate (no config or own migration path). */
const SKIP_MIGRATE_COMMANDS = new Set(["init", "setup"]);

function topLevelCommand(cmd: Command): Command {
  let c: Command = cmd;
  while (c.parent && c.parent.parent) {
    c = c.parent;
  }
  return c;
}

program.hook("preAction", async (_thisCommand, actionCommand) => {
  const top = topLevelCommand(actionCommand);
  if (SKIP_MIGRATE_COMMANDS.has(top.name())) {
    return;
  }
  const configResult = readConfig();
  if (configResult.isErr()) {
    if (configResult.error.code === ErrorCode.CONFIG_NOT_FOUND) {
      return;
    }
    return;
  }
  const opts = rootOpts(actionCommand);
  const noCommit = opts.noCommit ?? false;
  const runResult = await ensureMigrations(
    configResult.value.doltRepoPath,
    noCommit,
  );
  runResult.match(
    () => {},
    (e) => {
      console.error(`Migration failed: ${e.message}`);
      process.exit(1);
    },
  );
});

program
  .name("tg")
  .description("Task Graph CLI for Centaur Development")
  .version("0.1.0")
  .option("--json", "Output machine-readable JSON", false)
  .option("--no-commit", "Do not commit changes to Dolt", false)
  .option("--commit-msg <msg>", "Override default commit message");

initCommand(program);
setupCommand(program);
planCommand(program);
taskCommand(program);
edgeCommand(program);
nextCommand(program);
showCommand(program);
startCommand(program);
doneCommand(program);
blockCommand(program);
splitCommand(program);
exportCommand(program);
portfolioCommand(program);
importCommand(program);
statusCommand(program);
noteCommand(program);
contextCommand(program);
crossplanCommand(program);

program.parse(process.argv);
