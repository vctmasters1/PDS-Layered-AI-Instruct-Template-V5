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
import { Bid } from "./bid.js";
import { User } from "./user.js";

export enum DisputeStatus {
  FILED = "filed",
  UNDER_REVIEW = "under_review",
  AWAITING_RESPONSE = "awaiting_response",
  RESOLVED = "resolved",
  DROPPED = "dropped",
}

export enum DisputeResolution {
  BUYER_WINS = "buyer_wins",
  PRODUCER_WINS = "producer_wins",
  PARTIAL_REFUND = "partial_refund",
  PENDING = "pending",
}

export enum FailureType {
  PRODUCER_FAILURE_TO_PRODUCE = "producer_failure_to_produce",
  PRODUCER_FAILURE_TO_SHIP = "producer_failure_to_ship",
  PRODUCER_FAILURE_TO_DELIVER = "producer_failure_to_deliver",
  BUYER_FAILURE_TO_DEPOSIT = "buyer_failure_to_deposit",
  BUYER_FAILURE_TO_PAY_REMAINING = "buyer_failure_to_pay_remaining",
  QUALITY_ISSUE = "quality_issue",
  MISCOMMUNICATION = "miscommunication",
  OTHER = "other",
}

@Entity("disputes")
@Index(["bidId"])
@Index(["filedBy"])
@Index(["status"])
export class Dispute {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => Bid, (bid) => bid.disputes, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "bidId" })
  bid: Bid;

  @Column()
  bidId: string;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "filedBy" })
  filedByUser: User;

  @Column()
  filedBy: string;

  @Column({ type: "enum", enum: FailureType })
  failureType: FailureType;

  @Column({ type: "enum", enum: DisputeStatus, default: DisputeStatus.FILED })
  status: DisputeStatus;

  @Column({ type: "text" })
  description: string;

  @Column({ nullable: true, type: "jsonb" })
  evidence: string;

  @Column("decimal", { precision: 10, scale: 2 })
  claimedAmount: number;

  @Column({ nullable: true, type: "text" })
  respondentResponse: string;

  @Column({ nullable: true })
  respondentResponseDate: Date;

  @Column({ type: "enum", enum: DisputeResolution, default: DisputeResolution.PENDING })
  resolution: DisputeResolution;

  @Column({ nullable: true, type: "text" })
  adminNotes: string;

  @Column({ nullable: true, type: "decimal", precision: 10, scale: 2 })
  refundAmount: number;

  @Column({ nullable: true })
  resolvedAt: Date;

  @Column({ default: false })
  appealable: boolean;

  @Column({ default: false })
  appealed: boolean;

  @Column({ nullable: true })
  appealReason: string;

  @Column({ nullable: true })
  buyerEvidenceSubmitted: boolean;

  @Column({ nullable: true })
  producerEvidenceSubmitted: boolean;

  @Column({ nullable: true })
  stripeRefundId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
