#!/usr/bin/env node
/**
 * First-run setup: initializes the database and creates the admin user.
 * Usage: node admin/scripts/setup.js
 */

import 'dotenv/config';
import { createInterface } from 'readline';
import bcrypt from 'bcryptjs';
import { validateEnv } from '../../server/config/env.js';
import { initDatabase } from '../../server/database/init-database.js';
import { db } from '../../server/database/database.js';
import { fileStore } from '../../server/services/file-store.js';

validateEnv();

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

async function main() {
  console.log('\n=== Resume-Suite Setup ===\n');

  await initDatabase();

  const existing = await db.query('SELECT COUNT(*) FROM users');
  if (Number(existing.rows[0].count) > 0) {
    console.log('Database already has users. Skipping admin creation.');
    console.log('To add more users: node admin/scripts/seed-user.js');
    rl.close();
    await db.close();
    return;
  }

  console.log('Creating admin account...\n');

  let username = (await ask('Admin username [victor]: ')).trim().toLowerCase() || 'victor';
  if (!/^[a-zA-Z0-9_-]{3,30}$/.test(username)) {
    console.error('Invalid username. Use 3-30 alphanumeric characters.');
    process.exit(1);
  }

  let fullName = (await ask('Full name (used in artifact filenames) [Victor Masters]: ')).trim() || 'Victor Masters';

  let password = '';
  while (password.length < 8) {
    password = (await ask('Password (min 8 characters): ')).trim();
    if (password.length < 8) console.log('  Password too short.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const r = await db.query(
    `INSERT INTO users (username, full_name, password_hash, role)
     VALUES ($1, $2, $3, 'admin') RETURNING id, username, full_name`,
    [username, fullName, passwordHash]
  );
  const user = r.rows[0];

  await fileStore.ensureUserDirs(user.username);

  console.log(`\n✓ Admin account created: ${user.username} (${user.full_name})`);
  console.log(`✓ User data directory: ${fileStore.userRoot(user.username)}`);
  console.log('\nNext steps:');
  console.log('  1. Upload your resume Parts via the web UI (or copy files to UserData/<username>/Parts/)');
  console.log('  2. Start the server: npm start  (or: docker compose up)');
  console.log('  3. Open http://localhost:38291\n');

  rl.close();
  await db.close();
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
