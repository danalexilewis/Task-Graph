import { describe, expect, it } from "vitest";
import { MIGRATION_CHAIN } from "../../src/db/migrate";

describe("Migration chain for is_benchmark", () => {
  it("should include applyIsBenchmarkMigration in the migration chain", () => {
    expect(MIGRATION_CHAIN).toContain("applyIsBenchmarkMigration");
  });
});
