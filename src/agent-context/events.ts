/**
 * Event parsing for agent-context. Used by collector (Bun scripts only).
 */

import { err, ok, type Result } from "neverthrow";
import { type AppError, buildError, ErrorCode } from "../domain/errors";

export type EventKind =
  | "tg_start"
  | "tg_done"
  | "tg_note"
  | "file_write"
  | "search"
  | "custom";

export interface AgentEvent {
  id?: string;
  agent: string;
  parent?: string;
  taskId?: string;
  kind: EventKind | string;
  payload: Record<string, unknown>;
  ts: number;
}

const EVENT_PREFIX = "[tg:event] ";

/**
 * Parse a line matching [tg:event] <JSON>. Returns Err for malformed lines.
 */
export function parseEventLine(line: string): Result<AgentEvent, AppError> {
  const trimmed = line.trimEnd();
  if (!trimmed.startsWith(EVENT_PREFIX)) {
    return err(
      buildError(
        ErrorCode.VALIDATION_FAILED,
        `Line does not start with ${EVENT_PREFIX}`,
      ),
    );
  }
  const jsonStr = trimmed.slice(EVENT_PREFIX.length).trim();
  if (!jsonStr) {
    return err(
      buildError(ErrorCode.VALIDATION_FAILED, "Missing JSON after [tg:event]"),
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    return err(
      buildError(
        ErrorCode.VALIDATION_FAILED,
        `Invalid JSON after [tg:event]: ${(e as Error).message}`,
        e,
      ),
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return err(
      buildError(ErrorCode.VALIDATION_FAILED, "Event must be a JSON object"),
    );
  }
  const obj = parsed as Record<string, unknown>;
  const kind = obj.kind;
  if (typeof kind !== "string" || !kind) {
    return err(
      buildError(ErrorCode.VALIDATION_FAILED, "Event must have a non-empty kind"),
    );
  }
  const ts = obj.ts;
  if (typeof ts !== "number" || !Number.isFinite(ts)) {
    return err(
      buildError(ErrorCode.VALIDATION_FAILED, "Event must have a numeric ts"),
    );
  }
  const agent =
    typeof obj.agent === "string" && obj.agent
      ? obj.agent
      : obj.agent != null
        ? String(obj.agent)
        : "unknown";
  const taskId =
    typeof obj.taskId === "string" ? obj.taskId : undefined;
  const payload = { ...obj };
  delete payload.kind;
  delete payload.ts;
  delete payload.agent;
  delete payload.taskId;
  delete payload.parent;
  delete payload.id;

  return ok({
    agent,
    taskId,
    kind,
    payload,
    ts,
    parent: typeof obj.parent === "string" ? obj.parent : undefined,
  });
}
