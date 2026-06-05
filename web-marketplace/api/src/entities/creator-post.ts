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

@Entity("creator_posts")
@Index(["creatorType", "creatorId"])
@Index(["userId"])
export class CreatorPost {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // 'designer' | 'producer' — which profile this post belongs to
  @Column()
  creatorType: string;

  // UUID of the designer or producer record
  @Column()
  creatorId: string;

  // Denormalized userId for auth checks without extra joins
  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ nullable: true })
  title: string;

  @Column("text")
  content: string;

  // JSON array of image URLs (paths under /uploads/)
  @Column({ type: "text", default: "[]" })
  imageUrls: string;

  @Column({ default: 0 })
  likeCount: number;

  @Column({ default: 0 })
  commentCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
