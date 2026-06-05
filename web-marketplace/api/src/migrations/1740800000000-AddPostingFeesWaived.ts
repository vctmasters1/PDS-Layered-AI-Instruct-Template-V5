import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Add postingFeesWaived boolean column to User table.
 * Defaults to false — admin can toggle per-user to waive posting fees.
 */
export class AddPostingFeesWaived1740800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "postingFeesWaived" boolean NOT NULL DEFAULT false`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "postingFeesWaived"`
    );
  }
}
