#!/usr/bin/env bun
/**
 * Query agent events from SQLite. Outputs JSON to stdout.
 * Run via: bun scripts/query-agent-events.ts --db <path> [--since <ms>] [--agent <id>] [--task <id>] [--limit <n>]
 */

import * as path from "node:path";
import { openDb, ensureSchema, queryEvents } from "../src/agent-context/db";

function parseArgs(): {
  db: string;
  since?: number;
  agent?: string;
  task?: string;
  limit: number;
} {
  const args = process.argv.slice(2);
  let db = "";
  let since: number | undefined;
  let agent: string | undefined;
  let task: string | undefined;
  let limit = 100;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--db" && args[i + 1]) {
      db = args[++i];
    } else if (args[i] === "--since" && args[i + 1]) {
      since = parseInt(args[++i], 10);
    } else if (args[i] === "--agent" && args[i + 1]) {
      agent = args[++i];
    } else if (args[i] === "--task" && args[i + 1]) {
      task = args[++i];
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[++i], 10) || 100;
    }
  }

  if (!db) {
    console.error(
      "Usage: bun scripts/query-agent-events.ts --db <path> [--since <ms>] [--agent <id>] [--task <id>] [--limit <n>]",
    );
    process.exit(1);
  }

  return {
    db: path.resolve(db),
    since: since != null && Number.isFinite(since) ? since : undefined,
    agent,
    task,
    limit,
  };
}

const opts = parseArgs();

try {
  const db = openDb(opts.db);
  ensureSchema(db);
  const result = queryEvents(db, {
    since: opts.since,
    agentId: opts.agent,
    taskId: opts.task,
    limit: opts.limit,
  });
  db.close();

  if (result.isErr()) {
    console.log(JSON.stringify({ error: result.error.message }));
    process.exit(1);
  }

  const rows = result.value;
  const out = rows.map((r) => {
    const base: Record<string, unknown> = {
      id: r.id,
      agent: r.agent,
      task_id: r.task_id,
      kind: r.kind,
      timestamp: r.timestamp,
      ts: r.timestamp,
    };
    if (r.payload) {
      try {
        base.payload = JSON.parse(r.payload);
      } catch {
        base.payload = r.payload;
      }
    }
    return base;
  });

  console.log(JSON.stringify({ agent_events: out }));
} catch (e) {
  console.log(
    JSON.stringify({
      error: e instanceof Error ? e.message : String(e),
    }),
  );
  process.exit(1);
}
