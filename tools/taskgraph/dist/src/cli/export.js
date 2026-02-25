"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportCommand = exportCommand;
const commander_1 = require("commander");
const fs_1 = require("fs");
const mermaid_1 = require("../export/mermaid");
const dot_1 = require("../export/dot");
const markdown_1 = require("../export/markdown");
const utils_1 = require("./utils");
function exportCommand(program) {
    program
        .command("export")
        .description("Export graph visualizations and markdown")
        .addCommand(exportMermaidCommand())
        .addCommand(exportDotCommand())
        .addCommand(exportMarkdownCommand());
}
function exportMermaidCommand() {
    return new commander_1.Command("mermaid")
        .description("Output Mermaid graph TD text to stdout")
        .option("--plan <planId>", "Filter by plan ID")
        .option("--feature <featureKey>", "Filter by feature key")
        .action(async (options, cmd) => {
        const result = await (0, utils_1.readConfig)().asyncAndThen((config) => {
            // Removed config.doltRepoPath from generateMermaidGraph call
            return (0, mermaid_1.generateMermaidGraph)(options.plan, options.feature);
        });
        result.match((mermaidGraph) => {
            console.log(mermaidGraph);
        }, (error) => {
            console.error(`Error generating Mermaid graph: ${error.message}`);
            if (cmd.parent?.opts().json) {
                console.log(JSON.stringify({
                    status: "error",
                    code: error.code,
                    message: error.message,
                    cause: error.cause,
                }));
            }
            process.exit(1);
        });
    });
}
function exportDotCommand() {
    return new commander_1.Command("dot")
        .description("Output Graphviz DOT text to stdout")
        .option("--plan <planId>", "Filter by plan ID")
        .option("--feature <featureKey>", "Filter by feature key")
        .action(async (options, cmd) => {
        const result = await (0, utils_1.readConfig)().asyncAndThen((config) => {
            // Removed config.doltRepoPath from generateDotGraph call
            return (0, dot_1.generateDotGraph)(options.plan, options.feature);
        });
        result.match((dotGraph) => {
            console.log(dotGraph);
        }, (error) => {
            console.error(`Error generating DOT graph: ${error.message}`);
            if (cmd.parent?.opts().json) {
                console.log(JSON.stringify({
                    status: "error",
                    code: error.code,
                    message: error.message,
                    cause: error.cause,
                }));
            }
            process.exit(1);
        });
    });
}
function exportMarkdownCommand() {
    return new commander_1.Command("markdown")
        .description("Output plan and tasks in Cursor format (for round-trip import)")
        .requiredOption("--plan <planId>", "Plan ID to export")
        .option("--out <path>", "Write to file instead of stdout")
        .action(async (options, cmd) => {
        const result = await (0, markdown_1.generateMarkdown)(options.plan);
        result.match((markdown) => {
            if (options.out) {
                (0, fs_1.writeFileSync)(options.out, markdown);
            }
            else {
                console.log(markdown);
            }
        }, (error) => {
            console.error(`Error exporting markdown: ${error.message}`);
            if (cmd.parent?.opts().json) {
                console.log(JSON.stringify({
                    status: "error",
                    code: error.code,
                    message: error.message,
                    cause: error.cause,
                }));
            }
            process.exit(1);
        });
    });
}
