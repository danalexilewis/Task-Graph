---
name: Dolt Replication
overview: Enable Dolt push/pull for multi-machine task graph sync, inspired by Beads replication model.
fileTree: |
  src/cli/sync.ts               (create)
  src/cli/init.ts               (modify)
  src/cli/index.ts              (modify)
  .taskgraph/config.json        (modify)
  docs/architecture.md          (modify)
  docs/cli-reference.md         (modify)
  __tests__/integration/dolt-sync.test.ts (create)
risks:
  - description: Requires Dolt remote setup (DoltHub or self-hosted)
    severity: high
    mitigation: Provide clear setup docs; tg sync gracefully errors when no remote configured
  - description: Merge conflicts from concurrent multi-machine writes
    severity: medium
    mitigation: Dolt handles cell-level merge; document conflict resolution workflow
  - description: Network dependency for sync operations
    severity: low
    mitigation: Sync is explicit (not auto); local-first workflow continues to work without sync
tests:
  - "tg sync push pushes to configured remote"
  - "tg sync pull pulls from configured remote"
  - "tg sync (no args) does pull then push"
  - "Error message when no remote configured"
  - "tg init --remote sets up Dolt remote"
todos:
  - id: sync-command
    content: "Add tg sync command wrapping dolt push/pull"
    intent: |
      New CLI command: tg sync [push|pull] [--remote <name>]
      - tg sync: pull then push (default workflow)
      - tg sync push: dolt push to configured remote
      - tg sync pull: dolt pull from configured remote
      Default remote name: 'origin'. Read remote config from Dolt repo.
    changeType: create
    domain: [cli]
    skill: [cli-command-implementation]
  - id: init-remote
    content: "Add --remote flag to tg init for setting up Dolt remote"
    intent: |
      tg init --remote <url> runs dolt remote add origin <url> after init.
      Also add remote_url to .taskgraph/config.json for reference.
      URL format: https://doltremoteapi.dolthub.com/user/repo or file:///path.
    changeType: modify
    domain: [cli]
  - id: config-remote
    content: "Add remote configuration to .taskgraph/config.json"
    intent: |
      Add optional remote_url field. tg sync reads this to determine if sync
      is available. If not set, tg sync returns a helpful error message
      explaining how to set up a remote.
    changeType: modify
  - id: sync-integration-tests
    content: "Integration tests for sync with file-based Dolt remote"
    intent: |
      Use dolt clone with a file:// remote to test push/pull in CI.
      Create two local repos pointing at the same file remote.
      Push from one, pull to other, verify data matches.
    blockedBy: [sync-command, init-remote]
    changeType: test
    skill: [integration-testing]
  - id: sync-update-docs
    content: "Document multi-machine sync in architecture.md and cli-reference.md"
    intent: |
      Add a "Multi-Machine Sync" section to architecture.md explaining the
      Dolt replication model. Document tg sync and tg init --remote in cli-reference.md.
      Explain when sync is useful (laptop + cloud, team collaboration).
    changeType: document
    skill: [documentation-sync]
isProject: false
---

## Analysis

Beads syncs across machines via Dolt push/pull. Task-Graph is currently local-only. For workflows
spanning multiple machines (e.g. laptop for planning, cloud VM for CI-driven agents), replication
enables a shared task graph.

Dolt replication is built-in — `dolt remote add`, `dolt push`, `dolt pull` work like git. The CLI
just needs a thin wrapper.

## Sync flow

```mermaid
sequenceDiagram
  participant L as Local (laptop)
  participant R as Remote (DoltHub)
  participant C as Cloud agent

  L->>R: tg sync push
  C->>R: tg sync pull
  C->>C: work on tasks
  C->>R: tg sync push
  L->>R: tg sync pull
```

## Remote options

| Remote type | URL format                                    | Use case                 |
| ----------- | --------------------------------------------- | ------------------------ |
| DoltHub     | `https://doltremoteapi.dolthub.com/user/repo` | Cloud-hosted, easy setup |
| File-based  | `file:///path/to/remote`                      | Local network, testing   |
| Self-hosted | Custom Dolt remote API                        | Enterprise, air-gapped   |

<original_prompt>
Enable Dolt push/pull for multi-machine task graph sync,
inspired by Beads' Dolt-native replication model.
</original_prompt>
