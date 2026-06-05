import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

/**
 * Tracks available firmware versions for each device target.
 * Binary files are stored in STORAGE_DIR/{board}/{hwrev}/{deviceType}/{version}/{filename}.
 * This table holds metadata and integrity info only.
 *
 * Unique firmware key: (board, hwrev, deviceType, version)
 *   board   — MCU/board family, e.g. "esp32_node32s", "esp32c3_sm", "efr32mg24"
 *   hwrev      — hardware revision, e.g. "hwrev_001"
 *   deviceType — handler slug (role family), e.g. "aeroponic-controller"
 *   version    — semver, e.g. "0.1.0"
 *
 * Note: individual role variants (AERO-001, AERO-005, etc.) within the same
 * deviceType share one binary — the role affects NVS/pipeline defaults only.
 *
 * Owned by WEB-FwServer — do not run migrations for this table from other services.
 */
@Entity("firmwares")
@Index(["board", "hwrev", "deviceType", "version"], { unique: true })
@Index(["board", "hwrev", "deviceType"])
export class Firmware {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** MCU/board family this binary targets, e.g. "esp32_node32s" */
  @Column()
  board: string;

  /** Hardware revision within the board, e.g. "hwrev_001" */
  @Column()
  hwrev: string;

  /** Device-type slug (role family) this firmware belongs to, e.g. "aeroponic-controller" */
  @Column()
  deviceType: string;

  /** Semver version string, e.g. "0.1.0" */
  @Column()
  version: string;

  /** Minimum firmware version required before upgrading to this one */
  @Column({ nullable: true })
  minPreviousVersion: string;

  /** Human-readable release notes / changelog */
  @Column({ type: "text", nullable: true })
  changelog: string;

  /** Relative path within STORAGE_DIR, e.g. "esp32_node32s/hwrev_001/aeroponic-controller/0.1.0/fw.bin" */
  @Column()
  binaryPath: string;

  /** File size in bytes */
  @Column()
  binarySize: number;

  /** SHA-256 hex digest of the binary for integrity verification */
  @Column()
  sha256: string;

  /** Whether this version is available for OTA distribution */
  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  releasedAt: Date;
}
