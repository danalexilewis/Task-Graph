#!/usr/bin/env bun
/**
 * Agent events collector. Watches terminals dir, parses [tg:event] lines, inserts into SQLite.
 * Run via: bun scripts/collect-agent-events.ts --dir <path> --db <path> [--interval <ms>]
 */

import * as path from "node:path";
import { runCollectorWithDb } from "../src/agent-context/collector";

function parseArgs(): {
  dir: string;
  db: string;
  interval: number;
} {
  const args = process.argv.slice(2);
  let dir = "";
  let db = "";
  let interval = 500;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dir" && args[i + 1]) {
      dir = args[++i];
    } else if (args[i] === "--db" && args[i + 1]) {
      db = args[++i];
    } else if (args[i] === "--interval" && args[i + 1]) {
      interval = parseInt(args[++i], 10) || 500;
    }
  }

  if (!dir || !db) {
    console.error(
      "Usage: bun scripts/collect-agent-events.ts --dir <terminalsDir> --db <dbPath> [--interval <ms>]",
    );
    process.exit(1);
  }

  return { dir: path.resolve(dir), db: path.resolve(db), interval };
}

const { dir, db, interval } = parseArgs();

console.log(`[collector] Started. Watching ${dir}`);
await runCollectorWithDb({
  terminalsDir: dir,
  dbPath: db,
  pollIntervalMs: interval,
});
