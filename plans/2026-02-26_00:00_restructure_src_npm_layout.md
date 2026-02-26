---
name: Restructure package — src at root, standard npm layout
overview: |
  Move the taskgraph package from tools/taskgraph to repo root with source in /src,
  build in /dist, and a single package.json. Follow standard npm conventions so the
  repo root is the publishable package and entrypoints use dist/cli/index.js.

fileTree: |
  package.json                    (modify — merge taskgraph package, bin/main → dist/cli/index.js)
  tsconfig.json                   (create — rootDir src, outDir dist)
  vitest.config.ts                (create — from tools/taskgraph)
  src/                            (create — move from src)
    cli/
    db/
    domain/
    export/
    plan-import/
  __tests__/                      (create — move from __tests__)
  templates/                      (create — move from templates)
  README.md                       (modify — publish section: build/publish from root)
  .cursor/memory.md               (modify — entrypoint path)
  .cursor/rules/code-standards.mdc (modify — globs to src/**/*.ts)
  docs/architecture.md            (modify — layout diagram: src/ at root)
  docs/skills/*.md                (modify — paths tools/taskgraph → src or root)
  plans/*.md                      (modify — paths that reference tools/taskgraph)
                  (delete after move)

risks:
  - description: Many references to tools/taskgraph across docs and plans may be missed
    severity: medium
    mitigation: Grep for "tools/taskgraph" after move; update code-standards globs and any hardcoded paths in tests.
  - description: Integration/e2e tests assume CLI path (dist or cwd)
    severity: low
    mitigation: Test utils run CLI via node; point at dist/cli/index.js from repo root; run tests from root.
  - description: Root package.json currently private:true; merging makes root the npm package
    severity: low
    mitigation: Remove private or set false when publishing; prepublishOnly already runs build.

tests:
  - "pnpm build produces dist/cli/index.js (no dist/src/ in path)"
  - "pnpm tg status runs from root and succeeds"
  - "pnpm test and pnpm test:integration and pnpm test:e2e pass from root"
  - "npm pack --dry-run from root lists dist, templates, README.md only"

todos:
  - id: root-tsconfig-vitest
    content: Add root tsconfig.json and vitest.config.ts; tsconfig rootDir src, outDir dist
    intent: |
      Create tsconfig.json at repo root with compilerOptions.rootDir: "src", outDir: "dist",
      include: ["src/**/*.ts"] only so the build emits dist/cli/index.js (no dist/src/).
      Vitest runs __tests__ via tsx/vite and does not require __tests__ in tsc output.
      Create vitest.config.ts at root (copy from tools/taskgraph; same include/exclude for
      unit vs integration/e2e).
    suggestedChanges: |
      tsconfig.json: "rootDir": "./src", "outDir": "./dist", "include": ["src/**/*.ts"]
      vitest.config.ts: copy from tools/taskgraph; ensure test scripts run from root.
    domain: cli
    skill: cli-command
    changeType: create

  - id: merge-package-json
    content: Merge package.json into root; bin/main point to dist/cli/index.js
    intent: |
      Root package.json becomes the taskgraph package: name "taskgraph", version, description,
      bin.tg and main → "dist/cli/index.js", scripts (build, dev, test, test:integration, test:e2e,
      prepublishOnly), files, dependencies and devDependencies from tools/taskgraph. Script "tg":
      "node dist/cli/index.js". Remove "private": true when this repo is the published package.
    suggestedChanges: |
      package.json: merge name, version, description, main, bin, files, scripts, dependencies,
      devDependencies, engines, repository, homepage from tools/taskgraph. Set "main": "dist/cli/index.js",
      "bin": { "tg": "dist/cli/index.js" }, "scripts": { "tg": "node dist/cli/index.js", "build": "tsc", ... }.
    blockedBy: [root-tsconfig-vitest]
    domain: cli
    skill: cli-command
    changeType: modify

  - id: move-src-tests-templates
    content: Move src → src, __tests__ → __tests__, templates → templates
    intent: |
      Copy or move directories so repo root has src/, __tests__/, templates/ with the same
      contents as tools/taskgraph. No path changes inside files yet; only directory location.
    blockedBy: [merge-package-json]
    domain: cli
    changeType: refactor

  - id: update-refs-memory-rules-readme
    content: Update .cursor/memory.md, code-standards.mdc globs, and README publish section
    intent: |
      memory.md: change "package.json bin/main must point at dist/src/cli/index.js"
      to "package.json bin/main point at dist/cli/index.js". code-standards.mdc: globs from
      "**/*.ts" to "src/**/*.ts". README: publish section — build and publish
      from repo root (pnpm build, npm pack --dry-run, npm publish); remove references to
      tools/taskgraph directory.
    blockedBy: [move-src-tests-templates]
    domain: cli
    changeType: modify

  - id: update-docs-plans-paths
    content: Replace tools/taskgraph path references in docs/ and plans/ with src or root
    intent: |
      Grep for "tools/taskgraph" in docs/ and plans/; update architecture.md layout diagram,
      skill guides (e.g. docs/skills/cli-command-implementation.md, integration-testing.md),
      and any plan that references tools/taskgraph paths. Use "src/..." or "repo root" as
      appropriate so links and instructions stay correct.
    blockedBy: [update-refs-memory-rules-readme]
    domain: cli
    changeType: modify

  - id: fix-test-paths-and-verify
    content: Fix integration/e2e test paths (dist/cli/index.js, cwd); remove tools/taskgraph
    intent: |
      In __tests__/integration/test-utils.ts (or equivalent), ensure CLI is invoked as
      node dist/cli/index.js from repo root. Update __tests__/e2e if they reference
      tools/taskgraph or dist paths. Run pnpm build, pnpm tg status, pnpm test,
      pnpm test:integration, pnpm test:e2e. Then delete  directory.
    blockedBy: [update-docs-plans-paths]
    domain: cli
    skill: integration-testing
    changeType: modify

isProject: false
---

## Analysis

The package currently lives under `` with source in `src/` and build output in `dist/src/` (tsc preserves the `src` segment). Standard npm layout is: repo root = package root, source in `src/`, output in `dist/` with no redundant `src` in the path. Using `rootDir: "src"` in tsconfig produces `dist/cli/index.js`, which is the conventional entrypoint.

After the move, a single `package.json` at root defines the publishable package; `files` keeps the tarball to `dist`, `templates`, and `README.md`. The root README already has quick start and conventions; the publish section is updated to describe building and publishing from the repo root.

## Proposed layout (after)

```
/
  package.json       # taskgraph package (merged)
  tsconfig.json
  vitest.config.ts
  src/
    cli/
    db/
    domain/
    export/
    plan-import/
  __tests__/
  templates/
  plans/
  docs/
  .cursor/
  .taskgraph/
```

## Testing strategy

- Run `pnpm build` and confirm `dist/cli/index.js` exists.
- Run `pnpm tg status` from root.
- Run unit, integration, and e2e test scripts from root; fix any cwd or path assumptions in test-utils and e2e.
- Run `npm pack --dry-run` and confirm only `dist`, `templates`, `README.md` are listed.

## Open questions

- None. Optional: add a root `.npmignore` or rely on `files` only for publish.

<original_prompt>
User asked to tidy up the package and change tools/taskgraph into /src, and to follow standard npm conventions if publishing on npm. A plan was requested to draft this refactor.</original_prompt>
