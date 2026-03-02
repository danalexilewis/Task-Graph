import { ResultAsync } from "neverthrow";
import { QueryCache } from "../db/cache";
import { tableExists } from "../db/migrate";
import type { AppError } from "../domain/errors";

/** TTL for status query cache. 0 disables caching (passthrough mode). */
export const statusCacheTtlMs: number =
  process.env.TG_DISABLE_CACHE === "1"
    ? 0
    : Number(process.env.TG_STATUS_CACHE_TTL_MS ?? 2500);

let _statusCache: QueryCache | null = null;

/** Returns the process-scoped singleton QueryCache for status/dashboard reads. */
export function getStatusCache(): QueryCache {
  if (!_statusCache) {
    _statusCache = new QueryCache();
  }
  return _statusCache;
}

/**
 * Clears and nulls the singleton. Call in beforeEach of tests that use
 * fetchStatusData to prevent cache bleed between test cases.
 */
export function resetStatusCache(): void {
  _statusCache?.clear();
  _statusCache = null;
}

// ---------------------------------------------------------------------------
// Schema flags memo — tableExists checks for optional tables.
// Schema changes only happen during migrations (CLI startup), so a 5-minute
// TTL is safe. Removes 2 sequential dolt subprocess calls from every
// fetchStatusData invocation after the first.
// ---------------------------------------------------------------------------

export interface SchemaFlags {
  initiativeExists: boolean;
  cycleExists: boolean;
}

interface FlagsMemo {
  flags: SchemaFlags;
  expiresAt: number;
}

const SCHEMA_FLAGS_TTL_MS = 300_000; // 5 minutes
const schemaFlagsCache = new Map<string, FlagsMemo>();

/**
 * Returns memoized schema flag checks for optional tables (initiative, cycle).
 * On first call per repoPath, runs two tableExists checks in parallel and
 * caches the result. Subsequent calls within TTL return the memo instantly.
 */
export function getSchemaFlags(
  repoPath: string,
): ResultAsync<SchemaFlags, AppError> {
  const memo = schemaFlagsCache.get(repoPath);
  if (memo && Date.now() < memo.expiresAt) {
    return ResultAsync.fromSafePromise(Promise.resolve(memo.flags));
  }
  return ResultAsync.combine([
    tableExists(repoPath, "initiative"),
    tableExists(repoPath, "cycle"),
  ] as const).map(([initiativeExists, cycleExists]) => {
    const flags: SchemaFlags = { initiativeExists, cycleExists };
    schemaFlagsCache.set(repoPath, {
      flags,
      expiresAt: Date.now() + SCHEMA_FLAGS_TTL_MS,
    });
    return flags;
  });
}

/** Clears the schema flags memo. Call in beforeEach of tests. */
export function resetSchemaFlagsCache(): void {
  schemaFlagsCache.clear();
}
