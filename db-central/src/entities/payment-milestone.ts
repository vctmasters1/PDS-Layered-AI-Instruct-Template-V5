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
  PENDING = "pending",
  COMPLETED = "completed",
  FAILED = "failed",
  DISPUTED = "disputed",
}

export enum MilestoneType {
  UPFRONT = "upfront",
  SHIPPING = "shipping",
  DELIVERY = "delivery",
}

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

  @Column({ type: "enum", enum: MilestoneType })
  type: MilestoneType;

  @Column("decimal", { precision: 10, scale: 2 })
  amount: number;

  @Column({ nullable: true, type: "decimal", precision: 5, scale: 2 })
  percentage: number;

  @Column({ type: "enum", enum: MilestoneStatus, default: MilestoneStatus.PENDING })
  status: MilestoneStatus;

  @Column({ default: false })
  buyerPaymentReceived: boolean;

  @Column({ nullable: true })
  buyerPaymentDate: Date;

  @Column({ nullable: true })
  producerActionRequired: string;

  @Column({ default: false })
  producerActionCompleted: boolean;

  @Column({ nullable: true })
  producerActionCompletedDate: Date;

  @Column({ nullable: true })
  producerActionProof: string;

  @Column({ nullable: true })
  dueDate: Date;

  @Column({ default: false })
  isOverdue: boolean;

  @Column({ nullable: true })
  stripePaymentIntentId: string;

  @Column({ nullable: true })
  stripeTransferId: string;

  @Column("decimal", { precision: 10, scale: 2, nullable: true })
  platformFeeAmount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
