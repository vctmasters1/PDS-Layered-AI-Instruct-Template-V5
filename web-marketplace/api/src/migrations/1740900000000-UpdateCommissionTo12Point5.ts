import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Update platform commission from 10% to 12.5% and user default commission from 10% to 12.5%.
 */
export class UpdateCommissionTo12Point51740900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update site_settings column default and existing rows
    await queryRunner.query(`ALTER TABLE "site_settings" ALTER COLUMN "platformFeePercent" SET DEFAULT 12.5`);
    await queryRunner.query(`UPDATE "site_settings" SET "platformFeePercent" = 12.5 WHERE "platformFeePercent" = 10`);

    // Update users column default and existing rows (non-admin users at old rate)
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "commissionRate" SET DEFAULT 12.5`);
    await queryRunner.query(
      `UPDATE "users" SET "commissionRate" = 12.5 WHERE "commissionRate" = 10 AND "role" != 'admin'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "site_settings" ALTER COLUMN "platformFeePercent" SET DEFAULT 10`);
    await queryRunner.query(`UPDATE "site_settings" SET "platformFeePercent" = 10 WHERE "platformFeePercent" = 12.5`);

    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "commissionRate" SET DEFAULT 10`);
    await queryRunner.query(
      `UPDATE "users" SET "commissionRate" = 10 WHERE "commissionRate" = 12.5 AND "role" != 'admin'`
    );
  }
}
