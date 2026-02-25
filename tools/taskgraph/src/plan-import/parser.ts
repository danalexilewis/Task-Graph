import { readFileSync } from "fs";
import yaml from "js-yaml";
import { Result, ok, err } from "neverthrow";
import { AppError, ErrorCode, buildError } from "../domain/errors";

export interface ParsedTask {
  stableKey: string;
  title: string;
  feature?: string;
  area?: string;
  blockedBy: string[];
  acceptance: string[];
  /** Mapped from Cursor todo status: completed→done, pending/other→todo */
  status?: "todo" | "done";
  /** Maps to docs/<domain>.md */
  domain?: string;
  /** Maps to docs/skills/<skill>.md */
  skill?: string;
  /** How to approach the work: create, modify, refactor, fix, investigate, test, document */
  changeType?:
    | "create"
    | "modify"
    | "refactor"
    | "fix"
    | "investigate"
    | "test"
    | "document";
}

export interface ParsedPlan {
  planTitle: string | null;
  planIntent: string | null;
  tasks: ParsedTask[];
}

const CHANGE_TYPES = [
  "create",
  "modify",
  "refactor",
  "fix",
  "investigate",
  "test",
  "document",
] as const;
function isChangeType(s: unknown): s is (typeof CHANGE_TYPES)[number] {
  return (
    typeof s === "string" &&
    CHANGE_TYPES.includes(s as (typeof CHANGE_TYPES)[number])
  );
}

export function parsePlanMarkdown(
  filePath: string,
): Result<ParsedPlan, AppError> {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    let planTitle: string | null = null;
    let planIntent: string | null = null;
    const tasks: ParsedTask[] = [];
    let currentTask: Partial<ParsedTask> | null = null;
    let inAcceptanceBlock = false;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (line.startsWith("# ")) {
        planTitle = line.substring(2).trim();
      } else if (line.startsWith("INTENT:")) {
        planIntent = line.substring("INTENT:".length).trim();
      } else if (trimmedLine.startsWith("TASK:")) {
        if (currentTask && currentTask.stableKey) {
          tasks.push(currentTask as ParsedTask);
        }
        currentTask = {
          stableKey: trimmedLine.substring("TASK:".length).trim(),
          blockedBy: [],
          acceptance: [],
        };
        inAcceptanceBlock = false;
      } else if (currentTask && trimmedLine.startsWith("TITLE:")) {
        currentTask.title = trimmedLine.substring("TITLE:".length).trim();
        inAcceptanceBlock = false;
      } else if (currentTask && trimmedLine.startsWith("FEATURE:")) {
        currentTask.feature = trimmedLine.substring("FEATURE:".length).trim();
        inAcceptanceBlock = false;
      } else if (currentTask && trimmedLine.startsWith("AREA:")) {
        currentTask.area = trimmedLine.substring("AREA:".length).trim();
        inAcceptanceBlock = false;
      } else if (currentTask && trimmedLine.startsWith("DOMAIN:")) {
        currentTask.domain = trimmedLine.substring("DOMAIN:".length).trim();
        inAcceptanceBlock = false;
      } else if (currentTask && trimmedLine.startsWith("SKILL:")) {
        currentTask.skill = trimmedLine.substring("SKILL:".length).trim();
        inAcceptanceBlock = false;
      } else if (currentTask && trimmedLine.startsWith("CHANGE_TYPE:")) {
        const val = trimmedLine.substring("CHANGE_TYPE:".length).trim();
        if (isChangeType(val)) currentTask.changeType = val;
        inAcceptanceBlock = false;
      } else if (currentTask && trimmedLine.startsWith("BLOCKED_BY:")) {
        const blockers = trimmedLine
          .substring("BLOCKED_BY:".length)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        currentTask.blockedBy = [...(currentTask.blockedBy || []), ...blockers];
        inAcceptanceBlock = false;
      } else if (currentTask && trimmedLine.startsWith("ACCEPTANCE:")) {
        inAcceptanceBlock = true;
      } else if (
        currentTask &&
        inAcceptanceBlock &&
        trimmedLine.startsWith("-")
      ) {
        currentTask.acceptance = [
          ...(currentTask.acceptance || []),
          trimmedLine.substring(1).trim(),
        ];
      } else {
        inAcceptanceBlock = false;
      }
    }

    if (currentTask && currentTask.stableKey) {
      tasks.push(currentTask as ParsedTask);
    }

    return ok({ planTitle, planIntent, tasks });
  } catch (e) {
    return err(
      buildError(
        ErrorCode.FILE_READ_FAILED,
        `Failed to read or parse markdown file at ${filePath}`,
        e,
      ),
    );
  }
}

interface CursorTodo {
  id: string;
  content: string;
  status?: string;
  blockedBy?: string[];
  domain?: string;
  skill?: string;
  changeType?: string;
}

interface CursorFrontmatter {
  name?: string;
  overview?: string;
  todos?: CursorTodo[];
}

/** Parses a Cursor Plan file (YAML frontmatter with todos). */
export function parseCursorPlan(
  filePath: string,
): Result<ParsedPlan, AppError> {
  try {
    const content = readFileSync(filePath, "utf-8");
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      return err(
        buildError(
          ErrorCode.FILE_READ_FAILED,
          `File ${filePath} does not have YAML frontmatter (--- ... ---)`,
        ),
      );
    }

    const parsed = yaml.load(frontmatterMatch[1]) as CursorFrontmatter | null;
    if (!parsed || typeof parsed !== "object") {
      return err(
        buildError(
          ErrorCode.FILE_READ_FAILED,
          `Invalid YAML frontmatter in ${filePath}`,
        ),
      );
    }

    const todos = parsed.todos ?? [];
    if (!Array.isArray(todos)) {
      return err(
        buildError(
          ErrorCode.FILE_READ_FAILED,
          `Expected 'todos' to be an array in ${filePath}`,
        ),
      );
    }

    const tasks: ParsedTask[] = todos
      .filter(
        (t): t is CursorTodo =>
          t != null &&
          typeof t === "object" &&
          typeof t.id === "string" &&
          typeof t.content === "string",
      )
      .map((t) => {
        const status =
          t.status === "completed" ? ("done" as const) : ("todo" as const);
        const changeType =
          t.changeType != null && isChangeType(t.changeType)
            ? t.changeType
            : undefined;
        return {
          stableKey: t.id,
          title: t.content,
          blockedBy: Array.isArray(t.blockedBy) ? t.blockedBy : [],
          acceptance: [],
          status,
          domain: typeof t.domain === "string" ? t.domain : undefined,
          skill: typeof t.skill === "string" ? t.skill : undefined,
          changeType,
        };
      });

    return ok({
      planTitle: parsed.name ?? null,
      planIntent: parsed.overview ?? null,
      tasks,
    });
  } catch (e) {
    return err(
      buildError(
        ErrorCode.FILE_READ_FAILED,
        `Failed to read or parse Cursor plan at ${filePath}`,
        e,
      ),
    );
  }
}
