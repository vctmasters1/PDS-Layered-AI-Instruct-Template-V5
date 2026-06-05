import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Baseline migration — marks the initial schema as "migrated."
 *
 * On a fresh database the startup code in index.ts detects zero tables and
 * runs synchronize() once to create the full schema from entities.  This
 * migration then records itself so future incremental migrations know the
 * baseline has been applied.
 *
 * On an existing database (already synchronize'd in dev or a previous deploy)
 * this is a no-op — the tables already exist.
 */
export class BaselineSchema1740000000000 implements MigrationInterface {
  name = "BaselineSchema1740000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The full schema is created by synchronize() in index.ts for fresh databases.
    // This migration is intentionally empty — it exists to record the baseline
    // so subsequent migrations can be incremental.
    console.log("📋 Baseline migration recorded (schema created by synchronize)");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverting the entire schema is not supported via this migration.
    // Use `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` manually if needed.
    console.log("📋 Baseline migration revert — no-op (manual schema drop required)");
  }
}
