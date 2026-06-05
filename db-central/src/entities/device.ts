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
import { User } from "./user.js";

@Entity("devices")
@Index(["ownerId"])
@Index(["serialNumber"], { unique: true })
@Index(["deviceType"])
export class Device {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  serialNumber: string;

  @Column()
  deviceType: string;

  @Column({ nullable: true, type: "varchar" })
  displayName: string | null;

  @Column({ nullable: true, type: "varchar" })
  friendlyName: string | null;

  // Ownership
  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "ownerId" })
  owner: User;

  @Column({ nullable: true, type: "varchar" })
  ownerId: string | null;

  @Column({ nullable: true, type: "timestamptz" })
  claimedAt: Date | null;

  @Column({ nullable: true, select: false, type: "varchar" }) // one-time code burned on claim
  claimCode: string | null;

  @Column({ default: 0 })
  claimAttempts: number;

  @Column({ nullable: true, type: "timestamptz" })
  claimLockedUntil: Date | null;

  @Column({ nullable: true, select: false, type: "varchar" }) // secret returned once at claim time
  deviceToken: string | null;

  // Hardware identity
  @Column({ nullable: true, type: "varchar" })
  firmwareVersion: string;

  @Column({ nullable: true, type: "varchar" })
  board: string | null;

  @Column({ nullable: true, type: "varchar" })
  hwrev: string | null;

  @Column({ nullable: true, type: "varchar" })
  role: string | null;

  // Flags
  @Column({ default: true })
  active: boolean;

  @Column({ default: false })
  autoUpdateEnabled: boolean;

  @Column({ default: false })
  cloudEnabled: boolean;

  @Column({ default: false })
  pendingSyncRequest: boolean;

  // Live state
  @Column({ nullable: true, type: "timestamptz" })
  lastSeenAt: Date | null;

  @Column({ nullable: true, type: "jsonb" })
  liveState: Record<string, unknown> | null;

  // Config management
  @Column({ nullable: true, type: "jsonb" })
  pendingConfig: Record<string, unknown> | null;

  @Column({ nullable: true, type: "jsonb" })
  currentConfig: Record<string, unknown> | null;

  // Pipeline management — base64-encoded framed binary: [len:4LE][L1][len:4LE][L2][len:4LE][L3]
  @Column({ nullable: true, type: "text" })
  pendingPipeline: string | null;

  @Column({ nullable: true, type: "text" })
  currentPipeline: string | null;

  @Column({ nullable: true, type: "timestamptz" })
  pendingPipelineAt: Date | null;

  @Column({ nullable: true, type: "timestamptz" })
  settingsSavedAt: Date | null;

  @Column({ nullable: true, type: "timestamptz" })
  settingsConfirmedAt: Date | null;

  @Column({ nullable: true, type: "jsonb" })
  pipelineMeta: Record<string, unknown> | null;

  // OTA
  @Column({ nullable: true, type: "varchar" })
  pendingOtaVersion: string | null;

  @Column({ nullable: true, type: "varchar" })
  pendingOtaUrl: string | null;

  // Cloud subscription (Stripe)
  @Column({ nullable: true, type: "varchar" })
  cloudSubscriptionId: string | null;

  @Column({ nullable: true, type: "timestamptz" })
  cloudPeriodEnd: Date | null;

  // Pending firmware command (jsonb envelope: { type, payload })
  @Column({ nullable: true, type: "jsonb" })
  pendingCommand: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
