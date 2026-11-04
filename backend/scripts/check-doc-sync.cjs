#!/usr/bin/env node
'use strict';

/*
 * Documentation guardrail for backend/application changes.
 *
 * Local work uses git status, including untracked files. CI can set
 * DOC_SYNC_BASE to a merge-base/commit so committed branch changes are checked.
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const repo = path.resolve(__dirname, '../..');
const required = ['backend/SPEC.md', 'backend/HANDOFF.md'];
const adrDirectory = 'docs/adr/';
const base = process.env.DOC_SYNC_BASE || process.argv.find((arg) => arg.startsWith('--base='))?.slice(7);

function git(args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
}

function changedPaths() {
  const paths = new Set();
  if (base) {
    for (const file of git(['diff', '--name-only', `${base}...HEAD`]).split('\n')) {
      if (file) paths.add(file);
    }
  }
  for (const line of git(['status', '--porcelain=v1', '--untracked-files=all']).split('\n')) {
    if (line.length >= 4) {
      const value = line.slice(3);
      // Rename output is "old -> new"; check the new path.
      paths.add(value.includes(' -> ') ? value.split(' -> ').at(-1) : value);
    }
  }
  return paths;
}

let paths;
try {
  paths = changedPaths();
} catch (error) {
  console.error(`documentation sync: unable to inspect git: ${error.message}`);
  process.exit(1);
}

const implementationChanged = [...paths].some((file) => {
  if (file === 'index.html') return true; // embedded model scripts feed the seed extractor
  if (!file.startsWith('backend/')) return false;
  return !file.startsWith('backend/SPEC.md') &&
    !file.startsWith('backend/HANDOFF.md') &&
    !file.startsWith('backend/API.md') &&
    !file.startsWith('backend/data/anchor-management.json');
});

if (!implementationChanged) {
  console.log('documentation sync: no backend/application implementation changes');
  process.exit(0);
}

const missing = required.filter((file) => !paths.has(file));
const adrChanged = [...paths].some((file) => file.startsWith(adrDirectory) && file.endsWith('.md'));
if (!adrChanged) missing.push('docs/adr/*.md (add or amend an ADR)');

if (missing.length) {
  console.error('documentation sync: FAIL');
  console.error('Implementation changes require these documentation updates:');
  for (const file of missing) console.error(`  - ${file}`);
  console.error('\nRead backend/HANDOFF.md before continuing.');
  process.exit(1);
}

console.log('documentation sync: PASS (spec, handoff, and ADR changes detected)');
