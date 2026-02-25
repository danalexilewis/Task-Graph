---
name: Publish TaskGraph to npm
overview: |
  Make the taskgraph CLI installable via npm (global or local) and ensure users get
  agent docs (AGENT.md) via tg setup, so the package is self-contained and usable by anyone.
  The publishable unit is tools/taskgraph/; only files inside that directory are in the tarball.

fileTree: |
  tools/taskgraph/
    package.json              (modify)
    README.md                 (create)
    templates/repo-setup/
      AGENT.md                (create)
    src/cli/setup.ts          (modify)
    __tests__/integration/
      setup-scaffold.test.ts   (modify)
  README.md                   (modify)

risks:
  - description: Unscoped name "taskgraph" may be taken on npm
    severity: low
    mitigation: Check with npm view taskgraph; use scoped @username/taskgraph if needed

tests:
  - "tg setup scaffolds AGENT.md at repo root (setup-scaffold.test.ts)"
  - "npm pack --dry-run shows only dist, templates, README.md"

todos:
  - id: package-files
    content: Add "files" and prepublishOnly to tools/taskgraph/package.json so published tarball includes dist + templates and build runs before publish
    status: completed
    domain: cli
    skill: cli-command
    changeType: modify
    intent: |
      Add "files": ["dist", "templates", "README.md"] so the tarball excludes src/tests and includes dist despite root .gitignore.
      Add "prepublishOnly": "npm run build" so dist is built automatically on npm publish.

  - id: agent-in-setup
    content: Add AGENT.md to repo-setup template and extend tg setup to copy it to repo root (so install + tg setup delivers agent contract)
    status: completed
    domain: cli
    skill: cli-command
    changeType: modify
    intent: |
      Copy root AGENT.md into templates/repo-setup/AGENT.md. In setup.ts, when options.cursor is true,
      copy templateRoot/AGENT.md to repoRoot/AGENT.md with same skip/force behavior as .cursor copy.

  - id: package-readme
    content: Add tools/taskgraph/README.md for npm (install, quick start, link to full docs)
    status: completed
    changeType: create
    intent: Package README for npm listing — install (global + npx), Dolt prerequisite, quick start, link to project docs.

  - id: package-metadata
    content: Add repository, optional homepage, and engines.node to tools/taskgraph/package.json; decide unscoped vs scoped name
    status: completed
    changeType: modify
    intent: |
      Add engines.node >=18, repository (git URL), homepage. Keep unscoped name "taskgraph";
      publish-docs reminds maintainer to check name availability before first publish.

  - id: publish-docs
    content: Document publish workflow (build, pack dry-run, publish from tools/taskgraph) in README or CONTRIBUTING
    status: completed
    changeType: document
    intent: Add "Publishing the CLI to npm" section to root README — name check, build, npm pack --dry-run, npm publish from tools/taskgraph.

isProject: false
---

## Analysis

The npm package boundary is `tools/taskgraph/`. Root-level files (e.g. repo `AGENT.md`) are outside that boundary and are never included in the published tarball. Delivering the agent contract to users is therefore done by (1) adding AGENT.md to the repo-setup template and (2) having `tg setup` copy it to the repo root when scaffolding Cursor conventions. After `npm i -g taskgraph`, users run `tg init` and `tg setup` and get docs, .cursor rules, and AGENT.md.

The `files` field in package.json ensures only `dist`, `templates`, and `README.md` are published; `prepublishOnly` runs the build so `dist/` exists and is included despite root `.gitignore` excluding it during development.

## Open Questions

- None; plan was executed and all tasks completed.

<original_prompt>
When taskgraph is installed I'm noticing the AGENT.md is not included. Actually I don't really know how this will happen when someone installs it. What I wanted was to be able to publish a package to npm that someone could install. Is that possible? Can you make me a plan for how to do this?
</original_prompt>
