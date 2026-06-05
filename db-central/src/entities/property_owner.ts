import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { User } from "./user.js";

/**
 * PropertyOwner - the legal owner of one or more properties.
 * A portal manager (User) may manage properties on behalf of multiple owners.
 * One owner can have many properties across many complexes.
 */
@Entity("property_owners")
export class PropertyOwner {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // ── Identity ──────────────────────────────────────────────────────────────
  @Column()
  name: string; // Legal name / company name

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  state: string;

  @Column({ nullable: true })
  zipCode: string;

  @Column({ type: "text", nullable: true })
  notes: string;

  // ── Owning manager ────────────────────────────────────────────────────────
  // The portal User (isPropertyManager=true) who manages properties for this owner.
  @Column({ nullable: true })
  managerId: string;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  manager: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
