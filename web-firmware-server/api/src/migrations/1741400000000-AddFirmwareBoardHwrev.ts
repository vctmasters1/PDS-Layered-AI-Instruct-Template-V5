import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `board` and `hwrev` columns to the `firmwares` table and replaces
 * the old (deviceType, version) unique constraint with the correct 4-tuple
 * (board, hwrev, deviceType, version) key.
 *
 * `board` and `hwrev` are added with DEFAULT '' so existing rows remain valid.
 * The FwServer startup SQL already adds these columns IF NOT EXISTS in dev;
 * this migration codifies the change for production deploys.
 */
export class AddFirmwareBoardHwrev1741400000000 implements MigrationInterface {
  name = "AddFirmwareBoardHwrev1741400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "firmwares" ADD COLUMN IF NOT EXISTS "board" character varying NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "firmwares" ADD COLUMN IF NOT EXISTS "hwrev" character varying NOT NULL DEFAULT ''`);

    // Drop the old 2-tuple unique constraint and index
    await queryRunner.query(`ALTER TABLE "firmwares" DROP CONSTRAINT IF EXISTS "UQ_firmwares_deviceType_version"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_firmwares_deviceType_version"`);

    // Create the correct 4-tuple unique index
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_firmwares_board_hwrev_deviceType_version" ON "firmwares" ("board", "hwrev", "deviceType", "version")`);

    // Non-unique covering index used by the list-versions query
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_firmwares_board_hwrev_deviceType" ON "firmwares" ("board", "hwrev", "deviceType")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_firmwares_board_hwrev_deviceType"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_firmwares_board_hwrev_deviceType_version"`);
    await queryRunner.query(`CREATE INDEX "IDX_firmwares_deviceType_version" ON "firmwares" ("deviceType", "version")`);
    await queryRunner.query(`ALTER TABLE "firmwares" ADD CONSTRAINT "UQ_firmwares_deviceType_version" UNIQUE ("deviceType", "version")`);
    await queryRunner.query(`ALTER TABLE "firmwares" DROP COLUMN IF EXISTS "hwrev"`);
    await queryRunner.query(`ALTER TABLE "firmwares" DROP COLUMN IF EXISTS "board"`);
  }
}
