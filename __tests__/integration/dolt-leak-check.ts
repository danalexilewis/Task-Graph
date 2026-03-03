/** Stub for integration global-setup. Records baseline dolt process count for teardown leak check. */
export function recordDoltBaseline(): void {
  // No-op when leak check not implemented; avoids process-count assertions in CI.
}
