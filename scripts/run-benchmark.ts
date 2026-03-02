#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

interface Result {
  command: string;
  durationMs: number;
  exitCode: number;
}

function main() {
  const args = process.argv.slice(2);
  const csv = args[0] === "--csv" || args[0] === "-c";
  const commands = csv ? args.slice(1) : args;
  if (commands.length < 1) {
    console.error(
      "Usage: run-benchmark.ts [--csv|-c] <command> [<command>...]",
    );
    process.exit(1);
  }
  const results: Result[] = [];
  for (const cmd of commands) {
    const parts = cmd.split(" ");
    const start = performance.now();
    const proc = spawnSync(parts[0], parts.slice(1), { stdio: "ignore" });
    const durationMs = Math.round(performance.now() - start);
    results.push({
      command: cmd,
      durationMs,
      exitCode: proc.status ?? -1,
    });
  }
  if (csv) {
    console.log("command,durationMs,exitCode");
    for (const r of results) {
      console.log(`${r.command},${r.durationMs},${r.exitCode}`);
    }
  } else {
    console.log(JSON.stringify(results, null, 2));
  }
}

main();
