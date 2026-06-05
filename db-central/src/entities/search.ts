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

@Entity("search_history")
@Index(["userId"])
@Index(["createdAt"])
export class Search {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => User, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ nullable: true })
  userId: string;

  @Column()
  query: string;

  @Column({ nullable: true })
  category: string;

  @Column({ nullable: true })
  filters: string;

  @Column({ default: 0 })
  resultsCount: number;

  @Column({ nullable: true })
  sessionId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
