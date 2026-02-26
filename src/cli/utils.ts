import { readFileSync, writeFileSync, existsSync } from "fs";
import * as path from "path";
import type { Command } from "commander";
import { Result, ok, err } from "neverthrow";
import { AppError, ErrorCode, buildError } from "../domain/errors";

const TASKGRAPH_DIR = ".taskgraph";

/**
 * Normalize raw string[] from Commander (variadic args) into a flat list of IDs.
 * Splits each element on comma, trims, drops empty strings.
 * Callers should exit with a clear error if the result is empty.
 */
export function parseIdList(raw: string[]): string[] {
  return raw.flatMap((s) =>
    s
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  );
}

/** Walk to root command to access global options like --json */
export function rootOpts(cmd: Command): { json?: boolean; noCommit?: boolean } {
  let c: Command | undefined = cmd;
  while (c?.parent) c = c.parent;
  return (c?.opts?.() ?? {}) as { json?: boolean; noCommit?: boolean };
}
const CONFIG_FILE = path.join(TASKGRAPH_DIR, "config.json");

export interface Config {
  doltRepoPath: string;
  learningMode?: boolean;
}

export function readConfig(basePath?: string): Result<Config, AppError> {
  const configPath = path.join(basePath ?? process.cwd(), CONFIG_FILE);
  if (!existsSync(configPath)) {
    return err(
      buildError(
        ErrorCode.CONFIG_NOT_FOUND,
        `Config file not found at ${configPath}. Please run 'tg init' first.`,
      ),
    );
  }
  try {
    const configContents = readFileSync(configPath, "utf-8");
    return ok(JSON.parse(configContents));
  } catch (e) {
    return err(
      buildError(
        ErrorCode.CONFIG_PARSE_FAILED,
        `Failed to parse config file at ${configPath}`,
        e,
      ),
    );
  }
}

export function writeConfig(
  config: Config,
  basePath?: string,
): Result<void, AppError> {
  const configPath = path.join(basePath ?? process.cwd(), CONFIG_FILE);
  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    return ok(undefined);
  } catch (e) {
    return err(
      buildError(
        ErrorCode.CONFIG_PARSE_FAILED,
        `Failed to write config file to ${configPath}`,
        e,
      ),
    );
  }
}
