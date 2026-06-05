import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

/**
 * Minimal User stub — maps to the same 'users' table owned by marketplace.
 * Only the fields required by this service are mapped here.
 */
@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ default: false })
  isStaff: boolean;
}
