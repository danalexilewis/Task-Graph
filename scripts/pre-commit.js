#!/usr/bin/env node
/**
 * Pre-commit script: format staged files with Prettier and re-stage them.
 * Hook should run: pnpm run precommit (or npm run precommit)
 */
const { execSync } = require('child_process');
const path = require('path');

const PRETTIER_EXT = /\.(js|ts|json|md|yml|yaml|mdc)$/;

function getStagedFiles() {
  const out = execSync('git diff --cached --name-only', { encoding: 'utf-8' });
  return out
    .trim()
    .split(/\n/)
    .filter(Boolean)
    .filter((f) => PRETTIER_EXT.test(f));
}

function main() {
  const staged = getStagedFiles();
  if (staged.length === 0) process.exit(0);

  const root = path.resolve(__dirname, '..');
  const files = staged.map((f) => path.join(root, f)).join(' ');
  execSync(`npx prettier --write ${files}`, { stdio: 'inherit', cwd: root });
  execSync(`git add ${staged.join(' ')}`, { stdio: 'inherit', cwd: root });
}

main();
