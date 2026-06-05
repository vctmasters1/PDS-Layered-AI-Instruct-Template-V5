import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

/**
 * SiteSettings - Admin-configured platform rules
 * Stores payment terms, default rates, and policies
 */
@Entity("site_settings")
export class SiteSettings {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // Payment Terms (in percentages, must total 100)
  @Column("decimal", { precision: 5, scale: 2, default: 40 })
  paymentUpfrontPercent: number; // % paid at bid acceptance (held in escrow)

  @Column("decimal", { precision: 5, scale: 2, default: 30 })
  paymentShippingPercent: number; // % paid when producer confirms shipment ready

  @Column("decimal", { precision: 5, scale: 2, default: 30 })
  paymentDeliveryPercent: number; // % paid on delivery completion

  // Dispute Resolution
  @Column({ default: 7 })
  disputeResponseDays: number; // Days responder has to respond to dispute

  @Column({ default: 14 })
  disputeResolutionDays: number; // Days to resolve before admin intervention

  // Platform Fees
  @Column("decimal", { precision: 5, scale: 2, default: 12.5 })
  platformFeePercent: number; // % commission on successful orders

  @Column("decimal", { precision: 10, scale: 2, default: 1.00 })
  postingFeePerRequest: number; // Fixed fee per custom request for bid posting

  // Tax Settings
  @Column("decimal", { precision: 5, scale: 2, default: 0 })
  salesTaxWithholdingPercent: number; // % for sales tax withholding

  // Failure Penalties (in percentage of order value)
  @Column("decimal", { precision: 5, scale: 2, default: 10 })
  producerFailureToProducePenalty: number;

  @Column("decimal", { precision: 5, scale: 2, default: 15 })
  producerFailureToShipPenalty: number;

  @Column("decimal", { precision: 5, scale: 2, default: 20 })
  producerFailureToDeliverPenalty: number;

  @Column("decimal", { precision: 5, scale: 2, default: 15 })
  buyerFailureToDepositPenalty: number;

  @Column("decimal", { precision: 5, scale: 2, default: 10 })
  buyerFailureToPayPenalty: number;

  // Metadata
  @Column({ nullable: true, type: "text" })
  disputeResolutionPolicy: string; // TOS about how disputes are resolved

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
