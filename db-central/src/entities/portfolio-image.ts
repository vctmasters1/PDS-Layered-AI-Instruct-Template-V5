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
import { Designer } from "./designer.js";

@Entity("portfolio_images")
@Index(["designerId"])
export class PortfolioImage {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => Designer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "designerId" })
  designer: Designer;

  @Column()
  designerId: string;

  @Column()
  url: string;

  @Column({ nullable: true })
  caption: string;

  @Column({ nullable: true })
  altText: string;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
