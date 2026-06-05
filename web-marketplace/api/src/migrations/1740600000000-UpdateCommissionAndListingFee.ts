import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Update platform commission from 15% to 10% and listing fee from $0.10 to $1.00.
 */
export class UpdateCommissionAndListingFee1740600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update column defaults
    await queryRunner.query(`ALTER TABLE "site_settings" ALTER COLUMN "platformFeePercent" SET DEFAULT 10`);
    await queryRunner.query(`ALTER TABLE "site_settings" ALTER COLUMN "postingFeePerRequest" SET DEFAULT 1.00`);

    // Update any existing rows that still have the old defaults
    await queryRunner.query(`UPDATE "site_settings" SET "platformFeePercent" = 10 WHERE "platformFeePercent" = 15`);
    await queryRunner.query(`UPDATE "site_settings" SET "postingFeePerRequest" = 1.00 WHERE "postingFeePerRequest" = 0.10`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "site_settings" ALTER COLUMN "platformFeePercent" SET DEFAULT 15`);
    await queryRunner.query(`ALTER TABLE "site_settings" ALTER COLUMN "postingFeePerRequest" SET DEFAULT 0.10`);
    await queryRunner.query(`UPDATE "site_settings" SET "platformFeePercent" = 15 WHERE "platformFeePercent" = 10`);
    await queryRunner.query(`UPDATE "site_settings" SET "postingFeePerRequest" = 0.10 WHERE "postingFeePerRequest" = 1.00`);
  }
}
