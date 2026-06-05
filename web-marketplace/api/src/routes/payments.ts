import { Router, Request, Response } from "express";
import Stripe from "stripe";
import rateLimit from "express-rate-limit";
import AppDataSource from "../database.js";
import { User } from "../entities/user.js";
import { verifyToken } from "./auth.js";
import { Order, OrderStatus } from "../entities/order.js";
import { invoiceService } from "../services/invoiceService.js";
import { InvoiceType } from "../entities/invoice.js";
import { PaymentMilestone, MilestoneStatus } from "../entities/payment-milestone.js";
import { Payout, PayoutStatus } from "../entities/payout.js";
import { AuditLog } from "../entities/audit-log.js";
import stripe from "../config/stripe.js";

const router = Router();

const NODE_ENV = process.env.NODE_ENV || "development";

// Track processed webhook event IDs to prevent duplicate processing
const processedWebhookEvents = new Set<string>();
const MAX_PROCESSED_EVENTS = 10000;

// Rate limiter for pre-auth payment endpoints (signup flow)
const signupPaymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: NODE_ENV === "production" ? 5 : 5000, // strict in prod, lenient in dev/test
  message: "Too many payment attempts. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * GET /v1/payments/config
 * Returns Stripe publishable key for frontend initialization
 */
router.get("/config", (req: Request, res: Response) => {
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
  });
});

/**
 * POST /v1/payments/create-setup-intent
 * Creates a Stripe SetupIntent for collecting a card during registration
 * Body: { email, firstName, lastName }
 */
router.post("/create-setup-intent", signupPaymentLimiter, async (req: Request, res: Response) => {
  try {
    const { email, firstName, lastName } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Create a Stripe Customer
    const customer = await stripe.customers.create({
      email,
      name: `${firstName || ""} ${lastName || ""}`.trim() || undefined,
      metadata: { source: "pds-marketplace-signup" },
    });

    // Create a SetupIntent for collecting payment method
    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: ["card"],
      metadata: { email },
    });

    res.json({
      clientSecret: setupIntent.client_secret,
      customerId: customer.id,
    });
  } catch (error: any) {
    console.error("Stripe SetupIntent error:", error);
    res.status(500).json({
      error: "Failed to initialize card setup",
    });
  }
});

/**
 * POST /v1/payments/signup-charge
 * Charges $1.00 verification fee using the customer's saved card
 * Called during signup AFTER SetupIntent succeeds
 * Body: { customerId, email }
 */
router.post("/signup-charge", signupPaymentLimiter, async (req: Request, res: Response) => {
  try {
    const { customerId, email } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: "Customer ID is required" });
    }

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Verify this Stripe customer belongs to the submitted email (prevents IDOR charge)
    const stripeCustomer = await stripe.customers.retrieve(customerId);
    if (
      stripeCustomer.deleted ||
      (stripeCustomer as Stripe.Customer).email?.toLowerCase() !== email.toLowerCase()
    ) {
      return res.status(403).json({ error: "Customer verification failed." });
    }

    // Get the customer's default payment method (just saved via SetupIntent)
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });

    if (!paymentMethods.data.length) {
      return res.status(400).json({ error: "No card found on customer. Please try again." });
    }

    const paymentMethodId = paymentMethods.data[0].id;

    // Charge $1.00 (100 cents)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 100,
      currency: "usd",
      customer: customerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      description: "PipeDream Marketplace — Account verification fee",
      metadata: {
        email: email || "",
        purpose: "signup-verification",
        source: "pds-marketplace",
      },
    });

    if (paymentIntent.status === "succeeded") {
      // Invoice will be created during registration when the user record exists
      res.json({ success: true, paymentIntentId: paymentIntent.id });
    } else {
      res.status(402).json({ error: "Card charge did not succeed. Please try a different card." });
    }
  } catch (error: any) {
    console.error("Signup charge error:", error);
    // Stripe card_declined, insufficient_funds, etc.
    const userMessage = error.type === "StripeCardError"
      ? error.message
      : "Verification charge failed. Please try a different card.";
    res.status(402).json({ error: userMessage });
  }
});

/**
 * POST /v1/payments/create-payment-intent
 * Creates a payment intent for an order
 * Requires authentication
 */
