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

// ── Report Categories ───────────────────────────────────────────────
export enum ReportCategory {
  FAKE_ACCOUNT = "fake_account",
  SCAM = "scam",
  ILLEGAL_ACTIVITY = "illegal_activity",
  HARASSMENT = "harassment",
  INAPPROPRIATE_CONTENT = "inappropriate_content",
  INTELLECTUAL_PROPERTY = "intellectual_property",
  AMBIGUOUS_DESCRIPTION = "ambiguous_description",
  SPAM = "spam",
  OTHER = "other",
}

// ── Report Entity Type (what is being reported) ─────────────────────
export enum ReportEntityType {
  USER = "user",
  PRODUCT = "product",
  MESSAGE = "message",
  BULLETIN_CARD = "bulletin_card",
}

// ── Report Status ───────────────────────────────────────────────────
export enum ReportStatus {
  PENDING = "pending",
  UNDER_REVIEW = "under_review",
  RESOLVED = "resolved",
  DISMISSED = "dismissed",
}

@Entity("reports")
@Index(["reporterUserId"])
@Index(["reportedUserId"])
@Index(["status"])
@Index(["category"])
@Index(["createdAt"])
export class Report {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // ── Reporter (the user filing the report) ─────────────────────────
  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "reporterUserId" })
  reporterUser: User;

  @Column({ nullable: true })
  reporterUserId: string;

  // ── Reported user ─────────────────────────────────────────────────
  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "reportedUserId" })
  reportedUser: User;

  @Column({ nullable: true })
  reportedUserId: string;

  // ── What is being reported ────────────────────────────────────────
  @Column({
    type: "enum",
    enum: ReportEntityType,
  })
  entityType: ReportEntityType;

  /** ID of the reported entity (product ID, message ID, etc.) */
  @Column({ nullable: true })
  entityId: string;

  // ── Report details ────────────────────────────────────────────────
  @Column({
    type: "enum",
    enum: ReportCategory,
  })
  category: ReportCategory;

  /** Required explanation from the reporter */
  @Column({ type: "text" })
  description: string;

  // ── Admin review ──────────────────────────────────────────────────
  @Column({
    type: "enum",
    enum: ReportStatus,
    default: ReportStatus.PENDING,
  })
  status: ReportStatus;

  @Column({ type: "text", nullable: true })
  adminNotes: string;

  @Column({ nullable: true })
  resolvedByUserId: string;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "resolvedByUserId" })
  resolvedByUser: User;

  @Column({ nullable: true })
  resolvedAt: Date;

  // ── Timestamps ────────────────────────────────────────────────────
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
