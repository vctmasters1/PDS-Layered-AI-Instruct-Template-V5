import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./user.js";
import { CreatorPost } from "./creator-post.js";

@Entity("creator_post_likes")
@Index(["postId", "userId"], { unique: true })
export class CreatorPostLike {
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

  @CreateDateColumn()
  createdAt: Date;
}
