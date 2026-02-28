/**
 * Token estimation using chars/4 heuristic (rough approximation for LLM context).
 */
export function estimateTokens(text: string): number {
  return Math.floor(text.length / 4);
}

/**
 * Estimates tokens for JSON-serializable values by stringifying then applying chars/4.
 */
export function estimateJsonTokens(obj: unknown): number {
  if (obj === null || obj === undefined) {
    return 0;
  }
  return estimateTokens(JSON.stringify(obj));
}

/** Shape of `tg context --json` output; used for compaction. */
export interface ContextOutput {
  task_id: string;
  title: string;
  agent: string | null;
  docs: string[];
  skills: string[];
  change_type: string | null;
  suggested_changes: string | null;
  file_tree: string | null;
  risks: unknown;
  doc_paths: string[];
  skill_docs: string[];
  related_done_by_doc: Array<{
    task_id: string;
    title: string;
    plan_id?: string;
  }>;
  related_done_by_skill: Array<{
    task_id: string;
    title: string;
    plan_id?: string;
  }>;
}

const SLIM_RELATED_COUNT = 3;

/**
 * Compacts related_done lists when context exceeds the token budget.
 * Stage 1: slim to SLIM_RELATED_COUNT items, { task_id, title } only.
 * Stage 2: reduce to 1 item each.
 * Stage 3: drop related lists entirely.
 */
export function compactContext(
  ctx: ContextOutput,
  budget: number,
): ContextOutput {
  let est = estimateJsonTokens(ctx);
  if (est <= budget) return ctx;

  const slim = (list: ContextOutput["related_done_by_doc"]) =>
    list.slice(0, SLIM_RELATED_COUNT).map((t) => ({
      task_id: t.task_id,
      title: t.title,
    }));

  const stage1: ContextOutput = {
    ...ctx,
    related_done_by_doc: slim(ctx.related_done_by_doc),
    related_done_by_skill: slim(ctx.related_done_by_skill),
  };
  est = estimateJsonTokens(stage1);
  if (est <= budget) return stage1;

  const stage2: ContextOutput = {
    ...stage1,
    related_done_by_doc: stage1.related_done_by_doc.slice(0, 1),
    related_done_by_skill: stage1.related_done_by_skill.slice(0, 1),
  };
  est = estimateJsonTokens(stage2);
  if (est <= budget) return stage2;

  return {
    ...stage2,
    related_done_by_doc: [],
    related_done_by_skill: [],
  };
}
