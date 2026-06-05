import AppDataSource from "../database.js";
import { Invoice, InvoiceType, InvoiceStatus } from "../entities/invoice.js";
import { User } from "../entities/user.js";
import { AuditService } from "./auditService.js";
import stripe from "../config/stripe.js";

const auditService = new AuditService();

/**
 * InvoiceService — Creates and manages invoices for all platform transactions.
 *
 * Every charge (signup, messaging, bulletin, order, milestone) and every
 * payout/refund gets a corresponding Invoice record for GAAP-compliant
 * audit trails.
 */
class InvoiceService {
  /**
   * Generate a unique invoice number: INV-YYYYMMDD-XXXXX
   */
  async generateInvoiceNumber(): Promise<string> {
    const repo = AppDataSource.getRepository(Invoice);
    const today = new Date();
    const dateStr =
      today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, "0") +
      String(today.getDate()).padStart(2, "0");

    // Count invoices created today for the sequence number
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);

    const count = await repo
      .createQueryBuilder("inv")
      .where("inv.createdAt >= :start", { start: todayStart })
      .getCount();

    const seq = String(count + 1).padStart(5, "0");
    return `INV-${dateStr}-${seq}`;
  }

  /**
   * Create an invoice for a charge (money collected from a user).
   */
  async createChargeInvoice(params: {
    userId: string;
    type: InvoiceType;
    amount: number;
    platformFee?: number;
    stripePaymentIntentId?: string;
    description: string;
    lineItems?: { description: string; quantity: number; unitPrice: number; total: number }[];
    sourceEntityType?: string;
    sourceEntityId?: string;
    metadata?: Record<string, any>;
  }): Promise<Invoice> {
    const repo = AppDataSource.getRepository(Invoice);

    const platformFee = params.platformFee || 0;
    const netAmount = params.amount - platformFee;

    const invoice = repo.create({
      invoiceNumber: await this.generateInvoiceNumber(),
      userId: params.userId,
      type: params.type,
      status: params.stripePaymentIntentId ? InvoiceStatus.PAID : InvoiceStatus.PENDING,
      amount: params.amount,
      platformFee,
      netAmount,
      stripePaymentIntentId: params.stripePaymentIntentId,
      description: params.description,
      lineItems: params.lineItems,
      sourceEntityType: params.sourceEntityType,
      sourceEntityId: params.sourceEntityId,
      metadata: params.metadata,
      issuedAt: new Date(),
      paidAt: params.stripePaymentIntentId ? new Date() : undefined,
    });

    const saved = await repo.save(invoice);

    await auditService.logCreate("Invoice", saved.id, params.userId, {
      invoiceNumber: saved.invoiceNumber,
      type: saved.type,
      amount: saved.amount,
      status: saved.status,
    });

    return saved;
  }

  /**
   * Create an invoice for a payout (money sent to a user).
   */
  async createPayoutInvoice(params: {
    userId: string;
    amount: number;
    platformFee: number;
    netAmount: number;
    stripeTransferId?: string;
    description: string;
    sourceEntityType?: string;
    sourceEntityId?: string;
    metadata?: Record<string, any>;
  }): Promise<Invoice> {
    const repo = AppDataSource.getRepository(Invoice);

    const invoice = repo.create({
      invoiceNumber: await this.generateInvoiceNumber(),
      userId: params.userId,
      type: InvoiceType.PAYOUT,
      status: params.stripeTransferId ? InvoiceStatus.PAID : InvoiceStatus.PENDING,
      amount: params.amount,
      platformFee: params.platformFee,
      netAmount: params.netAmount,
      stripeTransferId: params.stripeTransferId,
      description: params.description,
      sourceEntityType: params.sourceEntityType,
      sourceEntityId: params.sourceEntityId,
      metadata: params.metadata,
      issuedAt: new Date(),
      paidAt: params.stripeTransferId ? new Date() : undefined,
    });

    const saved = await repo.save(invoice);

    await auditService.logCreate("Invoice", saved.id, params.userId, {
      invoiceNumber: saved.invoiceNumber,
      type: saved.type,
      amount: saved.amount,
      netAmount: saved.netAmount,
      status: saved.status,
    });

    return saved;
  }

  /**
   * Create a refund invoice (money returned to a user).
   */
  async createRefundInvoice(params: {
    userId: string;
    amount: number;
    stripeRefundId?: string;
    description: string;
    sourceEntityType?: string;
    sourceEntityId?: string;
    metadata?: Record<string, any>;
  }): Promise<Invoice> {
    const repo = AppDataSource.getRepository(Invoice);

    const invoice = repo.create({
      invoiceNumber: await this.generateInvoiceNumber(),
      userId: params.userId,
      type: InvoiceType.REFUND,
      status: params.stripeRefundId ? InvoiceStatus.REFUNDED : InvoiceStatus.PENDING,
      amount: params.amount,
      platformFee: 0,
      netAmount: params.amount,
      stripeRefundId: params.stripeRefundId,
      description: params.description,
      sourceEntityType: params.sourceEntityType,
      sourceEntityId: params.sourceEntityId,
      metadata: params.metadata,
      issuedAt: new Date(),
      paidAt: params.stripeRefundId ? new Date() : undefined,
    });

    const saved = await repo.save(invoice);

    await auditService.logCreate("Invoice", saved.id, params.userId, {
      invoiceNumber: saved.invoiceNumber,
      type: saved.type,
      amount: saved.amount,
      status: saved.status,
    });

    return saved;
  }

  /**
   * Mark an invoice as paid.
   */
  async markPaid(invoiceId: string, stripePaymentIntentId?: string): Promise<Invoice> {
    const repo = AppDataSource.getRepository(Invoice);
    const invoice = await repo.findOneOrFail({ where: { id: invoiceId } });

    const oldStatus = invoice.status;
    invoice.status = InvoiceStatus.PAID;
    invoice.paidAt = new Date();
    if (stripePaymentIntentId) {
      invoice.stripePaymentIntentId = stripePaymentIntentId;
    }

    const saved = await repo.save(invoice);

    await auditService.log({
      entityType: "Invoice",
      entityId: saved.id,
      action: "STATUS_CHANGE",
      changes: { status: { old: oldStatus, new: InvoiceStatus.PAID } },
    });

    return saved;
  }

  /**
   * Mark an invoice as failed.
   */
  async markFailed(invoiceId: string, reason?: string): Promise<Invoice> {
    const repo = AppDataSource.getRepository(Invoice);
    const invoice = await repo.findOneOrFail({ where: { id: invoiceId } });

    const oldStatus = invoice.status;
    invoice.status = InvoiceStatus.FAILED;
    if (reason) {
      invoice.metadata = { ...(invoice.metadata || {}), failureReason: reason };
    }

    const saved = await repo.save(invoice);

    await auditService.log({
      entityType: "Invoice",
      entityId: saved.id,
      action: "STATUS_CHANGE",
      changes: { status: { old: oldStatus, new: InvoiceStatus.FAILED } },
    });

    return saved;
  }

  /**
   * Get invoices for a specific user.
   */
  async getUserInvoices(
    userId: string,
    options?: { type?: InvoiceType; status?: InvoiceStatus; limit?: number; offset?: number }
  ): Promise<{ invoices: Invoice[]; total: number }> {
    const repo = AppDataSource.getRepository(Invoice);
    const qb = repo
      .createQueryBuilder("inv")
      .where("inv.userId = :userId", { userId })
      .orderBy("inv.createdAt", "DESC");

    if (options?.type) {
      qb.andWhere("inv.type = :type", { type: options.type });
    }
    if (options?.status) {
      qb.andWhere("inv.status = :status", { status: options.status });
    }

    const total = await qb.getCount();
    const invoices = await qb
      .take(options?.limit || 50)
      .skip(options?.offset || 0)
      .getMany();

    return { invoices, total };
  }
}

export const invoiceService = new InvoiceService();
export default invoiceService;
