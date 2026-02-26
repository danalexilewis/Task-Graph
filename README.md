# Taskgraph

Inspired by [Beads](https://github.com/steveyegge/beads) and [Gastown.dev](https://gastown.dev) — Task Graph is for **Centaur Development** (human + agent).

## Why this repo

I wanted a small, local-first way to manage plans and tasks during agent-assisted coding without adopting full Beads/Gastown orchestration. Task-Graph borrows from Beads (atomic claims, structured notes, status visibility) but stays minimal: one working copy, no mayor/orchestrator, no swarms. It’s a Dolt-backed CLI that fits into Cursor workflows so agents and humans can share the same task graph and execution state.

## What this is

TaskGraph is a small CLI (`tg`) + Dolt-backed schema for managing **plans, tasks, dependencies, and execution state** during agent-assisted (“centaur”) development.

## Quick start

1. **Install Dolt** (required for the local DB): `brew install dolt`
2. **Install TaskGraph** in your repo:

   ```bash
   pnpm add -D @danalexilewis/taskgraph
   ```

3. **Register the command** in your repo so `tg` runs the installed CLI. In `package.json`, add a script:

   ```json
   "scripts": {
     "tg": "tg"
   }
   ```

   Then use `pnpm tg` (or `npm run tg`) for all commands; the script runs the binary from `node_modules/.bin`.
4. **Initialize** from your repo root (creates `.taskgraph/` and Dolt DB):

   ```bash
   pnpm tg init
   ```

5. **Scaffold** (optional; domain docs, skill guides, Cursor rules):

   ```bash
   pnpm tg setup
   ```

Without the script, the shell can't find `tg`; `npx tg init` also works if you prefer not to add the script.

## Conventions (domain + skill guides)

Tasks can optionally declare:

- `domain`: slug(s) that map to `docs/<domain>.md`
- `skill`: slug(s) that map to `docs/skills/<skill>.md`

Agents can read the docs printed by `tg context <taskId>` to load repo-specific conventions before making changes.
