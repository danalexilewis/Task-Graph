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
  plan_name: string | null;
  plan_overview: string | null;
  docs: string[];
  skills: string[];
  change_type: string | null;
  suggested_changes: string | null;
  file_tree: string | null;
  risks: unknown;
  doc_paths: string[];
  skill_docs: string[];
  immediate_blockers: Array<{
    task_id: string;
    title: string;
    status: string;
    evidence?: string | null;
  }>;
}

const FILE_TREE_TRIM_LENGTH = 500;
const EVIDENCE_TRIM_LENGTH = 100;

/**
 * Compacts context when it exceeds the token budget.
 * Stage 1: trim immediate_blocker evidence to EVIDENCE_TRIM_LENGTH chars.
 * Stage 2: truncate file_tree to FILE_TREE_TRIM_LENGTH chars.
 * Stage 3: drop file_tree entirely.
 */
export function compactContext(
  ctx: ContextOutput,
  budget: number,
): ContextOutput {
  let est = estimateJsonTokens(ctx);
  if (est <= budget) return ctx;

  const stage1: ContextOutput = {
    ...ctx,
    immediate_blockers: ctx.immediate_blockers.map((b) => ({
      ...b,
      evidence:
        b.evidence != null && b.evidence.length > EVIDENCE_TRIM_LENGTH
          ? `${b.evidence.slice(0, EVIDENCE_TRIM_LENGTH)}…`
          : b.evidence,
    })),
  };
  est = estimateJsonTokens(stage1);
  if (est <= budget) return stage1;

  const stage2: ContextOutput = {
    ...stage1,
    file_tree:
      stage1.file_tree != null &&
      stage1.file_tree.length > FILE_TREE_TRIM_LENGTH
        ? `${stage1.file_tree.slice(0, FILE_TREE_TRIM_LENGTH)}…`
        : stage1.file_tree,
  };
  est = estimateJsonTokens(stage2);
  if (est <= budget) return stage2;

  return { ...stage2, file_tree: null };
}
