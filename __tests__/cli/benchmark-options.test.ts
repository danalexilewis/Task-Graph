import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { importCommand } from "../../src/cli/import";
import { statsCommand } from "../../src/cli/stats";

describe("benchmark feature options", () => {
  it("import command should have --benchmark option", () => {
    const program = new Command();
    importCommand(program);
    const importCmd = program.commands.find((cmd) => cmd.name() === "import");
    expect(importCmd).toBeDefined();
    const hasBenchmark = importCmd!.options.some(
      (opt) => opt.long === "--benchmark <filePath>",
    );
    expect(hasBenchmark).toBe(true);
  });

  it("stats command should have --benchmark filter option", () => {
    const program = new Command();
    statsCommand(program);
    const statsCmd = program.commands.find((cmd) => cmd.name() === "stats");
    expect(statsCmd).toBeDefined();
    const hasBenchmark = statsCmd!.options.some(
      (opt) => opt.long === "--benchmark <benchmark>",
    );
    expect(hasBenchmark).toBe(true);
  });
});
