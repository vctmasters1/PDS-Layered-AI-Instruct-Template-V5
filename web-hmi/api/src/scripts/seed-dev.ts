/**
 * seed-dev.ts
 *
 * Upserts a local developer account into the shared PostgreSQL database.
 * ONLY runs when NODE_ENV !== "production" — will hard-exit if accidentally
 * invoked against a production database.
 *
 * Run:  npx ts-node src/scripts/seed-dev.ts
 * Or via npm:  npm run seed:dev
 *
 * The account seeded here is:
 *   email:    dev@pds.local
 *   password: PdsLocal!Dev1
 *   role:     admin
 *   isStaff:  true
 *
 * These credentials exist only in local dev.  They are never in source control
 * (this file is committed but contains no secrets — credentials are hardcoded
 * as obviously-dev strings that would be useless on Railway, which uses its own
 * JWT_SECRET and a fresh Railway-provisioned database with no seed data).
 */

import 'module-alias/register'; // must be first — registers @db-central alias
import "dotenv/config";
import crypto from "crypto";
import bcrypt from "bcrypt";
import AppDataSource from "../database.js";

const DEV_EMAIL = "dev@pds.local";
const DEV_PASSWORD = "PdsLocal!Dev1";

async function seed() {
  if (process.env.NODE_ENV === "production") {
    console.error("❌  Refusing to seed in production. Set NODE_ENV=development.");
    process.exit(1);
  }

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const hash = await bcrypt.hash(DEV_PASSWORD, 10);

  const result = await AppDataSource.query(
    `INSERT INTO users (id, email, password, role, "isStaff")
     VALUES ($1, $2, $3, 'admin', true)
     ON CONFLICT (email) DO UPDATE
       SET password = EXCLUDED.password,
           role = 'admin',
           "isStaff" = true
     RETURNING id, email, role`,
    [crypto.randomUUID(), DEV_EMAIL, hash]
  );

  const row = result[0];

  // FwServer reads from the "user" table (separate stub).
  // Upsert the same UUID with isStaff=true so firmware upload works locally.
  await AppDataSource.query(
    `INSERT INTO "user" (id, "isStaff")
     VALUES ($1, true)
     ON CONFLICT (id) DO UPDATE SET "isStaff" = true`,
    [row.id]
  );
  console.log(`✅  Dev account ready:`);
  console.log(`    email:    ${row.email}`);
  console.log(`    password: ${DEV_PASSWORD}`);
  console.log(`    role:     ${row.role}`);
  console.log(`    id:       ${row.id}`);

  await AppDataSource.destroy();
}

seed().catch((e) => {
  console.error("❌  Seed failed:", e.message);
  process.exit(1);
});
