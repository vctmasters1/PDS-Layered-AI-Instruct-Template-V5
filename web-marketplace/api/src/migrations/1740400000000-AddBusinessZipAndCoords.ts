import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds businessZip, businessLatitude, businessLongitude to users table.
 * ZIP code is the user-facing input; coordinates are auto-resolved
 * for distance calculations on marketplace cards.
 */
export class AddBusinessZipAndCoords1740400000000 implements MigrationInterface {
  name = "AddBusinessZipAndCoords1740400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "businessZip" varchar,
        ADD COLUMN IF NOT EXISTS "businessLatitude" decimal(10,8),
        ADD COLUMN IF NOT EXISTS "businessLongitude" decimal(11,8)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "businessZip",
        DROP COLUMN IF EXISTS "businessLatitude",
        DROP COLUMN IF EXISTS "businessLongitude"
    `);
  }
}
