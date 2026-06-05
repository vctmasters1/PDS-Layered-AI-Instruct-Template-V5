import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Creates the `firmwares` table used by WEB-FwServer/api.
 * Owned by WEB-FwServer/api. Moved from WEB-Marketplace/api — the shared
 * TypeORM migrations table already tracks this as applied, so it will not re-run.
 */
export class AddFirmwaresTable1741200000000 implements MigrationInterface {
  name = "AddFirmwaresTable1741200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "firmwares" (
        "id"                 uuid                NOT NULL DEFAULT gen_random_uuid(),
        "deviceType"         character varying   NOT NULL,
        "version"            character varying   NOT NULL,
        "minPreviousVersion" character varying,
        "changelog"          text,
        "binaryPath"         character varying   NOT NULL,
        "binarySize"         integer             NOT NULL,
        "sha256"             character varying   NOT NULL,
        "active"             boolean             NOT NULL DEFAULT true,
        "releasedAt"         TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_firmwares" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_firmwares_deviceType_version" UNIQUE ("deviceType", "version")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_firmwares_deviceType"         ON "firmwares" ("deviceType")`);
    await queryRunner.query(`CREATE INDEX "IDX_firmwares_deviceType_version" ON "firmwares" ("deviceType", "version")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_firmwares_deviceType_version"`);
    await queryRunner.query(`DROP INDEX "IDX_firmwares_deviceType"`);
    await queryRunner.query(`DROP TABLE "firmwares"`);
  }
}
