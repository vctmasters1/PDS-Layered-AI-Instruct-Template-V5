import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from "typeorm";
import { Order } from "./order.js";
import { Producer } from "./producer.js";
import { PaymentMilestone } from "./payment-milestone.js";
import { Dispute } from "./dispute.js";

export enum BidStatus {
  PENDING = "pending",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
  EXPIRED = "expired",
  WITHDRAWN = "withdrawn",
  IN_PRODUCTION = "in_production",
  READY_TO_SHIP = "ready_to_ship",
  SHIPPED = "shipped",
  DELIVERED = "delivered",
  COMPLETED = "completed",
  DISPUTED = "disputed",
  CANCELLED = "cancelled",
}

@Entity("bids")
@Index(["orderId"])
@Index(["producerId"])
@Index(["status"])
@Index(["expiresAt"])
export class Bid {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => Order, (order) => order.bids, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "orderId" })
  order: Order;

  @Column()
  orderId: string;

  @ManyToOne(() => Producer, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "producerId" })
  producer: Producer;

  @Column()
  producerId: string;

  @Column("decimal", { precision: 10, scale: 2 })
  quotedPrice: number;

  @Column()
  leadTimeDays: number;

  @Column({ nullable: true, type: "text" })
  productionDetails: string;

  @Column({ nullable: true, type: "text" })
  notes: string;

  @Column({
    type: "enum",
    enum: BidStatus,
    default: BidStatus.PENDING,
  })
  status: BidStatus;

  @Column()
  expiresAt: Date;

  @Column({ default: false })
  selected: boolean;

  @Column({ nullable: true })
  acceptedAt: Date;

  @Column({ nullable: true })
  acceptedBy: string;

  @Column({ nullable: true })
  productionStartDate: Date;

  @Column({ nullable: true })
  expectedShipDate: Date;

  @Column({ nullable: true })
  actualShipDate: Date;

  @Column({ nullable: true })
  expectedDeliveryDate: Date;

  @Column({ nullable: true })
  actualDeliveryDate: Date;

  @Column({ default: false })
  buyerConfirmedDelivery: boolean;

  @Column({ nullable: true })
  buyerDeliveryConfirmDate: Date;

  @Column({ type: "int", nullable: true })
  progressPercent: number;

  @Column({ nullable: true, type: "text" })
  progressNote: string;

  @Column({ default: false })
  archived: boolean;

  @Column({ nullable: true, type: "text" })
  message: string;

  @OneToMany(() => PaymentMilestone, (milestone) => milestone.bid, { cascade: true })
  paymentMilestones: PaymentMilestone[];

  @OneToMany(() => Dispute, (dispute) => dispute.bid, { cascade: true })
  disputes: Dispute[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
