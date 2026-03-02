import { describe, expect, it } from "vitest";
import { MIGRATION_CHAIN } from "../../src/db/migrate";

describe("Migration chain", () => {
  it("exports MIGRATION_CHAIN and includes initiative/project migrations", () => {
    expect(MIGRATION_CHAIN).toContain("applyInitiativeMigration");
    expect(MIGRATION_CHAIN).toContain("applyPlanToProjectRenameMigration");
    expect(MIGRATION_CHAIN).toContain("applyDefaultInitiativeMigration");
  });

  it("includes applyEventKindIndex as the final migration", () => {
    expect(MIGRATION_CHAIN).toContain("applyEventKindIndex");
    expect(MIGRATION_CHAIN[MIGRATION_CHAIN.length - 1]).toBe(
      "applyEventKindIndex",
    );
  });
});
