/**
 * create-test-account.ts
 *
 * Creates (or resets) a single standardized test account.
 * All automated tests and manual testing sessions should use THIS account —
 * never generate random/UUID-based accounts.
 *
 * Account seeded:
 *   email:    test@pds.local
 *   password: PdsLocal!Test1
 *   role:     buyer  (default — override by passing role as first arg)
 *   isStaff:  false
 *
 * Usage:
 *   npm run create:test-account           # buyer role
 *   npm run create:test-account -- admin  # admin role
 *
 * SAFETY: Refuses to run in production.
 */

import "reflect-metadata";
import "dotenv/config";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { DataSource } from "typeorm";

function buildDataSource(): DataSource {
  if (process.env.DATABASE_URL) {
    return new DataSource({
      type: "postgres",
      url: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("railway") ? { rejectUnauthorized: false } : false,
      entities: [],
      synchronize: false,
    });
  }
  return new DataSource({
    type: "postgres",
    host: process.env.PGHOST ?? "localhost",
    port: parseInt(process.env.PGPORT ?? "5432", 10),
    database: process.env.PGDATABASE ?? "pds_marketplace",
    username: process.env.PGUSER ?? "pds",
    password: process.env.PGPASSWORD ?? "pds_dev_password",
    entities: [],
    synchronize: false,
  });
}

const TEST_EMAIL = "test@pds.local";
const TEST_PASSWORD = "PdsLocal!Test1";

// Must match the users_role_enum values in the database
const ALLOWED_ROLES = ["admin", "designer", "producer", "service_provider", "author", "buyer"] as const;
type Role = typeof ALLOWED_ROLES[number];

async function createTestAccount() {
  if (process.env.NODE_ENV === "production") {
    console.error("❌  Refusing to create test account in production. Set NODE_ENV=development.");
    process.exit(1);
  }

  // Optional role override: npm run create:test-account -- admin
  const roleArg = process.argv[2] as Role | undefined;
  const role: Role = roleArg && (ALLOWED_ROLES as readonly string[]).includes(roleArg) ? roleArg : "buyer";

  if (roleArg && !(ALLOWED_ROLES as readonly string[]).includes(roleArg)) {
    console.warn(`⚠️  Unknown role "${roleArg}". Defaulting to "buyer".`);
    console.warn(`    Valid roles: ${ALLOWED_ROLES.join(", ")}`);
  }

  const ds = buildDataSource();
  await ds.initialize();

  const hash = await bcrypt.hash(TEST_PASSWORD, 10);

  const result = await ds.query(
    `INSERT INTO users (id, email, password, role, "isStaff")
     VALUES ($1, $2, $3, $4, false)
     ON CONFLICT (email) DO UPDATE
       SET password = EXCLUDED.password,
           role     = EXCLUDED.role,
           "isStaff" = false
     RETURNING id, email, role`,
    [crypto.randomUUID(), TEST_EMAIL, hash, role]
  );

  const row = result[0];

  console.log(`✅  Test account ready:`);
  console.log(`    email:    ${row.email}`);
  console.log(`    password: ${TEST_PASSWORD}`);
  console.log(`    role:     ${row.role}`);
  console.log(`    id:       ${row.id}`);

  await ds.destroy();
}

createTestAccount().catch((e) => {
  console.error("❌  create-test-account failed:", e.message);
  process.exit(1);
});
