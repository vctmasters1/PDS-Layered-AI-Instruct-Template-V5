import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds shippingName and billingName columns to the users table.
 * These store the recipient name for each address independently
 * from the user's account firstName/lastName.
 */
export class AddAddressNameFields1740200000000 implements MigrationInterface {
  name = "AddAddressNameFields1740200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "shippingName" varchar,
        ADD COLUMN IF NOT EXISTS "billingName" varchar
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "shippingName",
        DROP COLUMN IF EXISTS "billingName"
    `);
  }
}
