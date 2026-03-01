import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { doltSql } from "../../src/db/connection";
import {
  runTgCli,
  setupIntegrationTest,
  teardownIntegrationTest,
} from "./test-utils";

describe.serial("Cursor format import sets is_benchmark", () => {
  let context: Awaited<ReturnType<typeof setupIntegrationTest>>;
  let planFilePath: string;

  beforeAll(async () => {
    context = await setupIntegrationTest();
    const plansDir = path.join(context.tempDir, "plans");
    fs.mkdirSync(plansDir, { recursive: true });
    planFilePath = path.join(plansDir, "cursor-bench.md");
  }, 60000);

  afterAll(async () => {
    await teardownIntegrationTest(context);
  }, 60000);

  it("imports plan with benchmark true and sets project.is_benchmark to 1", async () => {
    if (!context) throw new Error("Context not initialized");
    const content = `---
name: Benchmark Plan
overview: "Plan with benchmark flag."
todos:
  - id: bench-task
    content: "Benchmark task"
benchmark: true
---
`;
    fs.writeFileSync(planFilePath, content);

    const { exitCode } = await runTgCli(
      `import plans/cursor-bench.md --plan "Benchmark Plan" --format cursor --no-commit`,
      context.tempDir,
    );
    expect(exitCode).toBe(0);

    const result = await doltSql(
      `SELECT is_benchmark FROM project WHERE title = 'Benchmark Plan'`,
      context.doltRepoPath,
    );
    expect(result.isOk()).toBe(true);
    const rows = result._unsafeUnwrap();
    expect(rows.length).toBe(1);
    expect(rows[0].is_benchmark).toBe(1);
  });

  it("imports plan without benchmark and defaults project.is_benchmark to 0", async () => {
    if (!context) throw new Error("Context not initialized");
    const content = `---
name: Non-Benchmark Plan
overview: "Plan without benchmark flag."
todos:
  - id: normal-task
    content: "Normal task"
---
`;
    fs.writeFileSync(planFilePath, content);

    const { exitCode } = await runTgCli(
      `import plans/cursor-bench.md --plan "Non-Benchmark Plan" --format cursor --no-commit`,
      context.tempDir,
    );
    expect(exitCode).toBe(0);

    const result = await doltSql(
      `SELECT is_benchmark FROM project WHERE title = 'Non-Benchmark Plan'`,
      context.doltRepoPath,
    );
    expect(result.isOk()).toBe(true);
    const rows = result._unsafeUnwrap();
    expect(rows.length).toBe(1);
    expect(rows[0].is_benchmark).toBe(0);
  });
});
