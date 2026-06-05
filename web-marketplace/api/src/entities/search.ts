import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";
import { User } from "./user.js";

@Entity("saved_searches")
@Index(["userId"])
export class SearchSavedSearch {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => User, { onDelete: "CASCADE", nullable: false })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column()
  userId: string;

  @Column()
  name: string;

  @Column()
  query: string;

  @Column("jsonb", { nullable: true })
  filters: string; // JSON search filters

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
