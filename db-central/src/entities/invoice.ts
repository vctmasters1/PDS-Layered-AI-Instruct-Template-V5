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

export enum InvoiceStatus {
  DRAFT = "draft",
  SENT = "sent",
  PAID = "paid",
  OVERDUE = "overdue",
  CANCELLED = "cancelled",
}

@Entity("invoices")
@Index(["orderId"])
@Index(["buyerId"])
@Index(["status"])
export class Invoice {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  invoiceNumber: string;

  @ManyToOne(() => Order, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "orderId" })
  order: Order;

  @Column({ nullable: true })
  orderId: string;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "buyerId" })
  buyer: User;

  @Column()
  buyerId: string;

  @Column("decimal", { precision: 10, scale: 2 })
  totalAmount: number;

  @Column("decimal", { precision: 10, scale: 2, default: 0 })
  tax: number;

  @Column("decimal", { precision: 10, scale: 2, default: 0 })
  shippingCost: number;

  @Column({ type: "enum", enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  status: InvoiceStatus;

  @Column({ nullable: true })
  dueDate: Date;

  @Column({ nullable: true })
  paidAt: Date;

  @Column({ nullable: true })
  stripePaymentIntentId: string;

  @Column({ nullable: true, type: "text" })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
