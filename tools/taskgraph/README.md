# taskgraph

Task Graph CLI for **centaur development** (human + agent): plans, tasks, dependencies, and execution state in a Dolt-backed graph. Use the `tg` command to manage tasks and stay in sync when coding with AI assistants (e.g. Cursor).

## Install

**Prerequisite:** [Dolt](https://docs.dolthub.com/introduction/getting-started) (`brew install dolt` on macOS).

```bash
npm install -g taskgraph
```

Or run without installing:

```bash
npx taskgraph init
npx taskgraph setup
```

## Quick start

1. **Initialize** in your repo:

   ```bash
   tg init
   ```

2. **Scaffold** recommended conventions (domain docs, skill guides, Cursor rules, and AGENT.md):

   ```bash
   tg setup
   ```

3. Create plans and tasks, or import from Cursor-format markdown:

   ```bash
   tg plan new "My feature"
   tg import plans/my-plan.md --plan "My feature" --format cursor
   tg next
   tg start <taskId> --agent my-session
   # ... do work ...
   tg done <taskId> --evidence "tests passed; summary"
   ```

## Documentation

Full documentation (CLI reference, schema, plan import, agent contract) is in the [project repository](https://github.com/dan/Task-Graph) — see the `docs/` directory.

## License

MIT
