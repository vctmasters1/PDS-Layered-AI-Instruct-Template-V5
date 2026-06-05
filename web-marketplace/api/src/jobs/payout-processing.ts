import cron from "node-cron";
import AppDataSource from "../database.js";
import { payoutService } from "../services/payoutService.js";

// PostgreSQL advisory lock key for payout processing (arbitrary unique int)
const PAYOUT_LOCK_KEY = 100002;

/**
 * Payout Processing Job — Runs daily at 01:00 UTC.
 *
 * Finds all payouts whose hold period has expired (HELD status with
 * holdUntil <= now) and initiates Stripe Connect transfers.
 *
 * Hold period: 3 business days (configurable per payout).
 * This protects the platform against chargebacks and fraudulent activity.
 */

let processingInProgress = false;

async function runPayoutProcessing() {
  if (processingInProgress) {
    console.warn("💸 Payout processing already in progress — skipping duplicate run");
    return;
  }

  processingInProgress = true;

  // Acquire a PostgreSQL advisory lock so only one replica processes payouts
  const qr = AppDataSource.createQueryRunner();
  try {
    const lockResult = await qr.query(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [PAYOUT_LOCK_KEY]
    );
    if (!lockResult[0]?.acquired) {
      console.log("💸 Another instance holds the payout lock — skipping");
      return;
    }

    console.log("💸 Starting daily payout processing...");
    const result = await payoutService.processReleasablePayouts();
    console.log(
      `💸 Payout processing complete: ${result.processed} processed ($${result.totalTransferred.toFixed(2)}), ${result.failed} failed`
    );
  } catch (err: any) {
    console.error("❌ Payout processing error:", err.message);
  } finally {
    // Release the advisory lock
    await qr.query("SELECT pg_advisory_unlock($1)", [PAYOUT_LOCK_KEY]).catch(() => {});
    await qr.release();
    processingInProgress = false;
  }
}

/**
 * Initialize the daily payout processing cron job.
 * Runs at 01:00 UTC every day (1 hour after billing cycle).
 */
export function startPayoutScheduler() {
  cron.schedule(
    "0 1 * * *",
    async () => {
      try {
        await runPayoutProcessing();
      } catch (err: any) {
        console.error("❌ Payout scheduler error:", err.message);
      }
    },
    { timezone: "UTC" }
  );

  console.log("⏰ Payout processing scheduler started (daily at 01:00 UTC)");
}

// Export for manual/admin triggering
export { runPayoutProcessing };
