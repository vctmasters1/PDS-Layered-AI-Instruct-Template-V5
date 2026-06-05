import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  OneToOne,
  OneToMany,
} from "typeorm";
import { Designer } from "./designer.js";
import { Producer } from "./producer.js";
import { Product } from "./product.js";
import { Service } from "./service.js";

export enum UserRole {
  ADMIN = "admin",
  DESIGNER = "designer",
  PRODUCER = "producer",
  SERVICE_PROVIDER = "service_provider",
  AUTHOR = "author",
  BUYER = "buyer",
}

@Entity("users")
@Index(["role"])
@Index(["active"])
@Index(["createdAt"])
@Index(["suspendedUntil"])
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false }) // excluded from default SELECT — use .addSelect("u.password") in login queries
  password: string;

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @Column({ nullable: true })
  displayName: string;

  @Column({ nullable: true })
  phone: string;

  @Column({
    type: "enum",
    enum: UserRole,
    default: UserRole.BUYER,
  })
  role: UserRole;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ default: true })
  active: boolean;

  // Shipping Address
  @Column({ nullable: true })
  shippingName: string;

  @Column({ nullable: true })
  shippingStreet: string;

  @Column({ nullable: true })
  shippingCity: string;

  @Column({ nullable: true })
  shippingState: string;

  @Column({ nullable: true })
  shippingZip: string;

  @Column({ nullable: true })
  shippingCountry: string;

  // Billing Address
  @Column({ nullable: true })
  billingName: string;

  @Column({ nullable: true })
  billingStreet: string;

  @Column({ nullable: true })
  billingCity: string;

  @Column({ nullable: true })
  billingState: string;

  @Column({ nullable: true })
  billingZip: string;

  @Column({ nullable: true })
  billingCountry: string;

  @Column({ default: false })
  billingSameAsShipping: boolean;

  // Business Identity (propagates to all service cards)
  @Column({ nullable: true })
  businessName: string;

  @Column({ nullable: true })
  businessAddress: string;

  @Column({ nullable: true })
  businessCity: string;

  @Column({ nullable: true })
  businessState: string;

  @Column({ nullable: true })
  businessZip: string;

  @Column("decimal", { precision: 10, scale: 8, nullable: true })
  businessLatitude: number;

  @Column("decimal", { precision: 11, scale: 8, nullable: true })
  businessLongitude: number;

  // When true, public map shows fuzzed coordinates instead of exact position
  @Column({ default: false })
  locationPrivate: boolean;

  // Optional user-chosen pin offset when locationPrivate = true.
  // Server enforces max 40 km from real businessLatitude/Longitude.
  // Cleared automatically when the real address moves >40 km away.
  @Column("decimal", { precision: 10, scale: 8, nullable: true })
  customPinLat: number;

  @Column("decimal", { precision: 11, scale: 8, nullable: true })
  customPinLng: number;

  // Admin-specific fields
  @Column({ default: false })
  isStaff: boolean; // PipeDream marketplace employee

  @Column({ nullable: true })
  staffRole: string; // "moderator", "support", "analyst", etc.

  @Column({ default: false })
  verified: boolean; // Account verified by admin

  @Column({ nullable: true })
  suspendedReason: string;

  @Column({ nullable: true })
  suspendedUntil: Date;

  @Column({ type: "decimal", precision: 5, scale: 2, default: 12.5 })
  commissionRate: number; // Per-user commission rate (0-100%)

  @Column({ default: false })
  postingFeesWaived: boolean;

  @Column({ nullable: true })
  stripeCustomerId: string;

  @Column({ nullable: true })
  stripeAccountId: string;

  @Column({ default: false })
  stripeAccountOnboarded: boolean;

  // Registered service flags — controls marketplace tab visibility
  @Column({ default: false })
  activeDesigner: boolean;

  @Column({ default: false })
  activeProducer: boolean;

  @Column({ default: false })
  activeMaterials: boolean;

  @Column({ default: false })
  activeAuthor: boolean;

  @Column({ default: false })
  activeGizmo: boolean;

  // ── Service access flags ──────────────────────────────────────────────────
  // Extend this pattern for each product/service that requires explicit access grant.
  // Admin sets these flags. Each service's auth middleware checks its own flag.
  // See DB-Central AI-INSTRUCT.md § User Entity & Service Permissions.

  @Column({ default: false })
  resumeAccess: boolean; // Can access WEB-Resume AI tools

  @Column({ default: false })
  deviceNetworkAccess: boolean; // Can access WEB-HMI Device Network

  @Column({ default: false })
  propertyPortalAccess: boolean; // Can access WEB-PropertyPortal

  @Column({ default: false })
  isPropertyManager: boolean; // Has property manager role within the portal

  @Column({ default: false })
  isPropertyTenant: boolean; // Has tenant role within the portal (can be true alongside isPropertyManager)

  // ── Marketplace profile relations ─────────────────────────────────────────
  @OneToOne(() => Designer, (designer) => designer.user, { nullable: true })
  designerProfile?: Designer;

  @OneToOne(() => Producer, (producer) => producer.user, { nullable: true })
  producerProfile?: Producer;

  @OneToMany(() => Product, (product) => product.designer)
  designerProducts?: Product[];

  @OneToMany(() => Service, (service) => service.provider)
  providedServices?: Service[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Soft-delete: GAAP compliance — never hard-delete users
  @DeleteDateColumn()
  deletedAt: Date | null;

  @Column({ type: "varchar", nullable: true })
  deletedBy: string | null; // Admin ID who soft-deleted this user
}
