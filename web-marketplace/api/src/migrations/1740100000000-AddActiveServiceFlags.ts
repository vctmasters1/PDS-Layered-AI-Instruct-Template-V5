import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds per-service active flags to the users table.
 * These control whether a user's listings appear in marketplace search tabs
 * without deleting their profile data when they deactivate a service.
 */
export class AddActiveServiceFlags1740100000000 implements MigrationInterface {
  name = "AddActiveServiceFlags1740100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add five boolean columns with default false
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "activeDesigner" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "activeProducer" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "activeMaterials" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "activeAuthor" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "activeGizmo" boolean NOT NULL DEFAULT false
    `);

    // Backfill: activate designers and producers who already have active profiles
    await queryRunner.query(`
      UPDATE "users" SET "activeDesigner" = true
      WHERE id IN (SELECT "userId" FROM "designers" WHERE active = true)
    `);
    await queryRunner.query(`
      UPDATE "users" SET "activeProducer" = true
      WHERE id IN (SELECT "userId" FROM "producers" WHERE active = true)
    `);

    console.log("✅ Added activeDesigner, activeProducer, activeMaterials, activeAuthor, activeGizmo columns to users");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "activeDesigner",
        DROP COLUMN IF EXISTS "activeProducer",
        DROP COLUMN IF EXISTS "activeMaterials",
        DROP COLUMN IF EXISTS "activeAuthor",
        DROP COLUMN IF EXISTS "activeGizmo"
    `);
  }
}
