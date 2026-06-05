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

export enum FulfillmentType {
  SELF = "self",
  PRODUCER = "producer",
}

@Entity("products")
@Index(["designerId"])
@Index(["category"])
@Index(["active"])
export class Product {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => User, (user) => user.designerProducts, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "designerId" })
  designer: User;

  @Column()
  designerId: string;

  @Column()
  name: string;

  @Column({ type: "text" })
  description: string;

  @Column({ unique: true })
  sku: string;

  @Column("decimal", { precision: 10, scale: 2 })
  price: number;

  @Column({ nullable: true, type: "text" })
  manufacturingRequirements: string;

  @Column()
  leadTime: number;

  @Column({
    type: "enum",
    enum: FulfillmentType,
    default: FulfillmentType.SELF,
  })
  fulfilledBy: FulfillmentType;

  @Column({ type: "simple-array", nullable: true })
  images: string[];

  @Column()
  category: string;

  @Column({ default: true })
  active: boolean;

  @Column("decimal", { precision: 10, scale: 2, nullable: true })
  productWidth: number | null;

  @Column("decimal", { precision: 10, scale: 2, nullable: true })
  productHeight: number | null;

  @Column("decimal", { precision: 10, scale: 2, nullable: true })
  productDepth: number | null;

  @Column("decimal", { precision: 10, scale: 4, nullable: true })
  productWeight: number | null;

  @Column("decimal", { precision: 10, scale: 2, nullable: true })
  shippingWidth: number | null;

  @Column("decimal", { precision: 10, scale: 2, nullable: true })
  shippingHeight: number | null;

  @Column("decimal", { precision: 10, scale: 2, nullable: true })
  shippingDepth: number | null;

  @Column("decimal", { precision: 10, scale: 4, nullable: true })
  shippingWeight: number | null;

  @Column({ default: 0 })
  stock: number;

  @Column({ default: 0 })
  reservedStock: number;

  @Column({ default: 100 })
  maxOrderQuantity: number;

  @Column({ type: "decimal", precision: 3, scale: 2, default: 0 })
  rating: number;

  @Column({ default: 0 })
  reviewCount: number;

  @Column({ default: 0 })
  verifiedReviewCount: number;

  @Column({ type: "simple-array", nullable: true })
  selectedProducerIds: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
