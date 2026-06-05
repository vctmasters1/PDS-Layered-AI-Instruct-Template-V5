import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

/**
 * AuditLog — Immutable append-only log for GAAP compliance.
 * 
 * Records every mutation (create, update, soft-delete) on financial entities
 * (Order, OrderItem, Bid, PaymentMilestone, Dispute, Product, Service, SiteSettings).
 * 
 * This entity should NEVER be updated or deleted. Rows are insert-only.
 */
@Entity("audit_logs")
@Index(["entityType", "entityId"])
@Index(["userId"])
@Index(["action"])
@Index(["createdAt"])
export class AuditLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** The type of entity that was changed (e.g., "Order", "Bid", "PaymentMilestone") */
  @Column()
  entityType: string;

  /** The UUID of the entity that was changed */
  @Column()
  entityId: string;

  /** The action performed: "CREATE", "UPDATE", "SOFT_DELETE", "STATUS_CHANGE" */
  @Column()
  action: string;

  /** The user who performed the action (null for system actions) */
  @Column({ nullable: true })
  userId: string;

  /** Snapshot of the changed fields (before → after) as JSON */
  @Column({ type: "jsonb", nullable: true })
  changes: string; // { fieldName: { old: value, new: value } }

  /** Full entity snapshot at the time of change (for reconstruct-ability) */
  @Column({ type: "jsonb", nullable: true })
  snapshot: string; // Full entity state after change

  /** Optional description of why the change was made */
  @Column({ type: "text", nullable: true })
  reason: string;

  /** IP address of the requester */
  @Column({ nullable: true })
  ipAddress: string;

  /** Immutable creation timestamp — never updated */
  @CreateDateColumn()
  createdAt: Date;
}
