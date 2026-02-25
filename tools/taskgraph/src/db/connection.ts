import { execa } from "execa";
import { ResultAsync, err, ok } from "neverthrow";
import { AppError, ErrorCode, buildError } from "../domain/errors";

export function doltSql(
  query: string,
  repoPath: string,
): ResultAsync<any[], AppError> {
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
