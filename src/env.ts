import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Typed, validated environment variables (T3 Env).
 * All server vars are optional or have defaults so the CLI runs with no env (e.g. `bun run start`).
 * Validated once at first import. For vars set at runtime (e.g. TG_DOLT_SERVER_PORT
 * by the CLI), use getServerConnectionEnv() which reads and validates from process.env at call time.
 */
export const env = createEnv({
  server: {
    /** Path to dolt binary; default "dolt". */
    DOLT_PATH: z.string().min(1).default("dolt"),
    /** Timeout in ms for execa-based dolt sql. */
    DOLT_EXECA_TIMEOUT_MS: z.coerce.number().positive().default(30_000),
    /** Skip migrations when set (e.g. tests). */
    TG_SKIP_MIGRATE: z.string().optional(),
    /** Disable status cache when "1". */
    TG_DISABLE_CACHE: z.string().optional(),
    /** Status cache TTL in ms; default 2500. */
    TG_STATUS_CACHE_TTL_MS: z.coerce.number().min(0).default(2500),
    /** Dolt SQL server host; default 127.0.0.1. */
    TG_DOLT_SERVER_HOST: z.string().default("127.0.0.1"),
    /** Dolt SQL server user; default root. */
    TG_DOLT_SERVER_USER: z.string().default("root"),
    /** Dolt SQL server password. */
    TG_DOLT_SERVER_PASSWORD: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

/** Schema for server connection params that may be set at runtime by the CLI. */
const serverConnectionSchema = z.object({
  TG_DOLT_SERVER_PORT: z.string().optional(),
  TG_DOLT_SERVER_DATABASE: z.string().optional(),
  TG_DOLT_SERVER_HOST: z.string().default("127.0.0.1"),
  TG_DOLT_SERVER_USER: z.string().default("root"),
  TG_DOLT_SERVER_PASSWORD: z.string().optional(),
});

/**
 * Current Dolt server connection env (port/database may be set at runtime).
 * Read from process.env at call time so CLI-set values are visible.
 */
export function getServerConnectionEnv(): z.infer<
  typeof serverConnectionSchema
> {
  return serverConnectionSchema.parse({
    TG_DOLT_SERVER_PORT: process.env.TG_DOLT_SERVER_PORT,
    TG_DOLT_SERVER_DATABASE: process.env.TG_DOLT_SERVER_DATABASE,
    TG_DOLT_SERVER_HOST: process.env.TG_DOLT_SERVER_HOST ?? "127.0.0.1",
    TG_DOLT_SERVER_USER: process.env.TG_DOLT_SERVER_USER ?? "root",
    TG_DOLT_SERVER_PASSWORD: process.env.TG_DOLT_SERVER_PASSWORD,
  });
}
