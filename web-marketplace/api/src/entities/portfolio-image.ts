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

/**
 * Portfolio Image Entity
 * Stores past project images for user portfolios.
 * Each image is tagged with a service type (designer, producer, etc.)
 * so users can have separate galleries per service.
 * Maximum 50 images per user per service type.
 */

export enum PortfolioServiceType {
  DESIGNER = "designer",
  PRODUCER = "producer",
  MATERIALS = "materials",
  AUTHOR = "author",
  GIZMO = "gizmo",
}

@Entity("portfolio_images")
@Index(["userId", "serviceType"])
export class PortfolioImage {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({
    type: "varchar",
    default: PortfolioServiceType.DESIGNER,
  })
  serviceType: PortfolioServiceType;

  @Column()
  imageUrl: string; // e.g. /uploads/userId_uuid.webp

  @Column({ nullable: true })
  caption: string;

  @Column({ default: 0 })
  sortOrder: number; // for drag-and-drop reordering

  @CreateDateColumn()
  createdAt: Date;
}
