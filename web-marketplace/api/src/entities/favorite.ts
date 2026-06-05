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
import { User } from "./user";
import { Product } from "./product";

@Entity("favorites")
@Index(["userId"])
@Index(["productId"])
@Unique(["userId", "productId"])
export class Favorite {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column()
  productId: string;

  @ManyToOne(() => User, {
    onDelete: "CASCADE",
    nullable: false,
  })
  @JoinColumn({ name: "userId" })
  user: User;

  @ManyToOne(() => Product, {
    onDelete: "CASCADE",
    nullable: false,
  })
  @JoinColumn({ name: "productId" })
  product: Product;

  @CreateDateColumn()
  createdAt: Date;
}
