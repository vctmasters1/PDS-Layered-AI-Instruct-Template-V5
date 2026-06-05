import { LessThanOrEqual, In } from "typeorm";
import AppDataSource from "../database.js";
import { Payout, PayoutStatus, PayoutType, calculateHoldUntil } from "../entities/payout.js";
import { User } from "../entities/user.js";
import { SiteSettings } from "../entities/site-settings.js";
import { AuditService } from "./auditService.js";
import { invoiceService } from "./invoiceService.js";
import { InvoiceType } from "../entities/invoice.js";
import stripe from "../config/stripe.js";

const auditService = new AuditService();

/**
 * PayoutService — Manages the full payout lifecycle:
 *   1. Creates payout records with hold period
 *   2. Processes held payouts after hold expires
 *   3. Initiates Stripe Connect transfers
 *   4. Handles failures and cancellations
 *
 * Commission is deducted based on:
 *   - Per-user commissionRate (User.commissionRate) if set > 0
 *   - Otherwise platform default (SiteSettings.platformFeePercent)
 */
class PayoutService {
  /**
   * Get the effective commission rate for a user.
   * Uses per-user rate if set, otherwise falls back to site-wide default.
   */
  async getCommissionRate(userId: string): Promise<number> {
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId } });

    // Every user carries their own commission rate (defaults to 12.5%).
    // Admin can raise/lower individual rates via the dashboard.
    if (user) {
      return Number(user.commissionRate);
    }

    // Fallback for unknown user — use site-wide default
    const settingsRepo = AppDataSource.getRepository(SiteSettings);
    const settings = await settingsRepo.findOne({ where: { active: true } });
    return settings ? Number(settings.platformFeePercent) : 12.5;
  }

  /**
   * Create a payout record with mandatory hold period.
   * Does NOT initiate a Stripe transfer — that happens when the hold expires.
   */
  async createPayout(params: {
    userId: string;
    grossAmount: number;
    type: PayoutType;
    commissionRate?: number; // Override commission rate (e.g., messaging fees use 50%)
    sourceEntityType?: string;
    sourceEntityId?: string;
    description?: string;
    holdBusinessDays?: number; // Default: 3 business days
    metadata?: Record<string, any>;
  }): Promise<Payout> {
    const repo = AppDataSource.getRepository(Payout);

    // Calculate commission
    let commissionRate: number;
    if (params.commissionRate !== undefined) {
      commissionRate = params.commissionRate;
    } else {
      commissionRate = await this.getCommissionRate(params.userId);
    }

    const platformFee = parseFloat(
      ((params.grossAmount * commissionRate) / 100).toFixed(2)
    );
    const netAmount = parseFloat(
      (params.grossAmount - platformFee).toFixed(2)
    );

    const holdUntil = calculateHoldUntil(new Date(), params.holdBusinessDays || 3);

    const payout = repo.create({
      userId: params.userId,
      amount: params.grossAmount,
      platformFee,
      netAmount,
      status: PayoutStatus.HELD,
      type: params.type,
      holdUntil,
      sourceEntityType: params.sourceEntityType,
      sourceEntityId: params.sourceEntityId,
      description: params.description || `${params.type} payout`,
      metadata: {
        ...params.metadata,
        commissionRate,
      },
    });

    const saved = await repo.save(payout);

    // Create a corresponding payout invoice
    const invoice = await invoiceService.createPayoutInvoice({
      userId: params.userId,
      amount: params.grossAmount,
      platformFee,
      netAmount,
      description: saved.description || `Payout: ${params.type}`,
      sourceEntityType: params.sourceEntityType,
      sourceEntityId: params.sourceEntityId,
      metadata: { payoutId: saved.id, commissionRate },
    });

    // Link invoice to payout
    saved.invoiceId = invoice.id;
    await repo.save(saved);

    await auditService.logCreate("Payout", saved.id, params.userId, {
      amount: saved.amount,
      platformFee: saved.platformFee,
      netAmount: saved.netAmount,
      type: saved.type,
      holdUntil: saved.holdUntil,
      invoiceId: invoice.id,
    });

    console.log(
      `💸 Payout created: $${netAmount.toFixed(2)} to user ${params.userId} ` +
      `(held until ${holdUntil.toISOString().split("T")[0]})`
    );

    return saved;
  }

  /**
   * Create a messaging fee share payout.
   * Split: $1.00 charge - Stripe fees ($0.33) = $0.67 net.
   * PipeDream keeps $0.34 (rounded up), recipient gets $0.33.
   * The recipient share has NO additional commission deducted.
   */
  async createMessagingFeeSharePayout(params: {
    recipientId: string;
    recipientShare: number;
    messageFeeIds: string[];
    stripePaymentIntentId?: string;
  }): Promise<Payout> {
    return this.createPayout({
      userId: params.recipientId,
      grossAmount: params.recipientShare,
      type: PayoutType.MESSAGING_FEE_SHARE,
      commissionRate: 0, // No additional commission on messaging fee shares
      sourceEntityType: "message_fee_batch",
      sourceEntityId: params.messageFeeIds.join(","),
      description: `Messaging fee share — ${params.messageFeeIds.length} message(s)`,
      metadata: {
        messageFeeIds: params.messageFeeIds,
        stripePaymentIntentId: params.stripePaymentIntentId,
      },
    });
  }

  /**
   * Create an order commission payout to a producer/designer.
   * Uses the user's commission rate or site default.
   */
  async createOrderPayout(params: {
    userId: string;
    grossAmount: number;
    orderId: string;
    milestoneId?: string;
    milestoneType?: string;
  }): Promise<Payout> {
    return this.createPayout({
      userId: params.userId,
      grossAmount: params.grossAmount,
      type: PayoutType.ORDER_COMMISSION,
      sourceEntityType: params.milestoneId ? "payment_milestone" : "order",
      sourceEntityId: params.milestoneId || params.orderId,
      description: params.milestoneType
        ? `Order commission — ${params.milestoneType} milestone`
        : `Order commission — order ${params.orderId}`,
      metadata: {
        orderId: params.orderId,
        milestoneId: params.milestoneId,
        milestoneType: params.milestoneType,
      },
    });
  }

  /**
   * Process all held payouts whose hold period has expired.
   * Initiates Stripe Connect transfers for each.
   *
   * This should be called by a cron job (e.g., daily at 01:00 UTC).
   */
  async processReleasablePayouts(): Promise<{
    processed: number;
    failed: number;
    totalTransferred: number;
  }> {
    const repo = AppDataSource.getRepository(Payout);
    const userRepo = AppDataSource.getRepository(User);

    const now = new Date();

    // Find all HELD payouts whose hold period has expired
    const releasable = await repo.find({
      where: {
        status: PayoutStatus.HELD,
        holdUntil: LessThanOrEqual(now),
      },
      order: { createdAt: "ASC" },
    });

    if (releasable.length === 0) {
      console.log("💸 No payouts ready for release.");
      return { processed: 0, failed: 0, totalTransferred: 0 };
    }

    console.log(`💸 Processing ${releasable.length} releasable payout(s)...`);

    let processed = 0;
    let failed = 0;
    let totalTransferred = 0;

    for (const payout of releasable) {
      try {
        // Mark as processing
        payout.status = PayoutStatus.PROCESSING;
        payout.releasedAt = now;
        await repo.save(payout);

        // Get the user's Stripe Connect account
        const user = await userRepo.findOne({ where: { id: payout.userId } });
        if (!user) {
          throw new Error(`User ${payout.userId} not found`);
        }

        if (!user.stripeAccountId) {
          // User hasn't completed Stripe Connect onboarding
          // Keep in PROCESSING state — will be retried once they onboard
          console.warn(
            `⚠️  User ${payout.userId} (${user.email}) has no Stripe Connect account — payout ${payout.id} waiting for onboarding`
          );
          payout.failureReason = "User has not completed Stripe Connect onboarding";
          await repo.save(payout);
          failed++;
          continue;
        }

        // Initiate Stripe Connect transfer
        const amountCents = Math.round(Number(payout.netAmount) * 100);

        if (amountCents <= 0) {
          payout.status = PayoutStatus.COMPLETED;
          payout.completedAt = now;
          payout.description = (payout.description || "") + " (zero-amount, auto-completed)";
          await repo.save(payout);
          processed++;
          continue;
        }

        const transfer = await stripe.transfers.create({
          amount: amountCents,
          currency: "usd",
          destination: user.stripeAccountId,
          description: payout.description || `PDS Marketplace payout`,
          metadata: {
            payoutId: payout.id,
            userId: payout.userId,
            type: payout.type,
          },
        });

        // Mark completed
        payout.status = PayoutStatus.COMPLETED;
        payout.completedAt = new Date();
        payout.stripeTransferId = transfer.id;
        await repo.save(payout);

        // Update the linked invoice
        if (payout.invoiceId) {
          const { Invoice } = await import("../entities/invoice.js");
          const invoiceRepo = AppDataSource.getRepository(Invoice);
          await invoiceRepo.update(payout.invoiceId, {
            stripeTransferId: transfer.id,
            status: "paid" as any,
            paidAt: new Date(),
          });
        }

        await auditService.log({
          entityType: "Payout",
          entityId: payout.id,
          action: "STATUS_CHANGE",
          userId: payout.userId,
          changes: {
            status: { old: PayoutStatus.HELD, new: PayoutStatus.COMPLETED },
            stripeTransferId: { old: null, new: transfer.id },
          },
        });

        processed++;
        totalTransferred += Number(payout.netAmount);

        console.log(
          `✅ Payout ${payout.id} completed: $${Number(payout.netAmount).toFixed(2)} → ${user.email} (${transfer.id})`
        );

        // Rate limit respect
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (err: any) {
        payout.status = PayoutStatus.FAILED;
        payout.failureReason = err.message;
        await repo.save(payout);

        await auditService.log({
          entityType: "Payout",
          entityId: payout.id,
          action: "STATUS_CHANGE",
          changes: {
            status: { old: PayoutStatus.PROCESSING, new: PayoutStatus.FAILED },
            failureReason: { old: null, new: err.message },
          },
        });

        console.error(`❌ Payout ${payout.id} failed: ${err.message}`);
        failed++;
      }
    }

    console.log(
      `💸 Payout processing complete: ${processed} transferred ($${totalTransferred.toFixed(2)}), ${failed} failed`
    );

    return { processed, failed, totalTransferred };
  }

  /**
   * Cancel a pending/held payout (admin action or fraud detection).
   */
  async cancelPayout(
    payoutId: string,
    reason: string,
    adminUserId?: string
  ): Promise<Payout> {
    const repo = AppDataSource.getRepository(Payout);
    const payout = await repo.findOneOrFail({ where: { id: payoutId } });

    if (payout.status === PayoutStatus.COMPLETED) {
      throw new Error("Cannot cancel a completed payout — use refund instead");
    }
    if (payout.status === PayoutStatus.CANCELLED) {
      throw new Error("Payout is already cancelled");
    }

    const oldStatus = payout.status;
    payout.status = PayoutStatus.CANCELLED;
    payout.failureReason = reason;

    const saved = await repo.save(payout);

    await auditService.log({
      entityType: "Payout",
      entityId: saved.id,
      action: "STATUS_CHANGE",
      userId: adminUserId,
      changes: {
        status: { old: oldStatus, new: PayoutStatus.CANCELLED },
      },
      reason,
    });

    return saved;
  }

  /**
   * Retry a failed payout (moves it back to HELD with a new hold date).
   */
  async retryPayout(payoutId: string, adminUserId?: string): Promise<Payout> {
    const repo = AppDataSource.getRepository(Payout);
    const payout = await repo.findOneOrFail({ where: { id: payoutId } });

    if (payout.status !== PayoutStatus.FAILED) {
      throw new Error("Can only retry failed payouts");
    }

    payout.status = PayoutStatus.HELD;
    payout.holdUntil = calculateHoldUntil(new Date(), 1); // 1 business day for retries
    payout.failureReason = null as any;
    payout.releasedAt = null as any;

    const saved = await repo.save(payout);

    await auditService.log({
      entityType: "Payout",
      entityId: saved.id,
      action: "STATUS_CHANGE",
      userId: adminUserId,
      changes: {
        status: { old: PayoutStatus.FAILED, new: PayoutStatus.HELD },
      },
      reason: "Admin retry",
    });

    return saved;
  }

  /**
   * Get payout summary for a user.
   */
  async getUserPayoutSummary(userId: string): Promise<{
    totalEarned: number;
    totalPending: number;
    totalHeld: number;
    totalCompleted: number;
    totalFees: number;
    payouts: Payout[];
  }> {
    const repo = AppDataSource.getRepository(Payout);
    const payouts = await repo.find({
      where: { userId },
      order: { createdAt: "DESC" },
    });

    let totalEarned = 0;
    let totalPending = 0;
    let totalHeld = 0;
    let totalCompleted = 0;
    let totalFees = 0;

    for (const p of payouts) {
      const net = Number(p.netAmount);
      const fee = Number(p.platformFee);

      if (p.status === PayoutStatus.COMPLETED) {
        totalCompleted += net;
        totalEarned += net;
      } else if (p.status === PayoutStatus.HELD) {
        totalHeld += net;
        totalEarned += net;
      } else if (p.status === PayoutStatus.PENDING || p.status === PayoutStatus.PROCESSING) {
        totalPending += net;
        totalEarned += net;
      }
      totalFees += fee;
    }

    return {
      totalEarned: parseFloat(totalEarned.toFixed(2)),
      totalPending: parseFloat(totalPending.toFixed(2)),
      totalHeld: parseFloat(totalHeld.toFixed(2)),
      totalCompleted: parseFloat(totalCompleted.toFixed(2)),
      totalFees: parseFloat(totalFees.toFixed(2)),
      payouts,
    };
  }

  /**
   * Stripe Connect — Create an Express account for a user.
   */
  async createConnectAccount(userId: string): Promise<{
    accountId: string;
    onboardingUrl: string;
  }> {
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneOrFail({ where: { id: userId } });

    if (user.stripeAccountId) {
      // Already has an account — generate new onboarding link
      const accountLink = await stripe.accountLinks.create({
        account: user.stripeAccountId,
        refresh_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/account?stripe=refresh`,
        return_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/account?stripe=complete`,
        type: "account_onboarding",
      });

      return {
        accountId: user.stripeAccountId,
        onboardingUrl: accountLink.url,
      };
    }

    // Create a new Express connected account
    const account = await stripe.accounts.create({
      type: "express",
      email: user.email,
      metadata: {
        userId: user.id,
        source: "pds-marketplace",
      },
      capabilities: {
        transfers: { requested: true },
      },
    });

    // Save the account ID
    user.stripeAccountId = account.id;
    await userRepo.save(user);

    // Create an onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/account?stripe=refresh`,
      return_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/account?stripe=complete`,
      type: "account_onboarding",
    });

    await auditService.logCreate("StripeConnectAccount", account.id, userId, {
      email: user.email,
      stripeAccountId: account.id,
    });

    return {
      accountId: account.id,
      onboardingUrl: accountLink.url,
    };
  }

  /**
   * Check if a user's Stripe Connect account is fully onboarded.
   */
  async checkConnectStatus(userId: string): Promise<{
    hasAccount: boolean;
    onboarded: boolean;
    payoutsEnabled: boolean;
    chargesEnabled: boolean;
  }> {
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId } });

    if (!user || !user.stripeAccountId) {
      return {
        hasAccount: false,
        onboarded: false,
        payoutsEnabled: false,
        chargesEnabled: false,
      };
    }

    try {
      const account = await stripe.accounts.retrieve(user.stripeAccountId);

      const onboarded = !!(account.details_submitted && account.payouts_enabled);

      // Update our record if onboarding status changed
      if (onboarded !== user.stripeAccountOnboarded) {
        user.stripeAccountOnboarded = onboarded;
        await userRepo.save(user);
      }

      return {
        hasAccount: true,
        onboarded,
        payoutsEnabled: account.payouts_enabled || false,
        chargesEnabled: account.charges_enabled || false,
      };
    } catch {
      return {
        hasAccount: true,
        onboarded: false,
        payoutsEnabled: false,
        chargesEnabled: false,
      };
    }
  }
}

export const payoutService = new PayoutService();
export default payoutService;
