import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
  Unique,
} from "typeorm";
import { User } from "./user.js";
import { Product } from "./product.js";

@Entity("waitlist_entries")
@Index(["userId"])
@Index(["productId"])
@Unique(["userId", "productId"])
export class WaitlistEntry {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column()
  productId: string;

  // Snapshot so the entry is still readable if the product is deleted
  @Column({ nullable: true })
  productName: string;

  @ManyToOne(() => User, { onDelete: "CASCADE", nullable: false })
  @JoinColumn({ name: "userId" })
  user: User;

  @ManyToOne(() => Product, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "productId" })
  product: Product;

  @CreateDateColumn()
  createdAt: Date;
}
