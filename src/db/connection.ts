import { execa } from "execa";
import { ResultAsync, err, errAsync, ok } from "neverthrow";
import { AppError, ErrorCode, buildError } from "../domain/errors";

const PROTECTED_TABLES = ["plan", "task", "edge", "event"];
const destructivePattern =
  /\b(DELETE\s+FROM|DROP\s+TABLE|TRUNCATE\s+TABLE?)\s+[`]?(\w+)[`]?/i;

export function doltSql(
  query: string,
  repoPath: string,
): ResultAsync<any[], AppError> {
  const match = query.match(destructivePattern);
  if (match && PROTECTED_TABLES.includes(match[2].toLowerCase())) {
    return errAsync(
      buildError(
        ErrorCode.VALIDATION_FAILED,
        `Hard deletes are forbidden on table '${match[2]}'. Use tg cancel for soft-delete.`,
      ),
    );
  }
  return ResultAsync.fromPromise(
    execa(process.env.DOLT_PATH || "dolt", ["sql", "-q", query, "-r", "json"], {
      cwd: repoPath,
    }),
    (e) =>
      buildError(
        ErrorCode.DB_QUERY_FAILED,
        `Dolt SQL query failed: ${query}`,
        e,
      ),
  ).andThen((result) => {
    const out = (result.stdout || "").trim();
    if (!out) return ok([]); // DML (INSERT/UPDATE/DELETE) returns no JSON
    try {
      const parsed = JSON.parse(out);
      return ok(parsed?.rows ?? []);
    } catch (e) {
      return err(
        buildError(
          ErrorCode.DB_PARSE_FAILED,
          `Failed to parse Dolt SQL output: ${result.stdout}`,
          e,
        ),
      );
    }
  });
}
