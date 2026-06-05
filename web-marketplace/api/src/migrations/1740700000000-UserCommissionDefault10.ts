import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Change User.commissionRate default from 0 to 10 (platform standard rate).
 * Update all existing non-admin users who still have the old default (0) to 10.
 * Admin users keep 0 (they don't sell).
 */
export class UserCommissionDefault101740700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update column default
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "commissionRate" SET DEFAULT 10`
    );

    // Set all existing non-admin users with 0% to the platform rate (10%)
    await queryRunner.query(
      `UPDATE "users" SET "commissionRate" = 10 WHERE "commissionRate" = 0 AND "role" != 'admin'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "commissionRate" SET DEFAULT 0`
    );
    // Note: cannot perfectly reverse individual rate changes
    await queryRunner.query(
      `UPDATE "users" SET "commissionRate" = 0 WHERE "commissionRate" = 10 AND "role" != 'admin'`
    );
  }
}
