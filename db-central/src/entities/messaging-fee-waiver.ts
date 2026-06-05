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

export enum WaiverStatus {
  PENDING = "pending",
  APPROVED = "approved",
  DENIED = "denied",
}

@Entity("messaging_fee_waivers")
@Index(["requesterId"])
@Index(["status"])
export class MessagingFeeWaiver {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "requesterId" })
  requester: User;

  @Column()
  requesterId: string;

  @Column({ type: "text" })
  reason: string;

  @Column({ type: "enum", enum: WaiverStatus, default: WaiverStatus.PENDING })
  status: WaiverStatus;

  @Column({ nullable: true })
  reviewedBy: string;

  @Column({ nullable: true })
  reviewNote: string;

  @Column({ nullable: true })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
