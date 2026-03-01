#!/usr/bin/env bun
import { performance } from "perf_hooks";
import { spawnSync } from "node:child_process";

type Result = { command: string; durationMs: number; exitCode: number };

function main() {
  const commands = process.argv.slice(2);
  if (commands.length === 0) {
    console.error("Usage: run-benchmark.ts <command> [<command>...]");
    process.exit(1);
  }
  const results: Result[] = [];
  for (const cmd of commands) {
    const args = cmd.split(" ");
    const start = performance.now();
    const proc = spawnSync(args[0], args.slice(1), { stdio: "ignore" });
    const durationMs = performance.now() - start;
    results.push({
      command: cmd,
      durationMs: Math.round(durationMs),
      exitCode: proc.status ?? -1,
    });
  }
  console.log(JSON.stringify(results, null, 2));
}

main();