/**
 * Polling collector for agent terminal events. Used by scripts/collect-agent-events.ts.
 * Watches a terminals directory, parses [tg:event] lines, inserts into SQLite.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Database } from "bun:sqlite";
import { ensureSchema, insertEvent } from "./db";
import { parseEventLine, type AgentEvent } from "./events";

export interface CollectorOpts {
  terminalsDir: string;
  dbPath: string;
  pollIntervalMs?: number;
}

interface FileState {
  offset: number;
  inode: number;
}

/**
 * Run the collector polling loop. Resolves when SIGINT/SIGTERM received.
 * Caller is responsible for opening the DB and calling ensureSchema before run.
 */
export async function runCollector(
  db: Database,
  opts: CollectorOpts,
): Promise<void> {
  const intervalMs = opts.pollIntervalMs ?? 500;
  const terminalsDir = opts.terminalsDir;
  const state = new Map<string, FileState>();

  const tick = () => {
    if (!fs.existsSync(terminalsDir)) return;
    const entries = fs.readdirSync(terminalsDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isFile() || !ent.name.endsWith(".txt")) continue;
      const filePath = path.join(terminalsDir, ent.name);
      try {
        const stat = fs.statSync(filePath);
        const inode = stat.ino;
        const prev = state.get(filePath);
        let offset = 0;
        if (prev) {
          if (prev.inode !== inode) {
            offset = 0;
          } else {
            offset = prev.offset;
          }
        }
        const fd = fs.openSync(filePath, "r");
        try {
          const totalSize = stat.size;
          if (offset >= totalSize) {
            state.set(filePath, { offset: totalSize, inode });
            continue;
          }
          const buf = Buffer.alloc(totalSize - offset);
          fs.readSync(fd, buf, 0, buf.length, offset);
          const text = buf.toString("utf8");
          const lines = text.split("\n");
          const lastIsPartial = !text.endsWith("\n");
          const linesToProcess = lastIsPartial ? lines.slice(0, -1) : lines;
          let consumedLen = 0;
          for (const l of linesToProcess) {
            consumedLen += l.length + 1;
          }
          const newOffset = offset + consumedLen;
          state.set(filePath, { offset: newOffset, inode });

          for (const ln of linesToProcess) {
            const line = ln + "\n";
            if (line.startsWith("[tg:event] ")) {
              const result = parseEventLine(line);
              if (result.isOk()) {
                const event = result.value;
                const insertResult = insertEvent(db, event);
                if (insertResult.isOk()) {
                  console.log(
                    `[collector] Inserted event kind=${event.kind} agent=${event.agent} ts=${event.ts}`,
                  );
                }
              }
            }
          }
        } finally {
          fs.closeSync(fd);
        }
      } catch (e) {
        // Skip files we can't read (permissions, deleted, etc.)
      }
    }
  };

  return new Promise<void>((resolve) => {
    const id = setInterval(tick, intervalMs);
    tick();

    const stop = () => {
      clearInterval(id);
      console.log("--- collector stopped ---");
      resolve();
    };

    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}

export async function runCollectorWithDb(opts: CollectorOpts): Promise<void> {
  const { Database } = await import("bun:sqlite");
  const db = new Database(opts.dbPath);
  ensureSchema(db);
  try {
    await runCollector(db, opts);
  } finally {
    db.close();
  }
}
