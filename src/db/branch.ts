import { execa } from "execa";
import { ResultAsync } from "neverthrow";
import { type AppError, buildError, ErrorCode } from "../domain/errors";

const doltPath = () => process.env.DOLT_PATH || "dolt";

const doltEnv = () => ({ ...process.env, DOLT_READ_ONLY: "false" });

/**
 * Create a new branch in the Dolt repo. Branch is created from current HEAD.
 */
export function createBranch(
  repoPath: string,
  branchName: string,
): ResultAsync<void, AppError> {
  return ResultAsync.fromPromise(
    execa(doltPath(), ["--data-dir", repoPath, "branch", branchName], {
      cwd: repoPath,
      env: doltEnv(),
    }),
    (e) =>
      buildError(
        ErrorCode.DB_QUERY_FAILED,
        `Dolt branch create failed: ${branchName}`,
        e,
      ),
  ).map(() => undefined);
}

/**
 * Check out an existing branch in the Dolt repo.
 */
export function checkoutBranch(
  repoPath: string,
  branchName: string,
): ResultAsync<void, AppError> {
  return ResultAsync.fromPromise(
    execa(doltPath(), ["--data-dir", repoPath, "checkout", branchName], {
      cwd: repoPath,
      env: doltEnv(),
    }),
    (e) =>
      buildError(
        ErrorCode.DB_QUERY_FAILED,
        `Dolt checkout failed: ${branchName}`,
        e,
      ),
  ).map(() => undefined);
}
