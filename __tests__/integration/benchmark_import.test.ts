import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { setupIntegrationTest, teardownIntegrationTest, runTgCli } from "./test-utils";
import { doltSql } from "../../src/db/connection";

describe.serial("Benchmark plan import", () => {
  let context: Awaited<ReturnType<typeof setupIntegrationTest>>;

  beforeAll(async () => {
    context = await setupIntegrationTest();
  }, 30000);

  afterAll(async () => {
    await teardownIntegrationTest(context);
  }, 30000);

  it("imports CLI Benchmark Small plan and sets project.is_benchmark to 1", async () => {
    const { tempDir, doltRepoPath } = context;
    const importCmd = `import plans/26-03-02_benchmark_cli_small.md --plan "CLI Benchmark Small" --format cursor --no-commit`;
    const { exitCode } = await runTgCli(importCmd, tempDir);
    expect(exitCode).toBe(0);

    const result = await doltSql(
      `SELECT is_benchmark FROM project WHERE title = 'CLI Benchmark Small'`,
      doltRepoPath,
    );
    expect(result.isOk()).toBe(true);
    const rows = result._unsafeUnwrap();
    expect(rows.length).toBe(1);
    expect(rows[0].is_benchmark).toBe(1);
  });
});