import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { Device } from "./device.js";

@Entity("device_configs")
@Index(["deviceId"])
export class DeviceConfig {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => Device, { onDelete: "CASCADE" })
  @JoinColumn({ name: "deviceId" })
  device: Device;

  @Column()
  deviceId: string;

  @Column({ nullable: true, type: "varchar" })
  firmwareVersion: string | null;

  @Column({ nullable: true, type: "jsonb" })
  config: Record<string, unknown> | null;

  @Column({ nullable: true, type: "varchar" })
  submittedBy: string | null;

  @Column({ default: false })
  acknowledged: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
