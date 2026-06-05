import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./user.js";

export enum ReportStatus {
  PENDING = "pending",
  REVIEWED = "reviewed",
  RESOLVED = "resolved",
  DISMISSED = "dismissed",
}

@Entity("reports")
@Index(["reporterId"])
@Index(["status"])
@Index(["targetId"])
export class Report {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "reporterId" })
  reporter: User;

  @Column({ nullable: true })
  reporterId: string;

  @Column()
  targetType: string;

  @Column()
  targetId: string;

  @Column({ type: "text" })
  reason: string;

  @Column({ nullable: true, type: "text" })
  details: string;

  @Column({ type: "enum", enum: ReportStatus, default: ReportStatus.PENDING })
  status: ReportStatus;

  @Column({ nullable: true })
  reviewedBy: string;

  @Column({ nullable: true, type: "text" })
  adminNote: string;

  @Column({ nullable: true })
  resolvedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