router.post(
  "/create-payment-intent",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      const { amount, currency, orderId, description } = req.body;
      const userId = (req as any).userId;

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: "Valid amount is required" });
      }

      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({ where: { id: userId } });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Create or retrieve Stripe customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        user.stripeCustomerId = customerId;
        await userRepo.save(user);
      }

      // Create PaymentIntent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert dollars to cents
        currency: currency || "usd",
        customer: customerId,
        description:
          description || `PDS Marketplace Order${orderId ? ` #${orderId}` : ""}`,
        metadata: {
          userId: user.id,
          orderId: orderId || "",
          source: "pds-marketplace",
        },
        automatic_payment_methods: { enabled: true },
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      });
    } catch (error: any) {
      console.error("Stripe PaymentIntent error:", error);
      res.status(500).json({
        error: "Failed to create payment",
      });
    }
  }
);

/**
 * GET /v1/payments/methods
 * List user's saved payment methods
 * Requires authentication
 */
router.get("/methods", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId } });

    if (!user || !user.stripeCustomerId) {
      return res.json({ paymentMethods: [] });
    }

    const paymentMethods = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: "card",
    });

    res.json({
      paymentMethods: paymentMethods.data.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand,
        last4: pm.card?.last4,
        expMonth: pm.card?.exp_month,
        expYear: pm.card?.exp_year,
      })),
    });
  } catch (error: any) {
    console.error("Stripe list methods error:", error);
    res.status(500).json({ error: "Failed to retrieve payment methods" });
  }
});

/**
 * POST /v1/payments/webhook
 * Stripe webhook handler for payment events
 */
