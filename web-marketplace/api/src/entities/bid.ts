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
  IN_PRODUCTION = "in_production", // Accepted, production started
  READY_TO_SHIP = "ready_to_ship", // Production complete, ready to ship
  SHIPPED = "shipped", // Confirmed shipped by producer
  DELIVERED = "delivered", // Confirmed delivered by buyer
  COMPLETED = "completed", // Order fully complete
  DISPUTED = "disputed", // Under dispute
  CANCELLED = "cancelled", // Cancelled by either party
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

  @ManyToOne(() => Producer, {
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "producerId" })
  producer: Producer;

  @Column()
  producerId: string;

  // Bid Details
  @Column("decimal", { precision: 10, scale: 2 })
  quotedPrice: number;

  @Column()
  leadTimeDays: number; // Days to complete production

  @Column({ nullable: true, type: "text" })
  productionDetails: string; // Details about how they'll produce it

  @Column({ nullable: true, type: "text" })
  notes: string; // Any additional notes from producer

  @Column({
    type: "enum",
    enum: BidStatus,
    default: BidStatus.PENDING,
  })
  status: BidStatus;

  @Column()
  expiresAt: Date; // When bid expires if not accepted

  @Column({ default: false })
  selected: boolean; // Was this bid selected for the order?

  // Acceptance tracking
  @Column({ nullable: true })
  acceptedAt: Date; // When buyer accepted this bid

  @Column({ nullable: true })
  acceptedBy: string; // User ID of buyer who accepted

  // Production timeline
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

  // Status flags
  @Column({ default: false })
  buyerConfirmedDelivery: boolean; // Buyer confirmed they received item

  @Column({ nullable: true })
  buyerDeliveryConfirmDate: Date;

  // Progress tracking (producer updates progress on accepted bids)
  @Column({ type: "int", nullable: true })
  progressPercent: number; // 0-100

  @Column({ nullable: true, type: "text" })
  progressNote: string; // Free-text status update

  @Column({ default: false })
  archived: boolean; // Buyer or producer archived this bid card

  // Producer cost for custom bid posting ($1 fee)
  @Column({ nullable: true, type: "text" })
  message: string; // Bid message from producer

  // Relations to payment and disputes
  @OneToMany(() => PaymentMilestone, (milestone) => milestone.bid, { cascade: true })
  paymentMilestones: PaymentMilestone[];

  @OneToMany(() => Dispute, (dispute) => dispute.bid, { cascade: true })
  disputes: Dispute[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Soft-delete: GAAP compliance — never hard-delete bids
  @DeleteDateColumn()
  deletedAt: Date | null;
}

