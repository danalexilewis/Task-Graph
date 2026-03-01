#!/usr/bin/env bun
import { performance } from "perf_hooks";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "fs";

type Result = { command: string; durationMs: number; exitCode: number };

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: run-benchmark.ts <output-file> <command> [<command>...]");
    process.exit(1);
  }
  const outputFile = args[0];
  const commands = args.slice(1);
  const results: Result[] = [];
  for (const cmd of commands) {
    const parts = cmd.split(" ");
    const start = performance.now();
    const proc = spawnSync(parts[0], parts.slice(1), { stdio: "ignore" });
    const durationMs = performance.now() - start;
    results.push({
      command: cmd,
      durationMs: Math.round(durationMs),
      exitCode: proc.status ?? -1,
    });
  }
  const output = JSON.stringify(results, null, 2);
  writeFileSync(outputFile, output);
  console.log(output);
}

main();
