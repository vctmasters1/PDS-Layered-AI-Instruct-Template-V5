import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds businessName, businessCity, businessState to the users table.
 * These store the user's single Business Identity that propagates
 * to all cards (designer, producer, materials, gizmos, etc.).
 * Backfills from existing designer/producer profiles where available.
 */
export class AddBusinessIdentityToUser1740300000000 implements MigrationInterface {
  name = "AddBusinessIdentityToUser1740300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "businessName" varchar,
        ADD COLUMN IF NOT EXISTS "businessCity" varchar,
        ADD COLUMN IF NOT EXISTS "businessState" varchar
    `);

    // Backfill from designer profiles (prefer designer data if present)
    await queryRunner.query(`
      UPDATE "users" u
      SET "businessName" = d."businessName",
          "businessCity" = d."location_city",
          "businessState" = d."location_state"
      FROM "designers" d
      WHERE d."userId" = u.id
        AND u."businessName" IS NULL
    `);

    // Backfill from producer profiles for users who aren't also designers
    await queryRunner.query(`
      UPDATE "users" u
      SET "businessName" = p."businessName",
          "businessCity" = p."location_city",
          "businessState" = p."location_state"
      FROM "producers" p
      WHERE p."userId" = u.id
        AND u."businessName" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "businessName",
        DROP COLUMN IF EXISTS "businessCity",
        DROP COLUMN IF EXISTS "businessState"
    `);
  }
}
