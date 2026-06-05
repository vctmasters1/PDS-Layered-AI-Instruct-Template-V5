import cron from "node-cron";
import AppDataSource from "../database.js";
import { MessageFee } from "../entities/message-fee.js";
import { User } from "../entities/user.js";
import { Not, IsNull } from "typeorm";
import { invoiceService } from "../services/invoiceService.js";
import { payoutService } from "../services/payoutService.js";
import { InvoiceType } from "../entities/invoice.js";
import { PayoutType } from "../entities/payout.js";
import stripe from "../config/stripe.js";

/** Import the canonical fee amount */
const MESSAGE_FEE_AMOUNT = 1.0;

// PostgreSQL advisory lock key for billing (arbitrary unique int)
const BILLING_LOCK_KEY = 100001;

/**
 * Get the billing period string for "yesterday" (the period that just ended).
 * Billing runs at midnight UTC, so we bill for the previous day.
 */
function getYesterdayBillingPeriod(): string {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().split("T")[0]; // YYYY-MM-DD
}

/**
 * Bill a single user for their accumulated messaging fees.
 * Charges their saved Stripe payment method.
 *
 * Invoice line items show the FIXED per-message split:
 *   $1.00 → Stripe $0.33, PipeDream $0.34, Recipient $0.33
 * The actual Stripe batch fee is lower (2.9% + $0.30 on the total),
 * so PipeDream keeps the savings from batching.  This is internal.
 */
async function billUser(
  senderId: string,
  totalAmount: number,
  fees: MessageFee[],
  platformTotal: number,
  recipientShares: Map<string, { total: number; feeIds: string[] }>,
  recipientNames: Map<string, string>
): Promise<{ success: boolean; error?: string; chargeId?: string }> {
  const userRepo = AppDataSource.getRepository(User);
  const feeRepo = AppDataSource.getRepository(MessageFee);
  const feeIds = fees.map((f) => f.id);

  const user = await userRepo.findOne({ where: { id: senderId } });
  if (!user) {
    return { success: false, error: `User ${senderId} not found` };
  }

  if (!user.stripeCustomerId) {
    console.warn(
      `⚠️  User ${senderId} (${user.email}) has no Stripe customer ID — skipping charge`
    );
    return {
      success: false,
      error: "No Stripe customer ID on file",
    };
  }

  try {
    // Atomically claim these fees (set billed=true BEFORE charging).
    // If the charge fails, we roll them back to billed=false.
    // This prevents a concurrent billing cycle from picking up the same fees.
    const claimResult = await feeRepo
      .createQueryBuilder()
      .update(MessageFee)
      .set({ billed: true })
      .whereInIds(feeIds)
      .andWhere("billed = false")
      .execute();

    // If another cycle already claimed some/all, adjust
    if (!claimResult.affected || claimResult.affected === 0) {
      console.warn(`⚠️  All fees for user ${senderId} already claimed — skipping`);
      return { success: false, error: "Fees already claimed by another billing run" };
    }

    // Get the customer's default payment method
    const paymentMethods = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: "card",
      limit: 1,
    });

    if (paymentMethods.data.length === 0) {
      console.warn(
        `⚠️  User ${senderId} (${user.email}) has no payment methods — skipping`
      );
      return { success: false, error: "No payment method on file" };
    }

    const paymentMethodId = paymentMethods.data[0].id;

    // Create and confirm the PaymentIntent (off-session charge)
    const amountCents = Math.round(totalAmount * 100);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      customer: user.stripeCustomerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      description: `PDS Marketplace messaging fees — ${feeIds.length} message(s)`,
      metadata: {
        type: "messaging_fee",
        userId: senderId,
        feeCount: String(feeIds.length),
      },
    });

    // Stamp billedAt now that the charge succeeded
    const now = new Date();
    await feeRepo
      .createQueryBuilder()
      .update(MessageFee)
      .set({ billedAt: now, stripePaymentIntentId: paymentIntent.id })
      .whereInIds(feeIds)
      .execute();

    // Create an invoice for this charge
    // Line items show the FIXED per-message split regardless of actual Stripe batch fee.
    // PipeDream keeps Stripe batch savings internally.
    const STATED_STRIPE = 0.33;
    const STATED_PLATFORM = 0.34;
    const STATED_RECIPIENT = 0.33;

    try {
      await invoiceService.createChargeInvoice({
        userId: senderId,
        type: InvoiceType.MESSAGING_FEE,
        amount: totalAmount,
        platformFee: platformTotal,
        stripePaymentIntentId: paymentIntent.id,
        description: `Messaging fees — ${feeIds.length} message(s)`,
        lineItems: fees.map((fee) => {
          const dt = new Date(fee.createdAt);
          const date = dt.toISOString().split("T")[0]; // YYYY-MM-DD
          const time = dt.toISOString().split("T")[1].substring(0, 5); // HH:MM
          const contact = recipientNames.get(fee.recipientId) || fee.recipientId;
          return {
            description: `${date} ${time} UTC · To: ${contact}`,
            quantity: 1,
            unitPrice: MESSAGE_FEE_AMOUNT,
            total: MESSAGE_FEE_AMOUNT,
            stripeFee: STATED_STRIPE,
            platformShare: STATED_PLATFORM,
            recipientShare: STATED_RECIPIENT,
          };
        }),
        sourceEntityType: "message_fee_batch",
        sourceEntityId: feeIds.join(","),
        metadata: { feeCount: feeIds.length },
      });
    } catch (invoiceErr: any) {
      console.warn(`⚠️  Invoice creation failed for user ${senderId}: ${invoiceErr.message}`);
    }

    // Create payouts for message recipients (the 50% recipient share)
    try {
      for (const [recipientId, recipientData] of recipientShares) {
        await payoutService.createMessagingFeeSharePayout({
          recipientId,
          recipientShare: recipientData.total,
          messageFeeIds: recipientData.feeIds,
          stripePaymentIntentId: paymentIntent.id,
        });
      }
    } catch (payoutErr: any) {
      console.warn(`⚠️  Recipient payout creation failed: ${payoutErr.message}`);
    }

    console.log(
      `✅ Charged ${user.email} $${totalAmount.toFixed(2)} for ${feeIds.length} message(s) — PI: ${paymentIntent.id}`
    );

    return { success: true, chargeId: paymentIntent.id };
  } catch (err: any) {
    // Charge failed — rollback the claim so fees are retried next cycle
    await feeRepo
      .createQueryBuilder()
      .update(MessageFee)
      .set({ billed: false })
      .whereInIds(feeIds)
      .andWhere("billedAt IS NULL") // only rollback if not actually charged
      .execute();

    console.error(
      `❌ Failed to charge user ${senderId} (${user.email}): ${err.message}`
    );
    return { success: false, error: err.message };
  }
}

