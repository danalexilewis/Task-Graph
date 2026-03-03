/**
 * SQLite DB for agent-context. Uses bun:sqlite.
 * IMPORTANT: This module is ONLY imported by Bun scripts (scripts/*.ts), never by the Node CLI binary.
 */

/// <reference types="bun-types" />
import { Database } from "bun:sqlite";
import { err, ok, type Result } from "neverthrow";
import { type AppError, buildError, ErrorCode } from "../domain/errors";
import type { AgentEvent } from "./events";

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS agent_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent TEXT NOT NULL,
    task_id TEXT,
    kind TEXT NOT NULL,
    payload TEXT,
    timestamp INTEGER NOT NULL
  )
`;

const INDEX_TS = "CREATE INDEX IF NOT EXISTS idx_agent_events_timestamp ON agent_events(timestamp)";
const INDEX_AGENT = "CREATE INDEX IF NOT EXISTS idx_agent_events_agent ON agent_events(agent)";
const INDEX_TASK = "CREATE INDEX IF NOT EXISTS idx_agent_events_task_id ON agent_events(task_id)";

export function openDb(dbPath: string): Database {
  const db = new Database(dbPath);
  db.run("PRAGMA journal_mode=WAL");
  return db;
}

export function ensureSchema(db: Database): void {
  db.run(CREATE_TABLE_SQL);
  db.run(INDEX_TS);
  db.run(INDEX_AGENT);
  db.run(INDEX_TASK);
}

export function insertEvent(
  db: Database,
  event: AgentEvent,
): Result<void, AppError> {
  try {
    const payloadJson = JSON.stringify(event.payload ?? {});
    const stmt = db.prepare(
      "INSERT INTO agent_events (agent, task_id, kind, payload, timestamp) VALUES (?, ?, ?, ?, ?)",
    );
    stmt.run(
      event.agent,
      event.taskId ?? null,
      event.kind,
      payloadJson,
      event.ts,
    );
    return ok(undefined);
  } catch (e) {
    return err(
      buildError(
        ErrorCode.DB_QUERY_FAILED,
        `Failed to insert event: ${e instanceof Error ? e.message : String(e)}`,
        e,
      ),
    );
  }
}

export interface QueryEventsOpts {
  since?: number;
  agentId?: string;
  taskId?: string;
  limit?: number;
}

export interface AgentEventRow {
  id: number;
  agent: string;
  task_id: string | null;
  kind: string;
  timestamp: number;
  payload?: string;
}

export function queryEvents(
  db: Database,
  opts: QueryEventsOpts,
): Result<AgentEventRow[], AppError> {
  const limit = opts.limit ?? 100;
  const parts: string[] = [];
  const args: (string | number)[] = [];

  parts.push("SELECT id, agent, task_id, kind, timestamp, payload FROM agent_events WHERE 1=1");
  if (opts.since != null) {
    parts.push("AND timestamp > ?");
    args.push(opts.since);
  }
  if (opts.agentId) {
    parts.push("AND agent = ?");
    args.push(opts.agentId);
  }
  if (opts.taskId) {
    parts.push("AND task_id = ?");
    args.push(opts.taskId);
  }
  parts.push("ORDER BY timestamp ASC LIMIT ?");
  args.push(limit);

  try {
    const sql = parts.join(" ");
    const rows = db.query<AgentEventRow, (string | number)[]>(sql).all(...args);
    return ok(rows);
  } catch (e) {
    return err(
      buildError(
        ErrorCode.DB_QUERY_FAILED,
        `Failed to query events: ${e instanceof Error ? e.message : String(e)}`,
        e,
      ),
    );
  }
}
