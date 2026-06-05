// Migrations live here. Add each migration class to this array.
// Run with: npm run migrate  (from DB-Central/)
//
// Migration naming convention: <timestamp>_<DescriptiveName>.ts
// Generate via: npx typeorm migration:generate -d run-migrations.ts src/migrations/<Name>

import { MigrationInterface } from "typeorm";

// --- Add migration imports here as they are created: ---
// import { AddResumeAccess1234567890123 } from "./AddResumeAccess1234567890123.js";

export const migrations: MigrationInterface[] = [
  // new AddResumeAccess1234567890123(),
];
