import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from "typeorm";
import { User } from "./user.js";
import { Designer } from "./designer.js";
import { Producer } from "./producer.js";
import { OrderItem } from "./order-item.js";
import { Bid } from "./bid.js";

export enum OrderStatus {
  PENDING = "pending",
  BID_ACCEPTED = "bid_accepted",
  IN_PRODUCTION = "in_production",
  READY_TO_SHIP = "ready_to_ship",
  SHIPPED = "shipped",
  DELIVERED = "delivered",
  CANCELLED = "cancelled",
  DISPUTED = "disputed",
}

@Entity("orders")
@Index(["buyerId"])
@Index(["designerId"])
@Index(["producerId"])
@Index(["status"])
@Index(["createdAt"])
@Index(["stripePaymentIntentId"])
@Index(["buyerId", "idempotencyKey"], { unique: true, where: '"idempotencyKey" IS NOT NULL' })
export class Order {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  orderNumber: string;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "buyerId" })
  buyer: User;

  @Column()
  buyerId: string;

  @ManyToOne(() => Designer, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "designerId" })
  designer?: Designer;

  @Column({ nullable: true })
  designerId: string;

  @ManyToOne(() => Producer, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "producerId" })
  producer?: Producer;

  @Column({ nullable: true })
  producerId: string;

  @Column({
    type: "enum",
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @Column("decimal", { precision: 10, scale: 2 })
  totalAmount: number;

  @Column("decimal", { precision: 10, scale: 2, nullable: true })
  subtotal: number;

  @Column("decimal", { precision: 10, scale: 2, nullable: true })
  tax: number;

  @Column("decimal", { precision: 10, scale: 2, nullable: true })
  shippingCost: number;

  @Column({ nullable: true })
  shippingAddressId: string;

  @Column({ nullable: true })
  billingAddressId: string;

  @Column({ nullable: true, type: "text" })
  notes: string;

  @Column({ nullable: true })
  idempotencyKey: string;

  @Column({ default: false })
  paymentReceived: boolean;

  @Column({ nullable: true })
  stripePaymentIntentId: string;

  @Column({ nullable: true })
  stripePaymentMethodId: string;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];

  @OneToMany(() => Bid, (bid) => bid.order)
  bids: Bid[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
