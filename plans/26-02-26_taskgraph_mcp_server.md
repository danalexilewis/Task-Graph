---
name: TaskGraph MCP Server
overview: Expose tg commands via Model Context Protocol so agents can query the task graph without shelling out.
fileTree: |
  src/mcp/                      (create)
  src/mcp/server.ts             (create)
  src/mcp/tools.ts              (create)
  src/mcp/index.ts              (create)
  src/cli/index.ts              (modify)
  package.json                  (modify)
  docs/mcp.md                   (create)
  docs/cli-reference.md         (modify)
  __tests__/mcp/tools.test.ts   (create)
risks:
  - description: MCP server adds a new runtime mode and dependency surface
    severity: medium
    mitigation: Keep MCP layer thin - it wraps existing domain/db functions, no new logic
  - description: MCP SDK dependency may conflict with existing deps
    severity: low
    mitigation: MCP SDK is lightweight; pin version explicitly
  - description: Security surface - agents get direct DB access
    severity: low
    mitigation: MCP tools mirror CLI commands which already have the same access; no escalation
tests:
  - "MCP server responds to list_tools with available tg tools"
  - "status tool returns same data as tg status --json"
  - "context tool returns same data as tg context --json"
  - "next tool returns same data as tg next --json"
  - "start and done tools perform state transitions correctly"
todos:
  - id: mcp-server-scaffold
    content: "Create MCP server scaffold with stdio transport"
    intent: |
      Set up src/mcp/server.ts using @modelcontextprotocol/sdk. Create a stdio-based
      MCP server that reads .taskgraph/config.json for the Dolt repo path.
      Entry point: src/mcp/index.ts (separate from CLI entry).
      Add a bin entry in package.json: "tg-mcp": "dist/mcp/index.js".
    changeType: create
  - id: mcp-read-tools
    content: "Implement read-only MCP tools: status, context, next, show"
    intent: |
      In src/mcp/tools.ts, implement MCP tools that wrap existing query logic:
      - tg_status: calls the same queries as status.ts, returns JSON
      - tg_context: takes taskId, returns same JSON as tg context --json
      - tg_next: takes optional planId and limit, returns runnable tasks
      - tg_show: takes taskId, returns task details
      Reuse query functions from src/db/query.ts and logic from CLI commands.
    blockedBy: [mcp-server-scaffold]
    changeType: create
    domain: [cli]
  - id: mcp-write-tools
    content: "Implement write MCP tools: start, done, note, block"
    intent: |
      MCP tools that perform state transitions:
      - tg_start: takes taskId and agent name
      - tg_done: takes taskId and evidence
      - tg_note: takes taskId and message
      - tg_block: takes taskId, blockerId, reason
      Reuse invariant checks from domain/invariants.ts.
    blockedBy: [mcp-server-scaffold]
    changeType: create
    domain: [cli]
  - id: mcp-tools-tests
    content: "Unit tests for MCP tool handlers"
    intent: |
      Test each tool handler with mocked DB responses. Verify correct
      parameters are passed through to query layer. Test error cases.
    blockedBy: [mcp-read-tools, mcp-write-tools]
    changeType: test
  - id: mcp-docs
    content: "Create docs/mcp.md and update cli-reference.md"
    intent: |
      Document the MCP server: how to start it, available tools, how to
      configure Cursor/Claude to use it. Add MCP section to cli-reference.md.
    changeType: document
    skill: [documentation-sync]
  - id: package-json-entry
    content: "Add tg-mcp bin entry and MCP SDK dependency to package.json"
    intent: |
      Add @modelcontextprotocol/sdk to dependencies.
      Add bin entry: "tg-mcp": "dist/mcp/index.js".
      This lets consuming repos run the MCP server via npx tg-mcp.
    changeType: modify
isProject: false
---

## Analysis

Currently agents interact with Task-Graph exclusively through `tg` CLI commands via shell execution.
This works but adds overhead: shell startup, `dolt sql` subprocess, output parsing. Dolt's own
ecosystem is moving toward MCP (dolthub/dolt-mcp). A TaskGraph MCP server would let agents call
`tg_status`, `tg_context`, etc. as native tool calls.

The MCP server is a thin wrapper - it reuses existing db/query and domain logic. No new business
logic in the MCP layer.

## Architecture

```mermaid
graph LR
  Agent -->|MCP tool call| MCP[tg-mcp server]
  MCP -->|reuse| DB[src/db/query.ts]
  MCP -->|reuse| Domain[src/domain/]
  Agent -->|shell| CLI[tg CLI]
  CLI -->|reuse| DB
  CLI -->|reuse| Domain
```

Both CLI and MCP share the same query/domain layer. The MCP server just provides a different
transport (stdio MCP protocol vs shell commands).

## MCP tool catalog

| Tool       | Params                    | Returns                                      | Read/Write |
| ---------- | ------------------------- | -------------------------------------------- | ---------- |
| tg_status  | plan?, domain?, skill?    | Plan/task counts, active work, next runnable | Read       |
| tg_context | taskId                    | Full context JSON                            | Read       |
| tg_next    | plan?, limit?             | Runnable task list                           | Read       |
| tg_show    | taskId                    | Task details                                 | Read       |
| tg_start   | taskId, agent             | Started event                                | Write      |
| tg_done    | taskId, evidence          | Done event                                   | Write      |
| tg_note    | taskId, message           | Note event                                   | Write      |
| tg_block   | taskId, blockerId, reason | Block edge                                   | Write      |

<original_prompt>
Create an MCP server wrapping tg commands for direct agent access,
inspired by DoltHub's dolt-mcp and the MCP ecosystem direction.
</original_prompt>
