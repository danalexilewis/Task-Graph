# Why the tg/Dolt Architecture Changed

**Date:** 2026-03-03  
**Scope:** Architecture rationale for tg server, dual-path Dolt access, and pool mode

## Summary

TaskGraph now uses a **server-first** model for Dolt access: `tg server start` spawns a background `dolt sql-server`, and the CLI auto-detects it and routes all queries through a mysql2 connection pool instead of per-query `dolt sql` subprocesses. When no server is running, the CLI falls back to execa with a per-repo semaphore. This change was driven by latency, multi-agent contention, and concurrency constraints in Dolt's noms storage.

## Original Model: Execa-Only

Initially, every Dolt query ran via `execa('dolt', ['sql', '-q', query], { cwd: doltRepoPath })`. One subprocess per query; no persistent connection.

**Problems:**

1. **Latency** — Each query spawns a new Dolt process. Process creation, Dolt init, and SQL execution add ~150 ms per query. A typical `tg status` or `tg context` involves multiple queries; dashboards and frequent polling compound the cost.

2. **Noms concurrency** — Dolt stores data in noms, which does not support concurrent process access to the same repo. When multiple `dolt` processes hit the same data directory simultaneously, they fall back to attempting a TCP connection (default port 3306). If no `dolt sql-server` is running, that fails. So parallel agents (e.g. 2–3 implementers + orchestrator running `tg status`) would contend and fail.

3. **Serialization** — To avoid noms contention, the codebase added a per-repo execa semaphore: only one `dolt sql` subprocess runs at a time per repo. That fixed crashes but made every CLI invocation wait in line. Multi-agent workflows became effectively serialized at the Dolt boundary.

## New Model: Server-First with Fallback

### tg server start / stop / status

`tg server start` spawns `dolt sql-server` as a detached background process, binds to a free port, and writes metadata (port, pid, dataDir) to `.taskgraph/tg-server.json`.

- **Auto-detect** — Every CLI command (except init/setup/server/health) runs `detectAndApplyServerPort()` in its preAction. If `tg-server.json` exists and the server process is alive, the CLI sets `TG_DOLT_SERVER_PORT` and `TG_DOLT_SERVER_DATABASE`. All subsequent `doltSql()` calls use the mysql2 pool instead of execa.
- **Fallback** — If the server is unreachable (e.g. stale meta, server killed), the CLI clears the env vars and falls back to execa. A TCP probe runs before trusting the meta; on failure, it logs and reverts to the execa path.
- **Stale cleanup** — If meta exists but the process is dead, the CLI removes `tg-server.json` so future commands don't repeatedly try a dead server.

### Dual Path in doltSql()

`src/db/connection.ts` implements two paths:

1. **Pool path** — When `TG_DOLT_SERVER_PORT` and `TG_DOLT_SERVER_DATABASE` are set, `getServerPool()` returns a mysql2 connection pool. Queries use `doltSqlServer()` → `pool.query()`. Multiple concurrent queries are supported; no process spawn per query.
2. **Execa path** — When the pool is null, `doltSql()` uses execa with `acquireExecaSlot()` so only one `dolt sql` runs at a time per repo. Same behavior as before, but now the fallback rather than the default.

### Pool lifecycle

- Pools are keyed by `host:port:database` and cached. Integration tests call `closeServerPool()` in teardown to release connections before killing the server.
- The CLI calls `closeAllServerPools()` on exit so connections drain cleanly.

### Query result cache

An in-process, TTL-based cache sits between CLI commands and the query layer. Dashboard mode applies a 1500 ms floor to reduce polling load. Writes invalidate by table so reads stay consistent. See [docs/performance.md § Query Result Cache](performance.md#query-result-cache).

## Rationale Summary

| Problem | Solution |
|---------|----------|
| ~150 ms per query from process spawn | Persistent server + pool; queries run over TCP, no spawn |
| Noms concurrent access failure | Single server process owns the repo; clients connect via TCP |
| Multi-agent serialization at Dolt | Pool allows concurrent queries; agents no longer block each other |
| Stale or dead server | Auto-detect + probe + fallback to execa; stale meta cleaned up |
| Dashboard / polling overload | Query cache with TTL; table-level invalidation on writes |

## Future: Write Queue (Planned)

A CQRS-style write queue is planned (`tg drain`, `.taskgraph/queue.db`): write commands enqueue and return immediately; a single writer process drains the queue into Dolt. Agents get eventual consistency and avoid blocking on Dolt writes. See [plans/26-03-03_cqrs_write_queue_agents.md](../plans/26-03-03_cqrs_write_queue_agents.md) and [reports/review-26-03-03-lock-strategy-cqrs-alternative.md](review-26-03-03-lock-strategy-cqrs-alternative.md). Not yet implemented; current writes go directly to Dolt via the pool or execa path.

## References

- [docs/infra.md § Dolt sql-server mode](../docs/infra.md#dolt-sql-server-mode)
- [docs/architecture.md § Dolt I/O and agents](../docs/architecture.md#dolt-io-and-agents)
- [docs/performance.md § Query Result Cache](../docs/performance.md#query-result-cache)
- `src/cli/server.ts` — tg server start/stop/status
- `src/db/connection.ts` — dual path, pool, execa semaphore