/**
 * Concurrency guard — prevents two billing cycles from running at the same
 * time (e.g., cron fires while an admin-triggered cycle is still in progress).
 * Uses both an in-memory flag (single-instance) and a PostgreSQL advisory
 * lock (multi-instance / multi-replica safety).
 */
let billingInProgress = false;

/**
 * Main billing job: find all unbilled non-waived fees and charge each sender.
 * Runs once per day at midnight UTC.
 */
async function runBillingCycle() {
  if (billingInProgress) {
    console.warn("💰 Billing cycle already in progress — skipping duplicate run");
    return;
  }

  billingInProgress = true;

  // Acquire a PostgreSQL advisory lock so only one replica runs the billing
  const qr = AppDataSource.createQueryRunner();
  try {
    const lockResult = await qr.query(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [BILLING_LOCK_KEY]
    );
    if (!lockResult[0]?.acquired) {
      console.log("💰 Another instance holds the billing lock — skipping");
      return;
    }

    await executeBillingCycle();
  } finally {
    // Release the advisory lock
    await qr.query("SELECT pg_advisory_unlock($1)", [BILLING_LOCK_KEY]).catch(() => {});
    await qr.release();
    billingInProgress = false;
  }
}

async function executeBillingCycle() {
  console.log("💰 Starting daily messaging fee billing cycle...");

  const feeRepo = AppDataSource.getRepository(MessageFee);

  // Find all unbilled, non-waived fees (any period — catches stragglers too)
  // Join recipient User so we can include their name on invoice line items.
  const unbilledFees = await feeRepo.find({
    where: { billed: false, waived: false },
    relations: ["recipient"],
    order: { createdAt: "ASC" },
  });

  if (unbilledFees.length === 0) {
    console.log("💰 No unbilled messaging fees — nothing to charge.");
    return;
  }

  // Group fees by senderId, tracking recipient shares and platform totals
  const feesBySender = new Map<
    string,
    {
      total: number;
      fees: MessageFee[];
      platformTotal: number;
      recipientShares: Map<string, { total: number; feeIds: string[] }>;
      recipientNames: Map<string, string>;
    }
  >();

  for (const fee of unbilledFees) {
    const existing = feesBySender.get(fee.senderId) || {
      total: 0,
      fees: [] as MessageFee[],
      platformTotal: 0,
      recipientShares: new Map<string, { total: number; feeIds: string[] }>(),
      recipientNames: new Map<string, string>(),
    };
    existing.total += Number(fee.amount);
    existing.fees.push(fee);
    existing.platformTotal += Number(fee.platformShare);

    // Track per-recipient shares for payout creation
    const recipientData = existing.recipientShares.get(fee.recipientId) || {
      total: 0,
      feeIds: [] as string[],
    };
    recipientData.total += Number(fee.recipientShare);
    recipientData.feeIds.push(fee.id);
    existing.recipientShares.set(fee.recipientId, recipientData);

    // Cache recipient display name for invoice line items
    if (!existing.recipientNames.has(fee.recipientId) && fee.recipient) {
      const name = [fee.recipient.firstName, fee.recipient.lastName].filter(Boolean).join(" ") || fee.recipient.email;
      existing.recipientNames.set(fee.recipientId, name);
    }

    feesBySender.set(fee.senderId, existing);
  }

  console.log(
    `💰 Found ${unbilledFees.length} unbilled fee(s) across ${feesBySender.size} sender(s)`
  );

  let successCount = 0;
  let failCount = 0;
  let totalCharged = 0;

  for (const [senderId, { total, fees, platformTotal, recipientShares, recipientNames }] of feesBySender) {
    const result = await billUser(senderId, total, fees, platformTotal, recipientShares, recipientNames);
    if (result.success) {
      successCount++;
      totalCharged += total;
    } else {
      failCount++;
    }

    // Small delay between charges to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(
    `💰 Billing cycle complete: ${successCount} charged ($${totalCharged.toFixed(2)}), ${failCount} failed`
  );
}

/**
 * Initialize the daily billing cron job.
 * Runs at 00:05 UTC every day (5 minute buffer past midnight).
 */
export function startBillingScheduler() {
  // "At 00:05 every day" — cron: minute hour day month weekday
  cron.schedule(
    "5 0 * * *",
    async () => {
      try {
        await runBillingCycle();
      } catch (err: any) {
        console.error("❌ Billing cycle error:", err.message);
      }
    },
    { timezone: "UTC" }
  );

  console.log("⏰ Messaging fee billing scheduler started (daily at 00:05 UTC)");
}

// Export for manual/admin triggering
export { runBillingCycle };
