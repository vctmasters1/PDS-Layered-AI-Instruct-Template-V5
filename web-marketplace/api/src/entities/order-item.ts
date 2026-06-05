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
import { Order } from "./order.js";
import { Product } from "./product.js";

@Entity("order_items")
@Index(["orderId"])
@Index(["productId"])
export class OrderItem {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: "CASCADE" })
  @JoinColumn({ name: "orderId" })
  order: Order;

  @Column()
  orderId: string;

  @ManyToOne(() => Product, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "productId" })
  product: Product;

  @Column()
  productId: string;

  @Column()
  quantity: number;

  @Column("decimal", { precision: 10, scale: 2 })
  unitPrice: number; // Price at time of order (for history)

  @Column("decimal", { precision: 10, scale: 2 })
  totalPrice: number; // quantity * unitPrice

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Soft-delete: GAAP compliance
  @DeleteDateColumn()
  deletedAt: Date | null;
}
