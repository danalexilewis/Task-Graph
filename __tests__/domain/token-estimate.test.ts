import { describe, expect, it } from "vitest";
import {
  type ContextOutput,
  compactContext,
  estimateJsonTokens,
  estimateTokens,
} from "../../src/domain/token-estimate";

describe("token-estimate", () => {
  describe("estimateTokens", () => {
    it("estimates ~chars/4 for known strings", () => {
      const str = "hello"; // 5 chars -> ~1 token
      expect(estimateTokens(str)).toBe(1);

      const longer = "abcdefgh"; // 8 chars -> 2 tokens
      expect(estimateTokens(longer)).toBe(2);

      const exact = "abcd"; // 4 chars -> 1 token
      expect(estimateTokens(exact)).toBe(1);
    });

    it("returns 0 for empty string", () => {
      expect(estimateTokens("")).toBe(0);
    });

    it("handles unicode and whitespace", () => {
      const withSpaces = "foo bar"; // 7 chars -> 1 (floor of 7/4)
      expect(estimateTokens(withSpaces)).toBeGreaterThanOrEqual(1);
    });
  });

  describe("estimateJsonTokens", () => {
    it("estimates nested objects via stringified length", () => {
      const nested = { a: 1, b: { c: 2, d: { e: 3 } } };
      const tokens = estimateJsonTokens(nested);
      expect(tokens).toBeGreaterThan(0);
      // Stringified: {"a":1,"b":{"c":2,"d":{"e":3}}}
      expect(tokens).toBe(Math.floor(JSON.stringify(nested).length / 4));
    });

    it("handles null", () => {
      expect(estimateJsonTokens(null)).toBe(0);
    });

    it("handles empty object", () => {
      const obj = {};
      expect(estimateJsonTokens(obj)).toBe(
        Math.floor(JSON.stringify(obj).length / 4),
      );
    });

    it("handles very large objects", () => {
      const large: Record<string, string> = {};
      for (let i = 0; i < 1000; i++) {
        large[`key${i}`] = "x".repeat(50);
      }
      const tokens = estimateJsonTokens(large);
      expect(tokens).toBeGreaterThan(1000);
      expect(tokens).toBe(Math.floor(JSON.stringify(large).length / 4));
    });
  });

  describe("compactContext", () => {
    const baseCtx = (overrides?: Partial<ContextOutput>): ContextOutput => ({
      task_id: "tid",
      title: "Task",
      agent: null,
      docs: [],
      skills: [],
      change_type: null,
      suggested_changes: null,
      file_tree: null,
      risks: null,
      doc_paths: [],
      skill_docs: [],
      related_done_by_doc: [
        { task_id: "d1", title: "Done 1", plan_id: "p1" },
        { task_id: "d2", title: "Done 2", plan_id: "p2" },
        { task_id: "d3", title: "Done 3", plan_id: "p3" },
        { task_id: "d4", title: "Done 4", plan_id: "p4" },
      ],
      related_done_by_skill: [
        { task_id: "s1", title: "Skill 1", plan_id: "p1" },
        { task_id: "s2", title: "Skill 2", plan_id: "p2" },
      ],
      ...overrides,
    });

    it("returns context unchanged when under budget", () => {
      const ctx = baseCtx();
      const budget = estimateJsonTokens(ctx) + 1000;
      const out = compactContext(ctx, budget);
      expect(out).toEqual(ctx);
      expect(out.related_done_by_doc).toHaveLength(4);
      expect(out.related_done_by_doc[0]).toHaveProperty("plan_id", "p1");
    });

    it("stage 1: slims related lists to 3 items with task_id and title only", () => {
      const ctx = baseCtx();
      const stage1 = {
        ...ctx,
        related_done_by_doc: ctx.related_done_by_doc
          .slice(0, 3)
          .map((t) => ({ task_id: t.task_id, title: t.title })),
        related_done_by_skill: ctx.related_done_by_skill
          .slice(0, 3)
          .map((t) => ({ task_id: t.task_id, title: t.title })),
      };
      const budget = estimateJsonTokens(stage1) + 5;
      const out = compactContext(ctx, budget);
      expect(out.related_done_by_doc).toHaveLength(3);
      expect(out.related_done_by_skill).toHaveLength(2);
      expect(out.related_done_by_doc[0]).toEqual({
        task_id: "d1",
        title: "Done 1",
      });
      expect(out.related_done_by_doc[0]).not.toHaveProperty("plan_id");
      expect(estimateJsonTokens(out)).toBeLessThanOrEqual(budget);
    });

    it("stage 2: reduces to 1 item each when stage 1 still over budget", () => {
      const ctx = baseCtx();
      const stage1 = compactContext(ctx, 10000);
      const stage2Ctx: ContextOutput = {
        ...stage1,
        related_done_by_doc: stage1.related_done_by_doc.slice(0, 1),
        related_done_by_skill: stage1.related_done_by_skill.slice(0, 1),
      };
      const stage2Size = estimateJsonTokens(stage2Ctx) + 1;
      const stage1Size = estimateJsonTokens(stage1);
      const budget = Math.min(stage2Size + 10, stage1Size - 1);
      const out = compactContext(ctx, budget);
      expect(out.related_done_by_doc).toHaveLength(1);
      expect(out.related_done_by_skill).toHaveLength(1);
      expect(estimateJsonTokens(out)).toBeLessThanOrEqual(budget);
    });

    it("stage 3: clears related lists when still over budget", () => {
      const ctx = baseCtx({
        suggested_changes: "x".repeat(500),
        file_tree: "y".repeat(500),
      });
      const out = compactContext(ctx, 50);
      expect(out.related_done_by_doc).toHaveLength(0);
      expect(out.related_done_by_skill).toHaveLength(0);
      expect(estimateJsonTokens(out)).toBeLessThan(estimateJsonTokens(ctx));
    });
  });
});
