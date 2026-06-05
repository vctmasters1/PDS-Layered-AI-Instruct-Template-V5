/**
 * cloud.ts — Cloud subscription management for WEB-HMI
 *
 * Routes:
 *   GET  /v1/cloud/status          — Current subscription status for calling user
 *   POST /v1/cloud/subscribe        — Create Stripe subscription ($1/month) for a device
 *   POST /v1/cloud/cancel           — Cancel subscription for a device
 *   POST /v1/cloud/webhook          — Stripe webhook handler
 *
 * The $1/month plan is identified by the CLOUD_PLAN_PRICE_ID env var
 * (a Stripe Price ID you create once in the Stripe dashboard).
 *
 * In dev mode with no STRIPE_SECRET_KEY, subscribe/cancel return mock responses
 * so the UI can be developed without a live Stripe account.
 */

import { Router, Request, Response } from "express";
import AppDataSource from "../database.js";
import { Device } from "../entities/device.js";
import { verifyToken } from "../middleware/auth.js";

const router = Router();
const isDev = process.env.NODE_ENV !== "production";
const CLOUD_PLAN_PRICE_ID = process.env.CLOUD_PLAN_PRICE_ID || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

// Lazy-load Stripe so the server boots without it in dev
async function getStripe() {
  const Stripe = (await import("stripe" as string)).default as any;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(key, { apiVersion: "2024-12-18.acacia" });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function deviceResponse(device: Device) {
  return {
    id:                  device.id,
    cloudEnabled:        device.cloudEnabled,
    cloudSubscriptionId: device.cloudSubscriptionId || null,
    cloudPeriodEnd:      device.cloudPeriodEnd || null,
  };
}

// ── GET /v1/cloud/status ─────────────────────────────────────────────────────
/**
 * Returns cloud subscription status for all devices owned by the calling user.
 */
router.get("/status", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const deviceRepo = AppDataSource.getRepository(Device);
    const devices = await deviceRepo.find({ where: { ownerId: userId } });
    res.json(devices.map(deviceResponse));
  } catch (err) {
    console.error("GET /cloud/status error:", err);
    res.status(500).json({ error: "Failed to get cloud status" });
  }
});

// ── POST /v1/cloud/subscribe ─────────────────────────────────────────────────
/**
 * Creates a $1/month Stripe subscription for a device.
 * Body: { deviceId: string }
 *
 * Requires the user to have a stripeCustomerId already (created during
 * Marketplace registration). If not present, returns 402 with a message
 * instructing the user to add a payment method via the Marketplace.
 */
router.post("/subscribe", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { deviceId } = req.body;

    if (!deviceId) return res.status(400).json({ error: "deviceId is required" });

    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { id: deviceId, ownerId: userId } });
    if (!device) return res.status(404).json({ error: "Device not found" });
    if (device.cloudEnabled) return res.status(409).json({ error: "Cloud already enabled for this device" });

    // ── Dev mode mock ──────────────────────────────────────────────────────
    if (isDev && !process.env.STRIPE_SECRET_KEY) {
      device.cloudEnabled = true;
      device.cloudSubscriptionId = `mock_sub_${Date.now()}`;
      device.cloudPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await deviceRepo.save(device);
      return res.json({ ...deviceResponse(device), mock: true });
    }

    // ── Live Stripe ────────────────────────────────────────────────────────
    // Resolve the user's stripeCustomerId from the shared users table
    const { Pool } = await import("pg" as string) as any;
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const result = await pool.query(
      'SELECT "stripeCustomerId" FROM users WHERE id = $1', [userId]
    );
    await pool.end();

    const stripeCustomerId = result.rows[0]?.stripeCustomerId;
    if (!stripeCustomerId) {
      return res.status(402).json({
        error: "No payment method on file",
        message: "Please add a payment method in the PDS Marketplace before enabling cloud features.",
        marketplaceUrl: process.env.MARKETPLACE_URL || "https://marketplace.pipedreamsystems.com",
      });
    }

    if (!CLOUD_PLAN_PRICE_ID) {
      return res.status(500).json({ error: "CLOUD_PLAN_PRICE_ID not configured" });
    }

    const stripe = await getStripe();
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: CLOUD_PLAN_PRICE_ID }],
      metadata: { deviceId, userId, service: "pds-cloud" },
      expand: ["latest_invoice.payment_intent"],
    });

    const periodEnd = new Date((subscription as any).current_period_end * 1000);
    const isActive = subscription.status === "active" || subscription.status === "trialing";

    device.cloudEnabled = isActive;
    device.cloudSubscriptionId = subscription.id;
    device.cloudPeriodEnd = periodEnd;
    await deviceRepo.save(device);

    res.json(deviceResponse(device));
  } catch (err: any) {
    console.error("POST /cloud/subscribe error:", err);
    res.status(500).json({ error: err.message || "Failed to create subscription" });
  }
});

