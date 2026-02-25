import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execa, ExecaError } from "execa";
import { applyMigrations } from "../../src/db/migrate";
import { writeConfig } from "../../src/cli/utils";
import { Config } from "../../src/cli/utils";
import { doltSql } from "../../src/db/connection";

export interface IntegrationTestContext {
  tempDir: string;
  doltRepoPath: string;
  cliPath: string;
}

const DOLT_PATH = process.env.DOLT_PATH || "dolt";
if (!process.env.DOLT_PATH) process.env.DOLT_PATH = DOLT_PATH;

export async function setupIntegrationTest(): Promise<IntegrationTestContext> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-integration-"));
  const doltRepoPath = path.join(tempDir, ".taskgraph", "dolt");
  const cliPath = path.resolve(__dirname, "../../dist/src/cli/index.js");

  // Create .taskgraph/dolt directory
  fs.mkdirSync(doltRepoPath, { recursive: true });

  // Initialize Dolt repo (use DOLT_PATH so CI/local match)
  await execa(DOLT_PATH, ["init"], {
    cwd: doltRepoPath,
    env: { ...process.env, DOLT_PATH },
  });

  // Write config
  writeConfig({ doltRepoPath: doltRepoPath }, tempDir)._unsafeUnwrap(); // Corrected signature

  // Apply migrations
  (await applyMigrations(doltRepoPath))._unsafeUnwrap();

  return { tempDir, doltRepoPath, cliPath };
}

export function teardownIntegrationTest(tempDir: string) {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// Helper to run CLI commands in the integration test context
export async function runTgCli(
  command: string,
  cwd: string,
  expectError = false,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const cliPath = path.resolve(__dirname, "../../dist/src/cli/index.js");
  const TG_BIN = `node ${cliPath} `;
  try {
    const result = await execa(TG_BIN + command, {
      cwd,
      shell: true,
      env: { ...process.env, DOLT_PATH },
    });
    const stdout = result.stdout;
    const stderr = result.stderr;
    const exitCode = result.exitCode ?? 0; // Explicit handling
    if (expectError && exitCode === 0) {
      throw new Error(
        `Expected command to fail but it succeeded. Output: ${stdout}, Error: ${stderr}`,
      );
    }
    if (!expectError && exitCode !== 0) {
      throw new Error(
        `Command failed unexpectedly. Exit Code: ${exitCode}, Output: ${result.stdout}, Error: ${result.stderr}`,
      );
    }
    return { stdout: result.stdout, stderr: result.stderr, exitCode };
  } catch (error: unknown) {
    const execaError = error as ExecaError;
    if (expectError) {
      return {
        stdout: execaError.stdout?.toString() || "",
        stderr: execaError.stderr?.toString() || execaError.message,
        exitCode: execaError.exitCode ?? 1,
      };
    }
    throw error;
  }
}
