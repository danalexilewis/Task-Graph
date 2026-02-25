"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const init_1 = require("./init");
const plan_1 = require("./plan");
const task_1 = require("./task");
const edge_1 = require("./edge");
const next_1 = require("./next");
const show_1 = require("./show");
const start_1 = require("./start");
const done_1 = require("./done");
const block_1 = require("./block");
const split_1 = require("./split");
const export_1 = require("./export");
const portfolio_1 = require("./portfolio");
const import_1 = require("./import");
const status_1 = require("./status");
const context_1 = require("./context");
const note_1 = require("./note");
const setup_1 = require("./setup");
const utils_1 = require("./utils");
const migrate_1 = require("../db/migrate");
const errors_1 = require("../domain/errors");
const program = new commander_1.Command();
/** Commands that create or scaffold; skip auto-migrate (no config or own migration path). */
const SKIP_MIGRATE_COMMANDS = new Set(["init", "setup"]);
function topLevelCommand(cmd) {
    let c = cmd;
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
    const configResult = (0, utils_1.readConfig)();
    if (configResult.isErr()) {
        if (configResult.error.code === errors_1.ErrorCode.CONFIG_NOT_FOUND) {
            return;
        }
        return;
    }
    const opts = (0, utils_1.rootOpts)(actionCommand);
    const noCommit = opts.noCommit ?? false;
    const runResult = await (0, migrate_1.ensureMigrations)(configResult.value.doltRepoPath, noCommit);
    runResult.match(() => { }, (e) => {
        console.error(`Migration failed: ${e.message}`);
        process.exit(1);
    });
});
program
    .name("tg")
    .description("Task Graph CLI for Centaur Development")
    .version("0.1.0")
    .option("--json", "Output machine-readable JSON", false)
    .option("--no-commit", "Do not commit changes to Dolt", false)
    .option("--commit-msg <msg>", "Override default commit message");
(0, init_1.initCommand)(program);
(0, setup_1.setupCommand)(program);
(0, plan_1.planCommand)(program);
(0, task_1.taskCommand)(program);
(0, edge_1.edgeCommand)(program);
(0, next_1.nextCommand)(program);
(0, show_1.showCommand)(program);
(0, start_1.startCommand)(program);
(0, done_1.doneCommand)(program);
(0, block_1.blockCommand)(program);
(0, split_1.splitCommand)(program);
(0, export_1.exportCommand)(program);
(0, portfolio_1.portfolioCommand)(program);
(0, import_1.importCommand)(program);
(0, status_1.statusCommand)(program);
(0, note_1.noteCommand)(program);
(0, context_1.contextCommand)(program);
program.parse(process.argv);
