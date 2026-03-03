/**
 * Hive coordination types for multi-agent context.
 * Used by `tg context --hive` to expose a snapshot of all doing tasks (agents, phases, files, recent notes).
 * See docs/multi-agent.md and .cursor/agent-utility-belt.md § Hive coordination.
 */

/** Single doing-task entry: agent, phase, files in progress, recent notes. */
export interface HiveTaskEntry {
  task_id: string;
  title: string;
  agent_name: string | null;
  plan_name: string | null;
  change_type: string | null;
  started_at: string | null; // ISO timestamp
  heartbeat_phase: string | null; // 'start' | 'mid-work' | 'pre-done' | null
  heartbeat_files: string[];
  recent_notes: Array<{
    body_text: string;
    agent: string | null;
    created_at: string; // ISO timestamp
  }>;
}

/** Snapshot of all doing tasks at a point in time. */
export interface HiveSnapshot {
  as_of: string; // ISO timestamp of when the snapshot was taken
  doing_count: number;
  tasks: HiveTaskEntry[];
}
