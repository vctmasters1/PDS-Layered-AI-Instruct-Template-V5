import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { Device } from "./device.js";

@Entity("telemetry_logs")
@Index(["deviceId"])
@Index(["capturedAt"])
export class TelemetryLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => Device, { onDelete: "CASCADE" })
  @JoinColumn({ name: "deviceId" })
  device: Device;

  @Column()
  deviceId: string;

  @Column({ type: "int", default: 0 })
  deviceTimestampUnix: number;

  @Column({ type: "int", default: 0 })
  deviceUptimeMs: number;

  @Column({ type: "int", default: 0 })
  packetId: number;

  @Column({ type: "int", default: 0 })
  statusFlags: number;

  @Column({ nullable: true, type: "jsonb" })
  snapshot: Record<string, unknown> | null;

  @CreateDateColumn()
  capturedAt: Date;
}
