import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./user.js";
import { CreatorPost } from "./creator-post.js";

@Entity("creator_post_comments")
@Index(["postId"])
@Index(["userId"])
export class CreatorPostComment {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  postId: string;

  @ManyToOne(() => CreatorPost, { onDelete: "CASCADE" })
  @JoinColumn({ name: "postId" })
  post: CreatorPost;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column("text")
  content: string;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
