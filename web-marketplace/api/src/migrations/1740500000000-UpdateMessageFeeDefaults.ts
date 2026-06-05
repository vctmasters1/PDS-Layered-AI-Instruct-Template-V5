import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Update message_fees column defaults to reflect the new Stripe-aware fee split.
 *
 * Old: platformShare default 0.50, recipientShare default 0.50
 * New: platformShare default 0.34, recipientShare default 0.33
 *
 * $1.00 charge - Stripe (2.9% + $0.30 = $0.33) = $0.67 net
 * PipeDream: ceil($0.67 / 2) = $0.34
 * Recipient: $0.67 - $0.34 = $0.33
 *
 * NOTE: Existing records are NOT updated — only future inserts get the new defaults.
 */
export class UpdateMessageFeeDefaults1740500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "message_fees" ALTER COLUMN "platformShare" SET DEFAULT 0.34`
    );
    await queryRunner.query(
      `ALTER TABLE "message_fees" ALTER COLUMN "recipientShare" SET DEFAULT 0.33`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "message_fees" ALTER COLUMN "platformShare" SET DEFAULT 0.50`
    );
    await queryRunner.query(
      `ALTER TABLE "message_fees" ALTER COLUMN "recipientShare" SET DEFAULT 0.50`
    );
  }
}
