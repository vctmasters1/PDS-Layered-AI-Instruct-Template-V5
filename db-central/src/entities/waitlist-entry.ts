import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

@Entity("waitlist_entries")
@Index(["email"])
@Index(["role"])
export class WaitlistEntry {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @Column({ nullable: true })
  role: string;

  @Column({ nullable: true, type: "text" })
  message: string;

  @Column({ default: false })
  contacted: boolean;

  @Column({ nullable: true })
  contactedAt: Date;

  @Column({ default: false })
  converted: boolean;

  @Column({ nullable: true })
  convertedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
