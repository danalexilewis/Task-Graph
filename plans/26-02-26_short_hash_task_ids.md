---
name: Short Hash Task IDs
overview: Add human-friendly short hash IDs (tg-a1b2) alongside UUIDs for CLI ergonomics, inspired by Beads.
fileTree: |
  src/domain/types.ts           (modify)
  src/domain/hash-id.ts         (create)
  src/db/migrate.ts             (modify)
  src/cli/utils.ts              (modify)
  src/cli/start.ts              (modify)
  src/cli/done.ts               (modify)
  src/cli/context.ts            (modify)
  src/cli/show.ts               (modify)
  src/cli/status.ts             (modify)
  src/cli/block.ts              (modify)
  src/cli/note.ts               (modify)
  src/cli/next.ts               (modify)
  src/cli/split.ts              (modify)
  docs/schema.md                (modify)
  docs/cli-reference.md         (modify)
  __tests__/domain/hash-id.test.ts (create)
  __tests__/integration/hash-id-resolve.test.ts (create)
risks:
  - description: Hash collisions in small ID space (4 hex chars = 65536 values)
    severity: medium
    mitigation: Use 6 hex chars (16M values); add collision detection on insert; fall back to full UUID
  - description: Existing UUIDs in DB must continue to work
    severity: low
    mitigation: Resolution is additive - accept UUID or short hash; never remove UUID support
  - description: All CLI commands that accept taskId need updating
    severity: medium
    mitigation: Single resolver function in utils.ts; all commands use it
tests:
  - "Generate short hash from UUID, verify deterministic and correct length"
  - "Resolve short hash to full UUID via DB lookup"
  - "Ambiguous short hash (multiple matches) returns clear error"
  - "Full UUID still works everywhere"
  - "tg status and tg next display short hashes"
  - "Migration adds hash_id column and backfills existing tasks"
todos:
  - id: hash-id-module
    content: "Create hash-id generation module in src/domain/hash-id.ts"
    intent: |
      Create a pure function that derives a short hash from a UUID. Use the first N chars
      of a hex-encoded hash (e.g. first 6 chars of SHA-256 of the UUID, prefixed with 'tg-').
      Export: generateHashId(uuid: string) => string. Must be deterministic.
      Also export: isHashId(input: string) => boolean to detect tg-XXXX format.
    changeType: create
    domain: [schema]
    skill: [neverthrow-error-handling]
  - id: hash-id-tests
    content: "Unit tests for hash-id generation and detection"
    intent: |
      Test determinism, uniqueness across sample UUIDs, correct prefix and length.
      Test isHashId correctly distinguishes hash IDs from UUIDs.
    changeType: test
  - id: hashid-schema-migration
    content: "Add hash_id column to task table and backfill existing rows"
    intent: |
      Idempotent migration in db/migrate.ts: ALTER TABLE task ADD COLUMN hash_id VARCHAR(10) NULL UNIQUE.
      Backfill: for each existing task, compute hash_id from task_id and UPDATE.
      On future inserts, hash_id is set at creation time. Handle collision by appending
      extra chars until unique.
    blockedBy: [hash-id-module]
    changeType: modify
    domain: [schema]
    skill: [sql-migration]
  - id: resolver-function
    content: "Add resolveTaskId utility that accepts UUID or short hash"
    intent: |
      In src/cli/utils.ts, add resolveTaskId(input: string, repoPath: string): ResultAsync<string, AppError>.
      If input matches UUID regex, return it directly. If it matches hash-id format (tg-XXXX),
      query task table WHERE hash_id = input. Return the full UUID. Error if 0 or >1 matches.
    suggestedChanges: |
      export function resolveTaskId(input: string, repoPath: string): ResultAsync<string, AppError> {
        if (UUID_REGEX.test(input)) return okAsync(input);
        if (isHashId(input)) return query(repoPath).select('task', { where: { hash_id: input } })...
      }
    blockedBy: [hashid-schema-migration]
    changeType: modify
    domain: [cli]
    skill: [cli-command-implementation]
  - id: update-cli-commands
    content: "Update all CLI commands to use resolveTaskId for task ID arguments"
    intent: |
      Every command that takes <taskId> (start, done, context, show, block, note, split)
      should call resolveTaskId before using the ID. This is a mechanical change -
      wrap the existing taskId argument through the resolver.
    blockedBy: [resolver-function]
    changeType: modify
    domain: [cli]
    skill: [cli-command-implementation]
  - id: display-hash-ids
    content: "Show short hash IDs in tg status, tg next, and tg show output"
    intent: |
      Update status.ts, next.ts, and show.ts to display hash_id alongside or instead of
      full UUID in human-readable output. JSON output should include both fields.
    blockedBy: [hashid-schema-migration]
    changeType: modify
    domain: [cli]
  - id: hashid-integration-tests
    content: "Integration tests for hash ID resolution end-to-end"
    intent: |
      Create task, verify hash_id is set. Use hash_id in tg start, tg done, tg context.
      Test ambiguity error. Test that UUID still works.
    blockedBy: [update-cli-commands]
    changeType: test
    skill: [integration-testing]
  - id: hashid-update-docs
    content: "Update schema.md and cli-reference.md with hash ID documentation"
    intent: |
      Document the new hash_id column in schema.md. Document that all CLI commands
      accept both UUID and short hash in cli-reference.md.
    changeType: document
    skill: [documentation-sync]
isProject: false
---

## Analysis

Task-Graph currently uses UUID v4 for all entity IDs (`CHAR(36)`). While collision-safe, UUIDs are
painful for CLI usage — copying `a1b2c3d4-e5f6-7890-abcd-ef1234567890` from `tg status` output is
error-prone. Beads solved this with short hash-based IDs (`bd-a1b2`).

The approach: derive a short deterministic hash from the UUID (not replace it). The UUID remains the
primary key in Dolt. A new `hash_id` column stores the short form. A resolver function in the CLI
layer accepts either format.

## Proposed approach

```
UUID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
       ↓ SHA-256 → take first 6 hex chars
hash_id: tg-a1b2c3
```

6 hex chars = 16.7M unique values. Collision probability is negligible for project-scale task counts
(typically <1000). On collision, append additional chars.

## Dependency graph

```mermaid
graph TD
  A[hash-id-module] --> C[hashid-schema-migration]
  A --> B[hash-id-tests]
  C --> D[resolver-function]
  C --> F[display-hash-ids]
  D --> E[update-cli-commands]
  E --> G[hashid-integration-tests]
  H[hashid-update-docs]
```

`hash-id-tests`, `display-hash-ids`, and `update-docs` can run in parallel with other branches.

<original_prompt>
Add short hash-based task IDs (like Beads' bd-a1b2 format) to Task-Graph for CLI ergonomics.
Pattern extracted from steveyegge/beads.
</original_prompt>
