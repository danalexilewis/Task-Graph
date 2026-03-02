import type { Command } from "commander";

/**
 * Task 01 CLI Command stub.
 */
export function task01CliCommand(program: Command): void {
  program
    .command("task-01-cli-command")
    .description("Stub for Task 01 CLI command")
    .action(() => {
      console.log("task-01-cli-command is not yet implemented.");
    });
}
