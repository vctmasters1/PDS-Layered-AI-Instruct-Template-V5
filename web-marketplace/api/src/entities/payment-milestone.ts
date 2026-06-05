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

export enum MilestoneStatus {
  PENDING = "pending", // Awaiting payment/action
  COMPLETED = "completed", // Successfully completed
  FAILED = "failed", // Failed by one party
  DISPUTED = "disputed", // Under dispute
}

export enum MilestoneType {
  UPFRONT = "upfront", // Initial payment
  SHIPPING = "shipping", // When item ready to ship
  DELIVERY = "delivery", // Upon delivery
}

/**
 * PaymentMilestone - Tracks payment stages and buyer/producer actions
 */
@Entity("payment_milestones")
@Index(["bidId"])
@Index(["status"])
@Index(["type"])
export class PaymentMilestone {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => Bid, (bid) => bid.paymentMilestones, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "bidId" })
  bid: Bid;

  @Column()
  bidId: string;

  @Column({
    type: "enum",
    enum: MilestoneType,
  })
  type: MilestoneType;

  @Column("decimal", { precision: 10, scale: 2 })
  amount: number; // Dollar amount for this milestone

  @Column({ nullable: true, type: "decimal", precision: 5, scale: 2 })
  percentage: number; // Percentage of total bid for this milestone

  @Column({
    type: "enum",
    enum: MilestoneStatus,
    default: MilestoneStatus.PENDING,
  })
  status: MilestoneStatus;

  // Buyer Payment
  @Column({ default: false })
  buyerPaymentReceived: boolean;

  @Column({ nullable: true })
  buyerPaymentDate: Date;

  // Producer Action (what producer needs to do at this stage)
  @Column({ nullable: true })
  producerActionRequired: string; // e.g., "Confirm production started", "Confirm ready to ship"

  @Column({ default: false })
  producerActionCompleted: boolean;

  @Column({ nullable: true })
  producerActionCompletedDate: Date;

  @Column({ nullable: true })
  producerActionProof: string; // URL/reference to proof of action

  // Deadlines
  @Column({ nullable: true })
  dueDate: Date; // When this milestone must be completed

  @Column({ default: false })
  isOverdue: boolean;

  /** Stripe PaymentIntent ID for this milestone's charge */
  @Column({ nullable: true })
  stripePaymentIntentId: string;

  /** Stripe Transfer ID for the seller payout associated with this milestone */
  @Column({ nullable: true })
  stripeTransferId: string;

  /** Platform fee amount deducted from this milestone */
  @Column("decimal", { precision: 10, scale: 2, nullable: true })
  platformFeeAmount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Soft-delete: GAAP compliance — never hard-delete payment milestones
  @DeleteDateColumn()
  deletedAt: Date | null;
}
