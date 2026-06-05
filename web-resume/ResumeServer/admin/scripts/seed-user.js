#!/usr/bin/env node
/**
 * Create a new user account from the command line.
 * Usage: node admin/scripts/seed-user.js [--username alice] [--fullname "Alice Smith"] [--role user]
 */

import 'dotenv/config';
import { createInterface } from 'readline';
import { parseArgs } from 'util';
import bcrypt from 'bcryptjs';
import { validateEnv } from '../../server/config/env.js';
import { db } from '../../server/database/database.js';
import { fileStore } from '../../server/services/file-store.js';

validateEnv();

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

async function main() {
  const { values } = parseArgs({
    options: {
      username: { type: 'string' },
      fullname: { type: 'string' },
      role:     { type: 'string', default: 'user' },
      password: { type: 'string' },
    },
    strict: false,
  });

  console.log('\n=== Resume-Suite — Create User ===\n');

  let username = (values.username ?? '').trim().toLowerCase();
  if (!username) {
    username = (await ask('Username: ')).trim().toLowerCase();
  }
  if (!/^[a-zA-Z0-9_-]{3,30}$/.test(username)) {
    console.error('Invalid username.');
    process.exit(1);
  }

  const existing = await db.getUserByUsername(username);
  if (existing) {
    console.error(`User "${username}" already exists.`);
    process.exit(1);
  }

  let fullName = (values.fullname ?? '').trim();
  if (!fullName) {
    fullName = (await ask('Full name (used in artifact filenames): ')).trim();
  }
  if (!fullName) {
    console.error('Full name is required.');
    process.exit(1);
  }

  let password = values.password ?? '';
  while (password.length < 8) {
    password = (await ask('Password (min 8 characters): ')).trim();
    if (password.length < 8) console.log('  Password too short.');
  }

  const role = ['admin', 'user'].includes(values.role) ? values.role : 'user';
  const passwordHash = await bcrypt.hash(password, 12);

  const r = await db.query(
    `INSERT INTO users (username, full_name, password_hash, role)
     VALUES ($1, $2, $3, $4) RETURNING id, username, full_name, role`,
    [username, fullName, passwordHash, role]
  );
  const user = r.rows[0];
  await fileStore.ensureUserDirs(user.username);

  console.log(`\n✓ User created: ${user.username} (${user.full_name}) — role: ${user.role}`);
  console.log(`✓ User data directory: ${fileStore.userRoot(user.username)}`);
  console.log('\nShare the server URL and their credentials.');
  console.log('They can get their API token from the Settings page in the web UI.\n');

  rl.close();
  await db.close();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
