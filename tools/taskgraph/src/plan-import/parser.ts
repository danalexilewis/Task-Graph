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
}

export interface ParsedPlan {
  planTitle: string | null;
  planIntent: string | null;
  tasks: ParsedTask[];
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
      .filter((t): t is CursorTodo => t != null && typeof t === "object" && typeof t.id === "string" && typeof t.content === "string")
      .map((t) => {
        const status = t.status === "completed" ? ("done" as const) : ("todo" as const);
        return {
          stableKey: t.id,
          title: t.content,
          blockedBy: Array.isArray(t.blockedBy) ? t.blockedBy : [],
          acceptance: [],
          status,
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
