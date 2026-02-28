import { describe, expect, it } from "bun:test";
import { TaskTemplateSchema } from "../../src/domain/template-schema";

describe("template-schema", () => {
  describe("TaskTemplateSchema", () => {
    it("parses a minimal valid template (name + title)", () => {
      const valid = {
        name: "fix-bug",
        title: "Fix the bug in {{area}}",
      };
      expect(TaskTemplateSchema.parse(valid)).toEqual({
        name: "fix-bug",
        title: "Fix the bug in {{area}}",
        owner: "agent",
        risk: "low",
      });
    });

    it("parses a full valid template", () => {
      const valid = {
        name: "feature-task",
        description: "Standard feature implementation task",
        title: "Implement {{feature}}",
        intent: "Deliver the feature per spec.",
        scope_in: "Code in src/",
        scope_out: "No docs changes",
        acceptance: ["Tests pass", "Lint clean"],
        owner: "agent",
        risk: "medium",
        change_type: "create",
      };
      expect(TaskTemplateSchema.parse(valid)).toEqual(valid);
    });

    it("rejects missing name", () => {
      const invalid = { title: "Some task" };
      expect(() => TaskTemplateSchema.parse(invalid)).toThrow();
    });

    it("rejects missing title", () => {
      const invalid = { name: "my-template" };
      expect(() => TaskTemplateSchema.parse(invalid)).toThrow();
    });

    it("rejects empty name", () => {
      const invalid = { name: "", title: "Task" };
      expect(() => TaskTemplateSchema.parse(invalid)).toThrow();
    });

    it("rejects empty title", () => {
      const invalid = { name: "t", title: "" };
      expect(() => TaskTemplateSchema.parse(invalid)).toThrow();
    });

    it("rejects invalid owner", () => {
      const invalid = {
        name: "t",
        title: "Task",
        owner: "robot",
      };
      expect(() => TaskTemplateSchema.parse(invalid)).toThrow();
    });

    it("rejects invalid risk", () => {
      const invalid = {
        name: "t",
        title: "Task",
        risk: "critical",
      };
      expect(() => TaskTemplateSchema.parse(invalid)).toThrow();
    });

    it("rejects invalid change_type", () => {
      const invalid = {
        name: "t",
        title: "Task",
        change_type: "delete",
      };
      expect(() => TaskTemplateSchema.parse(invalid)).toThrow();
    });

    it("rejects name over 64 chars", () => {
      const invalid = {
        name: "a".repeat(65),
        title: "Task",
      };
      expect(() => TaskTemplateSchema.parse(invalid)).toThrow();
    });

    it("rejects title over 255 chars", () => {
      const invalid = {
        name: "t",
        title: "a".repeat(256),
      };
      expect(() => TaskTemplateSchema.parse(invalid)).toThrow();
    });

    it("accepts name with max length 64", () => {
      const valid = { name: "a".repeat(64), title: "Task" };
      expect(TaskTemplateSchema.parse(valid).name).toBe("a".repeat(64));
    });

    it("accepts title with max length 255", () => {
      const valid = { name: "t", title: "a".repeat(255) };
      expect(TaskTemplateSchema.parse(valid).title).toBe("a".repeat(255));
    });

    it("strips unknown extra fields", () => {
      const input = {
        name: "t",
        title: "Task",
        extra: "ignored",
        unknown_key: 123,
      };
      const parsed = TaskTemplateSchema.parse(input);
      expect(parsed).not.toHaveProperty("extra");
      expect(parsed).not.toHaveProperty("unknown_key");
      expect(parsed.name).toBe("t");
      expect(parsed.title).toBe("Task");
    });

    it("accepts valid owner enum values", () => {
      expect(
        TaskTemplateSchema.parse({ name: "t", title: "T", owner: "human" })
          .owner,
      ).toBe("human");
      expect(
        TaskTemplateSchema.parse({ name: "t", title: "T", owner: "agent" })
          .owner,
      ).toBe("agent");
    });

    it("accepts valid risk enum values", () => {
      expect(
        TaskTemplateSchema.parse({ name: "t", title: "T", risk: "low" }).risk,
      ).toBe("low");
      expect(
        TaskTemplateSchema.parse({ name: "t", title: "T", risk: "medium" })
          .risk,
      ).toBe("medium");
      expect(
        TaskTemplateSchema.parse({ name: "t", title: "T", risk: "high" }).risk,
      ).toBe("high");
    });

    it("accepts valid change_type enum values", () => {
      const types = [
        "create",
        "modify",
        "refactor",
        "fix",
        "investigate",
        "test",
        "document",
      ] as const;
      for (const ct of types) {
        expect(
          TaskTemplateSchema.parse({ name: "t", title: "T", change_type: ct })
            .change_type,
        ).toBe(ct);
      }
    });

    it("accepts omitted optional fields (minimal valid)", () => {
      const parsed = TaskTemplateSchema.parse({
        name: "min",
        title: "Minimal",
      });
      expect(parsed.description).toBeUndefined();
      expect(parsed.intent).toBeUndefined();
      expect(parsed.scope_in).toBeUndefined();
      expect(parsed.scope_out).toBeUndefined();
      expect(parsed.acceptance).toBeUndefined();
      expect(parsed.change_type).toBeUndefined();
    });

    it("accepts description at max length 512", () => {
      const valid = { name: "t", title: "T", description: "d".repeat(512) };
      expect(TaskTemplateSchema.parse(valid).description).toBe("d".repeat(512));
    });

    it("rejects description over 512 chars", () => {
      const invalid = { name: "t", title: "T", description: "d".repeat(513) };
      expect(() => TaskTemplateSchema.parse(invalid)).toThrow();
    });

    it("accepts intent at max length 2048", () => {
      const valid = { name: "t", title: "T", intent: "i".repeat(2048) };
      expect(TaskTemplateSchema.parse(valid).intent).toBe("i".repeat(2048));
    });

    it("rejects intent over 2048 chars", () => {
      const invalid = { name: "t", title: "T", intent: "i".repeat(2049) };
      expect(() => TaskTemplateSchema.parse(invalid)).toThrow();
    });

    it("accepts acceptance item at max length 512", () => {
      const valid = { name: "t", title: "T", acceptance: ["a".repeat(512)] };
      expect(TaskTemplateSchema.parse(valid).acceptance).toEqual([
        "a".repeat(512),
      ]);
    });

    it("rejects acceptance item over 512 chars", () => {
      const invalid = { name: "t", title: "T", acceptance: ["a".repeat(513)] };
      expect(() => TaskTemplateSchema.parse(invalid)).toThrow();
    });

    it("accepts empty acceptance array", () => {
      const valid = { name: "t", title: "T", acceptance: [] };
      expect(TaskTemplateSchema.parse(valid).acceptance).toEqual([]);
    });
  });
});
