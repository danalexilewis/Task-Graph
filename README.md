# Task-Graph

Inspired by Gastown.dev - Task Graph is for Centaur Development

## What this is

TaskGraph is a small CLI (`tg`) + Dolt-backed schema for managing **plans, tasks, dependencies, and execution state** during agent-assisted (“centaur”) development.

## Quick start

1. Install Dolt (`brew install dolt`)
2. Initialize TaskGraph in your repo:

```bash
tg init
```

3. Scaffold recommended conventions (example domain docs, skill guides, and Cursor rules):

```bash
tg setup
```

## Conventions (domain + skill guides)

Tasks can optionally declare:

- `domain`: slug(s) that map to `docs/<domain>.md`
- `skill`: slug(s) that map to `docs/skills/<skill>.md`

Agents can read the docs printed by `tg context <taskId>` to load repo-specific conventions before making changes.