// ── POST /v1/cloud/cancel ────────────────────────────────────────────────────
/**
 * Cancels the cloud subscription for a device at period end.
 * Body: { deviceId: string }
 */
router.post("/cancel", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { deviceId } = req.body;

    if (!deviceId) return res.status(400).json({ error: "deviceId is required" });

    const deviceRepo = AppDataSource.getRepository(Device);
    const device = await deviceRepo.findOne({ where: { id: deviceId, ownerId: userId } });
    if (!device) return res.status(404).json({ error: "Device not found" });
    if (!device.cloudEnabled) return res.status(409).json({ error: "Cloud not enabled for this device" });

    // ── Dev mode mock ──────────────────────────────────────────────────────
    if (isDev && !process.env.STRIPE_SECRET_KEY) {
      device.cloudEnabled = false;
      device.cloudSubscriptionId = null as any;
      device.cloudPeriodEnd = null as any;
      await deviceRepo.save(device);
      return res.json({ ...deviceResponse(device), mock: true });
    }

    // ── Live Stripe ────────────────────────────────────────────────────────
    if (device.cloudSubscriptionId) {
      const stripe = await getStripe();
      await stripe.subscriptions.update(device.cloudSubscriptionId, {
        cancel_at_period_end: true,
      });
    }

    // Keep cloudEnabled = true until period actually ends (webhook will flip it)
    res.json({
      ...deviceResponse(device),
      cancelAtPeriodEnd: true,
      message: "Cloud features will remain active until the current billing period ends.",
    });
  } catch (err: any) {
    console.error("POST /cloud/cancel error:", err);
    res.status(500).json({ error: err.message || "Failed to cancel subscription" });
  }
});

// ── POST /v1/cloud/webhook ────────────────────────────────────────────────────
/**
 * Stripe webhook — handles subscription lifecycle events.
 * Register this URL in Stripe dashboard: https://your-domain/v1/cloud/webhook
 */
router.post("/webhook", async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"];
  if (!sig || !STRIPE_WEBHOOK_SECRET) {
    return res.status(400).json({ error: "Webhook signature missing or not configured" });
  }

  let event: any;
  try {
    const stripe = await getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).json({ error: "Webhook signature invalid" });
  }

  const deviceRepo = AppDataSource.getRepository(Device);

  try {
    switch (event.type) {
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const device = await deviceRepo.findOne({ where: { cloudSubscriptionId: sub.id } });
        if (device) {
          device.cloudEnabled = false;
          device.cloudSubscriptionId = null as any;
          device.cloudPeriodEnd = null as any;
          await deviceRepo.save(device);
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const device = await deviceRepo.findOne({ where: { cloudSubscriptionId: sub.id } });
        if (device) {
          device.cloudEnabled = sub.status === "active" || sub.status === "trialing";
          device.cloudPeriodEnd = new Date(sub.current_period_end * 1000);
          await deviceRepo.save(device);
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const sub = invoice.subscription;
        if (sub) {
          const device = await deviceRepo.findOne({ where: { cloudSubscriptionId: sub } });
          if (device) {
            device.cloudEnabled = false;
            await deviceRepo.save(device);
          }
        }
        break;
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