router.post(
  "/webhook",
  async (req: Request, res: Response) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret || !sig) {
      console.warn("Stripe webhook: missing secret or signature");
      return res.status(400).json({ error: "Webhook not configured" });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig as string,
        webhookSecret
      );
    } catch (err: any) {
      console.error("Stripe webhook signature verification failed:", err.message);
      return res.status(400).json({ error: "Invalid signature" });
    }

    // Idempotency: skip already-processed events (Stripe retries webhooks)
    if (processedWebhookEvents.has(event.id)) {
      return res.json({ received: true, skipped: "duplicate" });
    }
    processedWebhookEvents.add(event.id);
    // Prevent unbounded memory growth
    if (processedWebhookEvents.size > MAX_PROCESSED_EVENTS) {
      const first = processedWebhookEvents.values().next().value;
      if (first) processedWebhookEvents.delete(first);
    }

    // Handle events
    switch (event.type) {
      // ═══════════════════════════════════════════════════════════════════
      // PAYMENT INTENT EVENTS
      // ═══════════════════════════════════════════════════════════════════
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        console.log("💰 Payment succeeded:", pi.id);
        // Update order status if orderId is in metadata
        if (pi.metadata?.orderId) {
          try {
            const orderRepo = AppDataSource.getRepository(Order);
            const order = await orderRepo.findOne({ where: { id: pi.metadata.orderId } });
            if (order && !order.paymentReceived) {
              order.paymentReceived = true;
              order.stripePaymentIntentId = pi.id;
              if (order.status === OrderStatus.PENDING) {
                order.status = OrderStatus.BID_ACCEPTED;
              }
              await orderRepo.save(order);
              console.log(`✅ Order ${order.orderNumber} payment recorded`);
            }
          } catch (dbErr) {
            console.error("Webhook DB update error:", dbErr);
          }
        }
        // Update milestone if milestoneId is in metadata
        if (pi.metadata?.milestoneId) {
          try {
            const milestoneRepo = AppDataSource.getRepository(PaymentMilestone);
            const milestone = await milestoneRepo.findOne({ where: { id: pi.metadata.milestoneId } });
            if (milestone && milestone.status !== MilestoneStatus.COMPLETED) {
              milestone.buyerPaymentReceived = true;
              milestone.buyerPaymentDate = new Date();
              milestone.status = MilestoneStatus.COMPLETED;
              milestone.stripePaymentIntentId = pi.id;
              await milestoneRepo.save(milestone);
              console.log(`✅ Milestone ${milestone.id} (${milestone.type}) payment confirmed via webhook`);
            }
          } catch (dbErr) {
            console.error("Milestone webhook DB update error:", dbErr);
          }
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const failedPi = event.data.object as Stripe.PaymentIntent;
        console.log("❌ Payment failed:", failedPi.id, "reason:", failedPi.last_payment_error?.message);
        // Update milestone status if applicable
        if (failedPi.metadata?.milestoneId) {
          try {
            const milestoneRepo = AppDataSource.getRepository(PaymentMilestone);
            const milestone = await milestoneRepo.findOne({ where: { id: failedPi.metadata.milestoneId } });
            if (milestone && milestone.status === MilestoneStatus.PENDING) {
              milestone.status = MilestoneStatus.FAILED;
              await milestoneRepo.save(milestone);
              console.log(`❌ Milestone ${milestone.id} marked failed due to payment failure`);
            }
          } catch (dbErr) {
            console.error("Milestone payment_failed webhook error:", dbErr);
          }
        }
        // Log for monitoring
        try {
          const auditRepo = AppDataSource.getRepository(AuditLog);
          await auditRepo.save(auditRepo.create({
            entityType: "PaymentIntent",
            entityId: failedPi.id,
            action: "PAYMENT_FAILED",
            snapshot: JSON.stringify({
              paymentIntentId: failedPi.id,
              amount: failedPi.amount,
              error: failedPi.last_payment_error?.message,
              errorCode: failedPi.last_payment_error?.code,
              metadata: failedPi.metadata,
            }),
          }));
        } catch (auditErr) {
          console.error("Audit log error for payment failure:", auditErr);
        }
        break;
      }
      case "payment_intent.canceled": {
        const canceledPi = event.data.object as Stripe.PaymentIntent;
        console.log("🚫 Payment canceled:", canceledPi.id);
        // If tied to an order, update status
        if (canceledPi.metadata?.orderId) {
          try {
            const orderRepo = AppDataSource.getRepository(Order);
            const order = await orderRepo.findOne({ where: { id: canceledPi.metadata.orderId } });
            if (order && order.status === OrderStatus.PENDING && !order.paymentReceived) {
              order.notes = ((order.notes || "") + ` | Payment canceled: ${canceledPi.id}`).trim();
              await orderRepo.save(order);
              console.log(`🚫 Order ${order.orderNumber} payment canceled`);
            }
          } catch (dbErr) {
            console.error("Payment canceled webhook error:", dbErr);
          }
        }
        break;
      }
      case "payment_intent.processing": {
        const processingPi = event.data.object as Stripe.PaymentIntent;
        console.log("⏳ Payment processing (async method):", processingPi.id);
        // Log for monitoring — ACH/bank transfers can take days
        break;
      }
      case "payment_intent.requires_action": {
        const actionPi = event.data.object as Stripe.PaymentIntent;
        console.log("🔐 Payment requires action (3DS/SCA):", actionPi.id);
        // For off-session payments (milestones, messaging fees), log that buyer needs to complete auth
        try {
          const auditRepo = AppDataSource.getRepository(AuditLog);
          await auditRepo.save(auditRepo.create({
            entityType: "PaymentIntent",
            entityId: actionPi.id,
            action: "REQUIRES_AUTHENTICATION",
            snapshot: JSON.stringify({
              paymentIntentId: actionPi.id,
              amount: actionPi.amount,
              metadata: actionPi.metadata,
              nextAction: actionPi.next_action?.type,
            }),
          }));
        } catch (auditErr) {
          console.error("Audit log error for requires_action:", auditErr);
        }
        break;
      }
      case "payment_intent.created": {
        const createdPi = event.data.object as Stripe.PaymentIntent;
        console.log("📝 Payment intent created:", createdPi.id);
        break;
      }

      // ═══════════════════════════════════════════════════════════════════
      // SETUP INTENT EVENTS
      // ═══════════════════════════════════════════════════════════════════
      case "setup_intent.succeeded":
        console.log("✅ Card setup succeeded:", (event.data.object as Stripe.SetupIntent).id);
        break;
      case "setup_intent.setup_failed": {
        const failedSetup = event.data.object as Stripe.SetupIntent;
        console.log("❌ Card setup failed:", failedSetup.id, "error:", failedSetup.last_setup_error?.message);
        break;
      }

      // ═══════════════════════════════════════════════════════════════════
      // CHARGE EVENTS
      // ═══════════════════════════════════════════════════════════════════
      case "charge.succeeded": {
        const charge = event.data.object as Stripe.Charge;
        console.log("✅ Charge succeeded:", charge.id, `$${(charge.amount / 100).toFixed(2)}`);
        break;
      }
      case "charge.failed": {
        const failedCharge = event.data.object as Stripe.Charge;
        console.log("❌ Charge failed:", failedCharge.id, "reason:", failedCharge.failure_message);
        try {
          const auditRepo = AppDataSource.getRepository(AuditLog);
          await auditRepo.save(auditRepo.create({
            entityType: "Charge",
            entityId: failedCharge.id,
            action: "CHARGE_FAILED",
            snapshot: JSON.stringify({
              chargeId: failedCharge.id,
              amount: failedCharge.amount,
              failureCode: failedCharge.failure_code,
              failureMessage: failedCharge.failure_message,
              paymentIntent: failedCharge.payment_intent,
            }),
          }));
        } catch (auditErr) {
          console.error("Charge failed audit error:", auditErr);
        }
        break;
      }
      case "charge.refunded": {
        // A charge was refunded (could be partial or full)
        const charge = event.data.object as Stripe.Charge;
        console.log(`💸 Charge refunded: ${charge.id}, amount_refunded=${charge.amount_refunded}`);
        // Mark order as refunded if applicable (idempotent — skip if already cancelled)
        if (charge.payment_intent && typeof charge.payment_intent === "string") {
          try {
            const orderRepo = AppDataSource.getRepository(Order);
            // Atomic: only update orders NOT already cancelled (prevents duplicate notes on redelivery)
            const updateResult = await orderRepo
              .createQueryBuilder()
              .update(Order)
              .set({
                status: OrderStatus.CANCELLED,
                notes: () => `COALESCE(notes, '') || ' | Refund processed: ${charge.amount_refunded / 100} USD'`,
              })
              .where("stripePaymentIntentId = :piId", { piId: charge.payment_intent })
              .andWhere("status != :cancelled", { cancelled: OrderStatus.CANCELLED })
              .execute();
            if (updateResult.affected && updateResult.affected > 0) {
              console.log(`✅ Order with PI ${charge.payment_intent} marked as refunded`);
            } else {
              console.log(`ℹ️ Order already cancelled or not found for PI ${charge.payment_intent}`);
            }
          } catch (dbErr) {
            console.error("Refund webhook DB error:", dbErr);
          }
        }
        break;
      }
      case "charge.updated": {
        const updatedCharge = event.data.object as Stripe.Charge;
        console.log("ℹ️ Charge updated:", updatedCharge.id);
        break;
      }

      // ═══════════════════════════════════════════════════════════════════
      // DISPUTE EVENTS (Chargebacks)
      // ═══════════════════════════════════════════════════════════════════
      case "charge.dispute.created": {
        // Stripe chargeback / formal dispute filed by cardholder
        const dispute = event.data.object as Stripe.Dispute;
        console.log(`⚠️  Stripe dispute created: ${dispute.id}, amount=${dispute.amount}, reason=${dispute.reason}`);
        // Log for admin attention — do NOT auto-resolve
        try {
          const auditRepo = AppDataSource.getRepository(AuditLog);
          await auditRepo.save(auditRepo.create({
            entityType: "StripeDispute",
            entityId: dispute.id,
            action: "STRIPE_DISPUTE_CREATED",
            snapshot: JSON.stringify({
              disputeId: dispute.id,
              amount: dispute.amount,
              reason: dispute.reason,
              chargeId: dispute.charge,
              paymentIntent: dispute.payment_intent,
              status: dispute.status,
            }),
          }));
        } catch (dbErr) {
          console.error("Stripe dispute webhook audit error:", dbErr);
        }
        break;
      }
      case "charge.dispute.updated": {
        const updatedDispute = event.data.object as Stripe.Dispute;
        console.log(`ℹ️ Stripe dispute updated: ${updatedDispute.id}, status=${updatedDispute.status}`);
        try {
          const auditRepo = AppDataSource.getRepository(AuditLog);
          await auditRepo.save(auditRepo.create({
            entityType: "StripeDispute",
            entityId: updatedDispute.id,
            action: "STRIPE_DISPUTE_UPDATED",
            snapshot: JSON.stringify({
              disputeId: updatedDispute.id,
              amount: updatedDispute.amount,
              reason: updatedDispute.reason,
              status: updatedDispute.status,
              chargeId: updatedDispute.charge,
              paymentIntent: updatedDispute.payment_intent,
            }),
          }));
        } catch (dbErr) {
          console.error("Stripe dispute updated audit error:", dbErr);
        }
        break;
      }
      case "charge.dispute.closed": {
        const closedDispute = event.data.object as Stripe.Dispute;
        console.log(`📋 Stripe dispute closed: ${closedDispute.id}, status=${closedDispute.status}`);
        try {
          const auditRepo = AppDataSource.getRepository(AuditLog);
          await auditRepo.save(auditRepo.create({
            entityType: "StripeDispute",
            entityId: closedDispute.id,
            action: "STRIPE_DISPUTE_CLOSED",
            snapshot: JSON.stringify({
              disputeId: closedDispute.id,
              amount: closedDispute.amount,
              reason: closedDispute.reason,
              status: closedDispute.status, // won, lost, charge_refunded, warning_closed
              chargeId: closedDispute.charge,
              paymentIntent: closedDispute.payment_intent,
            }),
          }));
        } catch (dbErr) {
          console.error("Stripe dispute closed audit error:", dbErr);
        }
        break;
      }
      case "charge.dispute.funds_reinstated": {
        // We won the dispute — funds returned to us
        const reinstatedDispute = event.data.object as Stripe.Dispute;
        console.log(`✅ Dispute funds reinstated: ${reinstatedDispute.id}, amount=${reinstatedDispute.amount}`);
        try {
          const auditRepo = AppDataSource.getRepository(AuditLog);
          await auditRepo.save(auditRepo.create({
            entityType: "StripeDispute",
            entityId: reinstatedDispute.id,
            action: "STRIPE_DISPUTE_FUNDS_REINSTATED",
            snapshot: JSON.stringify({
              disputeId: reinstatedDispute.id,
              amount: reinstatedDispute.amount,
              chargeId: reinstatedDispute.charge,
              paymentIntent: reinstatedDispute.payment_intent,
            }),
          }));
        } catch (dbErr) {
          console.error("Dispute funds reinstated audit error:", dbErr);
        }
        break;
      }
      case "charge.dispute.funds_withdrawn": {
        // We lost the dispute — funds taken
        const withdrawnDispute = event.data.object as Stripe.Dispute;
        console.log(`❌ Dispute funds withdrawn: ${withdrawnDispute.id}, amount=${withdrawnDispute.amount}`);
        try {
          const auditRepo = AppDataSource.getRepository(AuditLog);
          await auditRepo.save(auditRepo.create({
            entityType: "StripeDispute",
            entityId: withdrawnDispute.id,
            action: "STRIPE_DISPUTE_FUNDS_WITHDRAWN",
            snapshot: JSON.stringify({
              disputeId: withdrawnDispute.id,
              amount: withdrawnDispute.amount,
              chargeId: withdrawnDispute.charge,
              paymentIntent: withdrawnDispute.payment_intent,
            }),
          }));
        } catch (dbErr) {
          console.error("Dispute funds withdrawn audit error:", dbErr);
        }
        break;
      }

      // ═══════════════════════════════════════════════════════════════════
      // REFUND EVENTS
      // ═══════════════════════════════════════════════════════════════════
      case "refund.created": {
        const refund = event.data.object as Stripe.Refund;
        console.log(`💸 Refund created: ${refund.id}, amount=${refund.amount}, status=${refund.status}`);
        break;
      }
      case "refund.updated": {
        const refund = event.data.object as Stripe.Refund;
        console.log(`ℹ️ Refund updated: ${refund.id}, status=${refund.status}`);
        if (refund.status === "failed") {
          try {
            const auditRepo = AppDataSource.getRepository(AuditLog);
            await auditRepo.save(auditRepo.create({
              entityType: "Refund",
              entityId: refund.id,
              action: "REFUND_FAILED",
              snapshot: JSON.stringify({
                refundId: refund.id,
                amount: refund.amount,
                failureReason: refund.failure_reason,
                paymentIntent: refund.payment_intent,
                chargeId: refund.charge,
              }),
            }));
          } catch (auditErr) {
            console.error("Refund failed audit error:", auditErr);
          }
        }
        break;
      }


      // ═══════════════════════════════════════════════════════════════════
      // STRIPE CONNECT — ACCOUNT EVENTS
      // ═══════════════════════════════════════════════════════════════════
      case "account.updated": {
        // Stripe Connect account status change
        const account = event.data.object as Stripe.Account;
        if (account.metadata?.userId) {
          try {
            const userRepo = AppDataSource.getRepository(User);
            const user = await userRepo.findOne({ where: { id: account.metadata.userId } });
            if (user) {
              user.stripeAccountOnboarded = !!(account.details_submitted && account.payouts_enabled);
              await userRepo.save(user);
              console.log(`✅ Connect account updated for ${user.email}: onboarded=${user.stripeAccountOnboarded}`);
            }
          } catch (dbErr) {
            console.error("Connect webhook DB update error:", dbErr);
          }
        }
        break;
      }
      case "account.application.deauthorized": {
        // Connected account revoked access to our platform
        const deauthApp = event.data.object as unknown as { id: string; name?: string };
        console.log(`⚠️ Connect account deauthorized: ${deauthApp.id}`);
        // The account ID is on the event's account field, not the data object
        const deauthAccountId = typeof event.account === "string" ? event.account : null;
        if (deauthAccountId) {
          try {
            const userRepo = AppDataSource.getRepository(User);
            const user = await userRepo.findOne({ where: { stripeAccountId: deauthAccountId } });
            if (user) {
              user.stripeAccountOnboarded = false;
              await userRepo.save(user);
              console.log(`⚠️ User ${user.email} Connect account deauthorized — marked as not onboarded`);
            }
          } catch (dbErr) {
            console.error("Account deauthorized webhook error:", dbErr);
          }
        }
        break;
      }
      case "capability.updated": {
        const capability = event.data.object as Stripe.Capability;
        console.log(`ℹ️ Connect capability updated: ${capability.id}, status=${capability.status}, account=${capability.account}`);
        // If a key capability was disabled, update user's onboarded status
        if (capability.status !== "active" && (capability.id === "transfers" || capability.id === "card_payments")) {
          try {
            const accountId = typeof capability.account === "string" ? capability.account : (capability.account as any)?.id;
            if (!accountId) break;
            const userRepo = AppDataSource.getRepository(User);
            const user = await userRepo.findOne({ where: { stripeAccountId: accountId } });
            if (user) {
              user.stripeAccountOnboarded = false;
              await userRepo.save(user);
              console.log(`⚠️ User ${user.email} capability ${capability.id} lost — marked as not onboarded`);
            }
          } catch (dbErr) {
            console.error("Capability updated webhook error:", dbErr);
          }
        }
        break;
      }

      // ═══════════════════════════════════════════════════════════════════
      // TRANSFER EVENTS (Connect payouts to sellers)
      // ═══════════════════════════════════════════════════════════════════
      case "transfer.created": {
        const transfer = event.data.object as Stripe.Transfer;
        console.log(`💸 Transfer created: ${transfer.id}, amount=${transfer.amount}, destination=${transfer.destination}`);
        break;
      }
      case "transfer.updated": {
        const transfer = event.data.object as Stripe.Transfer;
        console.log(`ℹ️ Transfer updated: ${transfer.id}`);
        break;
      }
      case "transfer.reversed": {
        // A Connect transfer was reversed (funds clawed back)
        const transfer = event.data.object as Stripe.Transfer;
        console.log(`❌ Transfer reversed: ${transfer.id}, destination=${transfer.destination}`);
        // Update payout record if metadata includes payoutId
        if (transfer.metadata?.payoutId) {
          try {
            const payoutRepo = AppDataSource.getRepository(Payout);
            const payout = await payoutRepo.findOne({ where: { id: transfer.metadata.payoutId } });
            if (payout && payout.status !== PayoutStatus.FAILED) {
              payout.status = PayoutStatus.FAILED;
              payout.failureReason = `Stripe transfer reversed: ${transfer.id}`;
              await payoutRepo.save(payout);
              console.log(`✅ Payout ${payout.id} marked as failed due to transfer reversal`);
            }
          } catch (dbErr) {
            console.error("Transfer reversed webhook DB error:", dbErr);
          }
        }
        break;
      }


      // ═══════════════════════════════════════════════════════════════════
      // PAYOUT EVENTS (Connect account → their bank)
      // ═══════════════════════════════════════════════════════════════════
      case "payout.paid": {
        const stripePayout = event.data.object as Stripe.Payout;
        console.log(`✅ Connect payout paid: ${stripePayout.id}, amount=${stripePayout.amount}`);
        break;
      }
      case "payout.failed": {
        const stripePayout = event.data.object as Stripe.Payout;
        console.log(`❌ Connect payout failed: ${stripePayout.id}, failure_code=${stripePayout.failure_code}`);
        try {
          const auditRepo = AppDataSource.getRepository(AuditLog);
          await auditRepo.save(auditRepo.create({
            entityType: "StripePayout",
            entityId: stripePayout.id,
            action: "CONNECT_PAYOUT_FAILED",
            snapshot: JSON.stringify({
              payoutId: stripePayout.id,
              amount: stripePayout.amount,
              failureCode: stripePayout.failure_code,
              failureMessage: stripePayout.failure_message,
              destination: stripePayout.destination,
            }),
          }));
        } catch (auditErr) {
          console.error("Connect payout failed audit error:", auditErr);
        }
        break;
      }
      case "payout.created": {
        const stripePayout = event.data.object as Stripe.Payout;
        console.log(`📝 Connect payout created: ${stripePayout.id}, amount=${stripePayout.amount}`);
        break;
      }
      case "payout.updated": {
        const stripePayout = event.data.object as Stripe.Payout;
        console.log(`ℹ️ Connect payout updated: ${stripePayout.id}, status=${stripePayout.status}`);
        break;
      }

      // ═══════════════════════════════════════════════════════════════════
      // CUSTOMER EVENTS
      // ═══════════════════════════════════════════════════════════════════
      case "customer.created": {
        const customer = event.data.object as Stripe.Customer;
        console.log(`📝 Customer created: ${customer.id}, email=${customer.email}`);
        break;
      }
      case "customer.updated": {
        const customer = event.data.object as Stripe.Customer;
        console.log(`ℹ️ Customer updated: ${customer.id}`);
        break;
      }
      case "customer.deleted": {
        const customer = event.data.object as Stripe.Customer;
        console.log(`🗑️ Customer deleted: ${customer.id}`);
        // Clear stripeCustomerId from our user record
        try {
          const userRepo = AppDataSource.getRepository(User);
          const user = await userRepo.findOne({ where: { stripeCustomerId: customer.id } });
          if (user) {
            user.stripeCustomerId = "";
            await userRepo.save(user);
            console.log(`✅ Cleared stripeCustomerId for user ${user.email}`);
          }
        } catch (dbErr) {
          console.error("Customer deleted webhook error:", dbErr);
        }
        break;
      }

      // ═══════════════════════════════════════════════════════════════════
      // PAYMENT METHOD EVENTS
      // ═══════════════════════════════════════════════════════════════════
      case "payment_method.attached": {
        const pm = event.data.object as Stripe.PaymentMethod;
        console.log(`✅ Payment method attached: ${pm.id}, type=${pm.type}, customer=${pm.customer}`);
        break;
      }
      case "payment_method.detached": {
        const pm = event.data.object as Stripe.PaymentMethod;
        console.log(`🗑️ Payment method detached: ${pm.id}, type=${pm.type}`);
        break;
      }
      case "payment_method.updated": {
        const pm = event.data.object as Stripe.PaymentMethod;
        console.log(`ℹ️ Payment method updated: ${pm.id}`);
        break;
      }

      // ═══════════════════════════════════════════════════════════════════
      // INVOICE EVENTS (Stripe-generated invoices, if used)
      // ═══════════════════════════════════════════════════════════════════
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`✅ Invoice payment succeeded: ${invoice.id}, amount=${invoice.amount_paid}`);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`❌ Invoice payment failed: ${invoice.id}`);
        break;
      }
      case "invoice.created": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`📝 Invoice created: ${invoice.id}`);
        break;
      }
      case "invoice.finalized": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`📋 Invoice finalized: ${invoice.id}`);
        break;
      }

      // ═══════════════════════════════════════════════════════════════════
      // CATCH-ALL
      // ═══════════════════════════════════════════════════════════════════
      default:
        console.log(`ℹ️ Unhandled Stripe event: ${event.type}`);
    }

    res.json({ received: true });
  }
);

export default router;
