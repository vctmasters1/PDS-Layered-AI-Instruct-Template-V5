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

@Entity("audit_logs")
@Index(["adminId"])
@Index(["targetId"])
@Index(["action"])
@Index(["createdAt"])
export class AuditLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "adminId" })
  admin: User;

  @Column({ nullable: true })
  adminId: string;

  @Column()
  action: string;

  @Column()
  targetType: string;

  @Column()
  targetId: string;

  @Column({ nullable: true, type: "jsonb" })
  before: string;

  @Column({ nullable: true, type: "jsonb" })
  after: string;

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ nullable: true })
  userAgent: string;

  @Column({ nullable: true, type: "text" })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;
}
