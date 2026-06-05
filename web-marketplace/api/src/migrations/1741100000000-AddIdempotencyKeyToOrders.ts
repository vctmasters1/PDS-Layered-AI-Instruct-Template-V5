import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Add idempotencyKey column to orders table to prevent duplicate order creation on retry.
 * Unique per-buyer via partial index (NULL values excluded so they don't conflict).
 */
export class AddIdempotencyKeyToOrders1741100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "idempotencyKey" character varying`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_orders_buyer_idempotency"
       ON "orders" ("buyerId", "idempotencyKey")
       WHERE "idempotencyKey" IS NOT NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_buyer_idempotency"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "idempotencyKey"`);
  }
}
