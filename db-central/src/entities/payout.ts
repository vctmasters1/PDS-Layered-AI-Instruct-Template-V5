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
import { Order } from "./order.js";
import { Bid } from "./bid.js";

export enum PayoutStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

@Entity("payouts")
@Index(["producerId"])
@Index(["orderId"])
@Index(["bidId"])
@Index(["status"])
export class Payout {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "producerId" })
  producer: User;

  @Column()
  producerId: string;

  @ManyToOne(() => Order, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "orderId" })
  order: Order;

  @Column({ nullable: true })
  orderId: string;

  @ManyToOne(() => Bid, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "bidId" })
  bid: Bid;

  @Column({ nullable: true })
  bidId: string;

  @Column("decimal", { precision: 10, scale: 2 })
  amount: number;

  @Column("decimal", { precision: 10, scale: 2 })
  platformFee: number;

  @Column("decimal", { precision: 10, scale: 2 })
  netAmount: number;

  @Column({ type: "enum", enum: PayoutStatus, default: PayoutStatus.PENDING })
  status: PayoutStatus;

  @Column({ nullable: true })
  stripeTransferId: string;

  @Column({ nullable: true })
  processedAt: Date;

  @Column({ nullable: true, type: "text" })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
