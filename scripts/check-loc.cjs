#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const codeExtensions = /\.(?:[cm]?js|jsx|ts|tsx|vue|css)$/;
const excludedDirectories = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.cache',
  'local_data',
]);

function collect(entry) {
  const relative = path.relative(root, entry).replace(/\\/g, '/');
  if (relative === 'docs/.vitepress/cache') return [];
  if (!fs.statSync(entry).isDirectory()) return codeExtensions.test(entry) ? [entry] : [];
  return fs.readdirSync(entry, { withFileTypes: true }).flatMap((item) => {
    if (excludedDirectories.has(item.name) || item.isSymbolicLink()) return [];
    return collect(path.join(entry, item.name));
  });
}

function physicalLines(content) {
  if (!content) return 0;
  return content.split('\n').length - Number(content.endsWith('\n'));
}

function main(entries) {
  const files = entries.length
    ? entries.flatMap((entry) => collect(path.resolve(entry)))
    : [
        ...['src', 'test', 'scripts', 'docs/.vitepress'].flatMap((directory) =>
          collect(path.join(root, directory))
        ),
        ...fs
          .readdirSync(root)
          .filter((file) => codeExtensions.test(file))
          .map((file) => path.join(root, file)),
      ];
  const failures = [];
  for (const file of new Set(files)) {
    const count = physicalLines(fs.readFileSync(file, 'utf8'));
    if (count > 649) failures.push(`${path.relative(root, file)}: ${count} lines (maximum 649)`);
  }
  if (!entries.length) {
    for (const name of ['AGENTS.md', 'CLAUDE.md']) {
      const count = physicalLines(fs.readFileSync(path.join(root, name), 'utf8'));
      if (count > 79) failures.push(`${name}: ${count} lines (maximum 79)`);
    }
  }
  if (failures.length) {
    console.error(failures.join('\n'));
    return 1;
  }
  console.log(`Physical line limits passed (${new Set(files).size} code files).`);
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { main, physicalLines };
