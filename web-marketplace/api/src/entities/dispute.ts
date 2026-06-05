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
  FILED = "filed", // Just filed
  UNDER_REVIEW = "under_review", // Admin reviewing
  AWAITING_RESPONSE = "awaiting_response", // Waiting for other party response
  RESOLVED = "resolved", // Admin made decision
  DROPPED = "dropped", // Dispute withdrawn
}

export enum DisputeResolution {
  BUYER_WINS = "buyer_wins", // Buyer gets refund
  PRODUCER_WINS = "producer_wins", // Producer keeps payment
  PARTIAL_REFUND = "partial_refund", // Split decision
  PENDING = "pending", // Not yet decided
}

export enum FailureType {
  // Producer failures
  PRODUCER_FAILURE_TO_PRODUCE = "producer_failure_to_produce",
  PRODUCER_FAILURE_TO_SHIP = "producer_failure_to_ship",
  PRODUCER_FAILURE_TO_DELIVER = "producer_failure_to_deliver",
  
  // Buyer failures
  BUYER_FAILURE_TO_DEPOSIT = "buyer_failure_to_deposit",
  BUYER_FAILURE_TO_PAY_REMAINING = "buyer_failure_to_pay_remaining",
  
  // Other
  QUALITY_ISSUE = "quality_issue",
  MISCOMMUNICATION = "miscommunication",
  OTHER = "other",
}

/**
 * Dispute - Conflict resolution system
 * Tracks disputes between buyers and producers with evidence and resolution
 */
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
  filedBy: string; // User ID who filed the dispute

  @Column({
    type: "enum",
    enum: FailureType,
  })
  failureType: FailureType;

  @Column({
    type: "enum",
    enum: DisputeStatus,
    default: DisputeStatus.FILED,
  })
  status: DisputeStatus;

  // Claim Details
  @Column({ type: "text" })
  description: string; // What went wrong

  @Column({ nullable: true, type: "jsonb" })
  evidence: string; // JSON array of evidence links/descriptions

  @Column("decimal", { precision: 10, scale: 2 })
  claimedAmount: number; // How much they're claiming

  // Response
  @Column({ nullable: true, type: "text" })
  respondentResponse: string; // Other party's response

  @Column({ nullable: true })
  respondentResponseDate: Date;

  // Resolution
  @Column({
    type: "enum",
    enum: DisputeResolution,
    default: DisputeResolution.PENDING,
  })
  resolution: DisputeResolution;

  @Column({ nullable: true, type: "text" })
  adminNotes: string; // Admin's reasoning

  @Column({ nullable: true, type: "decimal", precision: 10, scale: 2 })
  refundAmount: number; // Amount to refund buyer (if any)

  @Column({ nullable: true })
  resolvedAt: Date;

  @Column({ default: false })
  appealable: boolean;

  @Column({ default: false })
  appealed: boolean;

  @Column({ nullable: true })
  appealReason: string;

  // Evidence tracking
  @Column({ nullable: true })
  buyerEvidenceSubmitted: boolean;

  @Column({ nullable: true })
  producerEvidenceSubmitted: boolean;

  /** Stripe Refund ID (if a refund was issued for this dispute) */
  @Column({ nullable: true })
  stripeRefundId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Soft-delete: GAAP compliance — never hard-delete disputes
  @DeleteDateColumn()
  deletedAt: Date | null;
}
