#!/usr/bin/env node
// Layering CI gate. See auth-api/.ai/instruct.md → Module-Specific Rules → Layering → Rule 1.
// Fails if any route file imports a repository or talks to the ORM directly.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROUTES = fileURLToPath(new URL('../src/routes/', import.meta.url));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const violations = [];
for (const file of walk(ROUTES)) {
  const src = readFileSync(file, 'utf8');
  if (/from\s+['"].*repositories\//.test(src) || /getRepository|dataSource\./.test(src)) {
    violations.push(file);
  }
}

if (violations.length) {
  console.error('Layering violation — routes must call services, not repositories or the ORM:');
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
console.log('routes layering OK');
