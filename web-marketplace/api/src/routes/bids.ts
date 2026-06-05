import { Router, Request, Response } from "express";
import AppDataSource from "../database.js";
import { Bid, BidStatus } from "../entities/bid.js";
import { Order } from "../entities/order.js";
import { Not } from "typeorm";
import { PaymentMilestone, MilestoneStatus, MilestoneType } from "../entities/payment-milestone.js";
import { Dispute, DisputeStatus, DisputeResolution, FailureType } from "../entities/dispute.js";
import { SiteSettings } from "../entities/site-settings.js";
import { User } from "../entities/user.js";
import { Producer } from "../entities/producer.js";
import { Notification, NotificationType } from "../entities/index.js";
import { AuditLog } from "../entities/audit-log.js";
import { notificationService } from "../services/notificationService.js";
import { invoiceService } from "../services/invoiceService.js";
import { InvoiceType } from "../entities/invoice.js";
import { verifyToken } from "./auth.js";
import stripe from "../config/stripe.js";
import Stripe from "stripe";

const router = Router();

// ============================================================================
// ADMIN ENDPOINTS - Site Settings
// ============================================================================

/**
 * GET /bids/settings - Get current payment terms and settings
 * Public endpoint (anyone can view terms)
 */
router.get("/settings", async (req: Request, res: Response) => {
  try {
    const settingsRepo = AppDataSource.getRepository(SiteSettings);
    let settings = await settingsRepo.findOne({ where: { active: true } });

    // If no settings exist, create defaults
    if (!settings) {
      settings = settingsRepo.create({
        paymentUpfrontPercent: 40,
        paymentShippingPercent: 30,
        paymentDeliveryPercent: 30,
        active: true,
      });
      await settingsRepo.save(settings);
    }

    res.json({ settings });
  } catch (error) {
    console.error("Get settings error:", error);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

/**
 * PUT /bids/settings - Update payment terms (ADMIN ONLY)
 */
router.put("/settings", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId } });

    // Check if user is admin (you may use different role checking)
    if (!user || (user.role !== "admin" && !user.isStaff)) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const {
      paymentUpfrontPercent,
      paymentShippingPercent,
      paymentDeliveryPercent,
      disputeResponseDays,
      disputeResolutionDays,
      platformFeePercent,
      producerFailureToProducePenalty,
      producerFailureToShipPenalty,
      producerFailureToDeliverPenalty,
      buyerFailureToDepositPenalty,
      buyerFailureToPayPenalty,
      disputeResolutionPolicy,
    } = req.body;

    // Validate payment percentages sum to 100
    if (paymentUpfrontPercent !== undefined && paymentShippingPercent !== undefined && paymentDeliveryPercent !== undefined) {
      const total = paymentUpfrontPercent + paymentShippingPercent + paymentDeliveryPercent;
      if (Math.abs(total - 100) > 0.01) {
        return res.status(400).json({ error: "Payment percentages must sum to 100%" });
      }
    }

    // Validate penalty fields are in the 0–100 range
    const penaltyFields: Record<string, any> = {
      producerFailureToProducePenalty,
      producerFailureToShipPenalty,
      producerFailureToDeliverPenalty,
      buyerFailureToDepositPenalty,
      buyerFailureToPayPenalty,
      platformFeePercent,
    };
    for (const [fieldName, value] of Object.entries(penaltyFields)) {
      if (value !== undefined && (typeof value !== "number" || value < 0 || value > 100)) {
        return res.status(400).json({ error: `${fieldName} must be a number between 0 and 100` });
      }
    }

    const settingsRepo = AppDataSource.getRepository(SiteSettings);
    let settings = await settingsRepo.findOne({ where: { active: true } });
    if (!settings) settings = settingsRepo.create({ active: true });
    if (paymentShippingPercent !== undefined) settings.paymentShippingPercent = paymentShippingPercent;
    if (paymentDeliveryPercent !== undefined) settings.paymentDeliveryPercent = paymentDeliveryPercent;
    if (disputeResponseDays !== undefined) settings.disputeResponseDays = disputeResponseDays;
    if (disputeResolutionDays !== undefined) settings.disputeResolutionDays = disputeResolutionDays;
    if (platformFeePercent !== undefined) settings.platformFeePercent = platformFeePercent;
    if (producerFailureToProducePenalty !== undefined) settings.producerFailureToProducePenalty = producerFailureToProducePenalty;
    if (producerFailureToShipPenalty !== undefined) settings.producerFailureToShipPenalty = producerFailureToShipPenalty;
    if (producerFailureToDeliverPenalty !== undefined) settings.producerFailureToDeliverPenalty = producerFailureToDeliverPenalty;
    if (buyerFailureToDepositPenalty !== undefined) settings.buyerFailureToDepositPenalty = buyerFailureToDepositPenalty;
    if (buyerFailureToPayPenalty !== undefined) settings.buyerFailureToPayPenalty = buyerFailureToPayPenalty;
    if (disputeResolutionPolicy !== undefined) settings.disputeResolutionPolicy = disputeResolutionPolicy;

    const updated = await settingsRepo.save(settings);

    res.json({
      message: "Settings updated successfully",
      settings: updated,
    });
  } catch (error) {
    console.error("Update settings error:", error);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// ============================================================================
// BUYER'S BID LIST
// ============================================================================

/**
 * GET /bids/my-bids - Get all bids on orders placed by the current user (buyer view)
 * Query: ?status=pending|accepted|...
 */
router.get("/my-bids", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { status } = req.query;

    const orderRepo = AppDataSource.getRepository(Order);
    const bidRepo = AppDataSource.getRepository(Bid);

    // Find all orders placed by this buyer
    const orders = await orderRepo.find({ where: { buyerId: userId }, select: ["id"] });
    if (orders.length === 0) {
      return res.json({ success: true, bids: [] });
    }

    const orderIds = orders.map(o => o.id);

    let qb = bidRepo.createQueryBuilder("bid")
      .leftJoinAndSelect("bid.order", "order")
      .leftJoinAndSelect("bid.producer", "producer")
      .where("bid.orderId IN (:...orderIds)", { orderIds });

    if (status) {
      qb = qb.andWhere("bid.status = :status", { status });
    }

    qb = qb.orderBy("bid.createdAt", "DESC");
    const bids = await qb.getMany();

    res.json({
      success: true,
      bids: bids.map(b => ({
        id: b.id,
        orderId: b.orderId,
        producerId: b.producerId,
        producerName: b.producer?.businessName || "Unknown",
        quotedPrice: b.quotedPrice,
        leadTimeDays: b.leadTimeDays,
        status: b.status,
        message: b.message,
        createdAt: b.createdAt,
        expiresAt: b.expiresAt,
        acceptedAt: b.acceptedAt,
        progressPercent: b.progressPercent ?? null,
        progressNote: b.progressNote ?? null,
        order: b.order ? {
          id: b.order.id,
          orderNumber: b.order.orderNumber,
          totalAmount: b.order.totalAmount,
          status: b.order.status,
        } : null,
      })),
    });
  } catch (error) {
    console.error("Get my-bids error:", error);
    res.status(500).json({ error: "Failed to fetch bids" });
  }
});

// ============================================================================
// BID ACCEPTANCE ENDPOINTS
// ============================================================================

/**
 * POST /bids/:bidId/accept - Buyer accepts a bid and triggers payment milestone creation
 */
router.post("/:bidId/accept", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { bidId } = req.params;

    // Run the entire acceptance in a transaction (H4)
    const result = await AppDataSource.transaction(async (manager) => {
      const bidRepo = manager.getRepository(Bid);
      const settingsRepo = manager.getRepository(SiteSettings);
      const milestoneRepo = manager.getRepository(PaymentMilestone);

      // Use pessimistic write lock to prevent concurrent bid acceptance
      const bid = await bidRepo.findOne({
        where: { id: bidId },
        relations: ["order", "producer"],
        lock: { mode: "pessimistic_write" },
      });

      if (!bid) {
        throw Object.assign(new Error("Bid not found"), { status: 404 });
      }

      // Verify buyer owns the order
      if (bid.order.buyerId !== userId) {
        throw Object.assign(new Error("Unauthorized - you don't own this order"), { status: 403 });
      }

      // Check bid status (with lock held, this is race-safe)
      if (bid.status !== BidStatus.PENDING) {
        throw Object.assign(new Error(`Cannot accept bid with status: ${bid.status}`), { status: 400 });
      }

      // Check bid hasn't expired
      if (new Date() > bid.expiresAt) {
        bid.status = BidStatus.EXPIRED;
        await bidRepo.save(bid);
        throw Object.assign(new Error("This bid has expired"), { status: 400 });
      }

      // Get site settings for payment terms
      let settings = await settingsRepo.findOne({ where: { active: true } });
      if (!settings) {
        settings = settingsRepo.create({
          paymentUpfrontPercent: 40,
          paymentShippingPercent: 30,
          paymentDeliveryPercent: 30,
        });
        await settingsRepo.save(settings);
      }

      // Update bid status
      bid.status = BidStatus.ACCEPTED;
      bid.acceptedAt = new Date();
      bid.acceptedBy = userId;
      bid.productionStartDate = new Date();
      bid.expectedShipDate = new Date(
        new Date().getTime() + bid.leadTimeDays * 24 * 60 * 60 * 1000
      );

      await bidRepo.save(bid);

      // H5: Reject all other pending bids on the same order
      await bidRepo.update(
        { orderId: bid.orderId, id: Not(bid.id), status: BidStatus.PENDING },
        { status: BidStatus.REJECTED }
      );

      // Create payment milestones based on payment terms
      const upfrontAmount =
        (bid.quotedPrice * settings.paymentUpfrontPercent) / 100;
      const shippingAmount =
        (bid.quotedPrice * settings.paymentShippingPercent) / 100;
      const deliveryAmount =
        (bid.quotedPrice * settings.paymentDeliveryPercent) / 100;

      const milestones = [
        milestoneRepo.create({
          bidId: bid.id,
          type: MilestoneType.UPFRONT,
          amount: upfrontAmount,
          percentage: settings.paymentUpfrontPercent,
          status: MilestoneStatus.PENDING,
          producerActionRequired: "Confirm production has started",
          dueDate: new Date(new Date().getTime() + 2 * 24 * 60 * 60 * 1000),
        }),
        milestoneRepo.create({
          bidId: bid.id,
          type: MilestoneType.SHIPPING,
          amount: shippingAmount,
          percentage: settings.paymentShippingPercent,
          status: MilestoneStatus.PENDING,
          producerActionRequired: "Confirm ready to ship, provide tracking",
          dueDate: bid.expectedShipDate,
        }),
        milestoneRepo.create({
          bidId: bid.id,
          type: MilestoneType.DELIVERY,
          amount: deliveryAmount,
          percentage: settings.paymentDeliveryPercent,
          status: MilestoneStatus.PENDING,
          producerActionRequired: "Item delivered to buyer",
          dueDate: new Date(
            bid.expectedShipDate.getTime() + 14 * 24 * 60 * 60 * 1000
          ),
        }),
      ];

      await milestoneRepo.save(milestones);

      return { bid, settings, milestones, upfrontAmount, shippingAmount, deliveryAmount };
    });

    const { bid, settings, milestones, upfrontAmount, shippingAmount, deliveryAmount } = result;

    // === SEND NOTIFICATION TO PRODUCER (outside transaction — non-critical) ===
    if (bid.producer?.user?.id) {
      await notificationService.createNotification(
        bid.producer.user.id,
        NotificationType.BID_ACCEPTED,
        "Your bid has been accepted!",
        `Your bid of $${bid.quotedPrice} for the order has been accepted. Production should start by ${bid.productionStartDate.toLocaleDateString()}.`,
        {
          senderId: userId,
          relatedEntityId: bid.id,
          relatedEntityType: "bid",
          badge: `$${bid.quotedPrice}`,
          actionUrl: `/orders/${bid.orderId}`,
          actionLabel: "View Order",
        }
      );
    }

    res.json({
      message: "Bid accepted successfully. Payment milestones created.",
      bid: {
        id: bid.id,
        status: bid.status,
        acceptedAt: bid.acceptedAt,
        quotedPrice: bid.quotedPrice,
        productionStartDate: bid.productionStartDate,
        expectedShipDate: bid.expectedShipDate,
      },
      paymentTerms: {
        upfrontPercent: settings.paymentUpfrontPercent,
        upfrontAmount,
        shippingPercent: settings.paymentShippingPercent,
        shippingAmount,
        deliveryPercent: settings.paymentDeliveryPercent,
        deliveryAmount,
      },
      milestones: milestones.map((m) => ({
        id: m.id,
        type: m.type,
        amount: m.amount,
        status: m.status,
        producerActionRequired: m.producerActionRequired,
        dueDate: m.dueDate,
      })),
    });

    // === AUDIT LOG: Bid Accepted ===
    try {
      const auditRepo = AppDataSource.getRepository(AuditLog);
      await auditRepo.save(auditRepo.create({
        entityType: "Bid",
        entityId: bid.id,
        action: "STATUS_CHANGE",
        userId,
        changes: JSON.stringify({ status: { old: "PENDING", new: "ACCEPTED" } }),
        snapshot: JSON.stringify({ bidId: bid.id, orderId: bid.order?.id, totalAmount: bid.quotedPrice }),
        ipAddress: req.ip || undefined,
      }));
    } catch (auditErr) {
      console.error("Audit log error (non-fatal):", auditErr);
    }
  } catch (error: any) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("Accept bid error:", error);
    res.status(500).json({ error: "Failed to accept bid" });
  }
});

// ============================================================================
// PAYMENT MILESTONE ENDPOINTS
// ============================================================================

/**
 * GET /bids/:bidId/milestones - Get all payment milestones for a bid
 */
router.get("/:bidId/milestones", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { bidId } = req.params;

    // Verify user is party to this bid
    const bidRepo = AppDataSource.getRepository(Bid);
    const bid = await bidRepo.findOne({
      where: { id: bidId },
      relations: ["order", "producer"],
    });

    if (!bid) {
      return res.status(404).json({ error: "Bid not found" });
    }

    const isBuyer = bid.order.buyerId === userId;
    const isProducer = bid.producer?.user?.id === userId;
    if (!isBuyer && !isProducer) {
      return res.status(403).json({ error: "Unauthorized - you're not part of this transaction" });
    }

    const milestoneRepo = AppDataSource.getRepository(PaymentMilestone);
    const milestones = await milestoneRepo.find({
      where: { bidId },
      order: { createdAt: "ASC" },
    });

    if (!milestones.length) {
      return res.status(404).json({ error: "No milestones found for this bid" });
    }

    res.json({ milestones });
  } catch (error) {
    console.error("Get milestones error:", error);
    res.status(500).json({ error: "Failed to fetch milestones" });
  }
});

/**
 * PUT /milestones/:milestoneId/mark-producer-action - Producer marks action as complete (e.g., "production started", "ready to ship")
 */
router.put(
  "/milestones/:milestoneId/mark-producer-action",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { milestoneId } = req.params;
      const { actionProof } = req.body;

      const milestoneRepo = AppDataSource.getRepository(PaymentMilestone);
      const bidRepo = AppDataSource.getRepository(Bid);

      const milestone = await milestoneRepo.findOne({ where: { id: milestoneId } });

      if (!milestone) {
        return res.status(404).json({ error: "Milestone not found" });
      }

      const bid = await bidRepo.findOne({
        where: { id: milestone.bidId },
        relations: ["producer"],
      });

      // Verify producer owns this bid
      if (bid!.producer.user?.id !== userId) {
        return res.status(403).json({ error: "Unauthorized - you're not the producer" });
      }

      milestone.producerActionCompleted = true;
      milestone.producerActionCompletedDate = new Date();
      milestone.producerActionProof = actionProof || null;

      await milestoneRepo.save(milestone);

      res.json({
        message: "Producer action marked as complete",
        milestone,
      });
    } catch (error) {
      console.error("Mark producer action error:", error);
      res.status(500).json({ error: "Failed to mark action complete" });
    }
  }
);

/**
 * PUT /milestones/:milestoneId/mark-buyer-payment - Buyer pays milestone via Stripe
 * Body: { paymentMethodId? } — if omitted, uses default card on file
 */
router.put(
  "/milestones/:milestoneId/mark-buyer-payment",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { milestoneId } = req.params;
      const { paymentMethodId } = req.body;

      const milestoneRepo = AppDataSource.getRepository(PaymentMilestone);
      const bidRepo = AppDataSource.getRepository(Bid);
      const userRepo = AppDataSource.getRepository(User);

      const milestone = await milestoneRepo.findOne({ where: { id: milestoneId } });

      if (!milestone) {
        return res.status(404).json({ error: "Milestone not found" });
      }

      if (milestone.status === MilestoneStatus.COMPLETED) {
        return res.status(400).json({ error: "Milestone already completed" });
      }

      const bid = await bidRepo.findOne({
        where: { id: milestone.bidId },
        relations: ["order"],
      });

      if (!bid) {
        return res.status(404).json({ error: "Bid not found" });
      }

      // Verify buyer owns the order
      if (bid.order.buyerId !== userId) {
        return res.status(403).json({ error: "Unauthorized - you don't own this order" });
      }

      // Get buyer's Stripe customer
      const buyer = await userRepo.findOne({ where: { id: userId } });
      if (!buyer?.stripeCustomerId) {
        return res.status(400).json({ error: "No payment method on file" });
      }

      // Charge the milestone amount via Stripe
      const amountCents = Math.round(Number(milestone.amount) * 100);
      let paymentIntent: Stripe.PaymentIntent;

      try {
        const piParams: Stripe.PaymentIntentCreateParams = {
          amount: amountCents,
          currency: "usd",
          customer: buyer.stripeCustomerId,
          description: `PDS Milestone: ${milestone.type} (${milestone.percentage}%) — Order ${bid.orderId}`,
          metadata: {
            milestoneId: milestone.id,
            milestoneType: milestone.type,
            bidId: bid.id,
            orderId: bid.orderId,
            userId,
            source: "pds-marketplace-milestone",
          },
          automatic_payment_methods: { enabled: true, allow_redirects: "never" },
          confirm: true,
        };

        // Use specific payment method if provided, otherwise use default
        if (paymentMethodId) {
          piParams.payment_method = paymentMethodId;
        } else {
          // Use customer's default payment method
          const methods = await stripe.paymentMethods.list({
            customer: buyer.stripeCustomerId,
            type: "card",
          });
          if (methods.data.length === 0) {
            return res.status(400).json({ error: "No card on file. Please add a payment method." });
          }
          piParams.payment_method = methods.data[0].id;
        }

        piParams.off_session = true;
        paymentIntent = await stripe.paymentIntents.create(piParams);
      } catch (stripeErr: any) {
        console.error("Milestone payment failed:", stripeErr.message);
        return res.status(402).json({
          error: "Payment failed",
          details: stripeErr.type === "StripeCardError" ? stripeErr.message : "Payment could not be processed",
        });
      }

      if (paymentIntent.status !== "succeeded") {
        return res.status(402).json({
          error: "Payment not completed",
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
        });
      }

      // Get platform fee using the seller's per-user commission rate
      const { payoutService: _ps } = await import("../services/payoutService.js");
      const producer = await AppDataSource.getRepository(Producer).findOne({
        where: { id: bid.producerId },
        relations: ["user"],
      });
      const feePercent = producer?.user?.id
        ? await _ps.getCommissionRate(producer.user.id)
        : 10;
      const platformFee = parseFloat(((Number(milestone.amount) * feePercent) / 100).toFixed(2));

      // Mark milestone as completed
      milestone.buyerPaymentReceived = true;
      milestone.buyerPaymentDate = new Date();
      milestone.status = MilestoneStatus.COMPLETED;
      milestone.stripePaymentIntentId = paymentIntent.id;
      milestone.platformFeeAmount = platformFee;

      await milestoneRepo.save(milestone);

      // Create invoice for the milestone payment
      try {
        await invoiceService.createChargeInvoice({
          userId,
          type: InvoiceType.MILESTONE_PAYMENT,
          amount: Number(milestone.amount),
          platformFee,
          stripePaymentIntentId: paymentIntent.id,
          description: `Milestone: ${milestone.type} (${milestone.percentage}%) — Order ${bid.orderId}`,
          sourceEntityType: "payment_milestone",
          sourceEntityId: milestone.id,
          metadata: { milestoneType: milestone.type, bidId: bid.id, orderId: bid.orderId },
        });
      } catch (invErr: any) {
        console.warn("Invoice creation for milestone failed (non-fatal):", invErr.message);
      }

      // Create payout for the producer/designer (reuse producer from above)
      try {
        if (producer?.user?.id) {
          await _ps.createOrderPayout({
            userId: producer.user.id,
            grossAmount: Number(milestone.amount),
            orderId: bid.orderId,
            milestoneId: milestone.id,
            milestoneType: milestone.type,
          });
        }
      } catch (payoutErr: any) {
        console.warn("Payout creation for milestone failed (non-fatal):", payoutErr.message);
      }

      res.json({
        message: "Payment received and milestone completed",
        milestone: {
          id: milestone.id,
          type: milestone.type,
          amount: milestone.amount,
          status: milestone.status,
          stripePaymentIntentId: paymentIntent.id,
        },
      });
    } catch (error) {
      console.error("Mark buyer payment error:", error);
      res.status(500).json({ error: "Failed to process milestone payment" });
    }
  }
);

/**
 * PUT /bids/:bidId/confirm-delivery - Buyer confirms receiving product
 */
router.put("/:bidId/confirm-delivery", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { bidId } = req.params;

    const bidRepo = AppDataSource.getRepository(Bid);

    const bid = await bidRepo.findOne({
      where: { id: bidId },
      relations: ["order"],
    });

    if (!bid) {
      return res.status(404).json({ error: "Bid not found" });
    }

    // Verify buyer owns the order
    if (bid.order.buyerId !== userId) {
      return res.status(403).json({ error: "Unauthorized - you don't own this order" });
    }

    if (bid.status !== BidStatus.SHIPPED) {
      return res.status(400).json({ error: "Can only confirm delivery on shipped bids" });
    }

    bid.buyerConfirmedDelivery = true;
    bid.buyerDeliveryConfirmDate = new Date();
    bid.actualDeliveryDate = new Date();
    bid.status = BidStatus.DELIVERED;

    await bidRepo.save(bid);

    res.json({
      message: "Delivery confirmed",
      bid,
    });
  } catch (error) {
    console.error("Confirm delivery error:", error);
    res.status(500).json({ error: "Failed to confirm delivery" });
  }
});

// ============================================================================
// DISPUTE ENDPOINTS
// ============================================================================

/**
 * POST /bids/:bidId/disputes - File a dispute
 */
router.post("/:bidId/disputes", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { bidId } = req.params;
    const { failureType, description, evidence, claimedAmount } = req.body;

    if (!failureType || !description || !claimedAmount) {
      return res.status(400).json({ error: "failureType, description, and claimedAmount are required" });
    }

    const bidRepo = AppDataSource.getRepository(Bid);
    const disputeRepo = AppDataSource.getRepository(Dispute);

    const bid = await bidRepo.findOne({
      where: { id: bidId },
      relations: ["order", "producer"],
    });

    if (!bid) {
      return res.status(404).json({ error: "Bid not found" });
    }

    // Verify user is either buyer or producer
    const isBuyer = bid.order.buyerId === userId;
    const isProducer = bid.producer.user?.id === userId;

    if (!isBuyer && !isProducer) {
      return res.status(403).json({ error: "Unauthorized - you're not part of this transaction" });
    }

    // Create dispute
    const dispute = disputeRepo.create({
      bidId,
      filedBy: userId,
      failureType,
      status: DisputeStatus.FILED,
      description,
      evidence: JSON.stringify(evidence || []),
      claimedAmount,
    });

    await disputeRepo.save(dispute);

    // Update bid status
    bid.status = BidStatus.DISPUTED;
    await bidRepo.save(bid);

    res.json({
      message: "Dispute filed successfully",
      dispute: {
        id: dispute.id,
        status: dispute.status,
        failureType: dispute.failureType,
        description: dispute.description,
        claimedAmount: dispute.claimedAmount,
        createdAt: dispute.createdAt,
      },
    });

    // === AUDIT LOG: Dispute Filed ===
    try {
      const auditRepo = AppDataSource.getRepository(AuditLog);
      await auditRepo.save(auditRepo.create({
        entityType: "Dispute",
        entityId: dispute.id,
        action: "CREATE",
        userId,
        snapshot: JSON.stringify({ bidId, failureType, claimedAmount, status: "FILED" }),
        ipAddress: req.ip || undefined,
      }));
    } catch (auditErr) {
      console.error("Audit log error (non-fatal):", auditErr);
    }
  } catch (error) {
    console.error("File dispute error:", error);
    res.status(500).json({ error: "Failed to file dispute" });
  }
});

/**
 * GET /bids/:bidId/disputes - Get all disputes for a bid
 */
router.get("/:bidId/disputes", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { bidId } = req.params;

    // Verify user is party to this bid
    const bidRepo = AppDataSource.getRepository(Bid);
    const bid = await bidRepo.findOne({
      where: { id: bidId },
      relations: ["order", "producer"],
    });

    if (!bid) {
      return res.status(404).json({ error: "Bid not found" });
    }

    const isBuyer = bid.order.buyerId === userId;
    const isProducer = bid.producer?.user?.id === userId;
    if (!isBuyer && !isProducer) {
      return res.status(403).json({ error: "Unauthorized - you're not part of this transaction" });
    }

    const disputeRepo = AppDataSource.getRepository(Dispute);
    const disputes = await disputeRepo.find({
      where: { bidId },
      order: { createdAt: "DESC" },
    });

    res.json({ disputes });
  } catch (error) {
    console.error("Get disputes error:", error);
    res.status(500).json({ error: "Failed to fetch disputes" });
  }
});

/**
 * PUT /disputes/:disputeId/respond - Respond to a dispute
 */
router.put("/disputes/:disputeId/respond", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { disputeId } = req.params;
    const { response } = req.body;

    if (!response) {
      return res.status(400).json({ error: "response is required" });
    }

    const disputeRepo = AppDataSource.getRepository(Dispute);
    const dispute = await disputeRepo.findOne({ where: { id: disputeId } });

    if (!dispute) {
      return res.status(404).json({ error: "Dispute not found" });
    }

    // Verify user is the respondent (not the filer) AND is party to the bid
    if (dispute.filedBy === userId) {
      return res.status(403).json({ error: "You cannot respond to your own dispute" });
    }

    const bidRepo = AppDataSource.getRepository(Bid);
    const bid = await bidRepo.findOne({
      where: { id: dispute.bidId },
      relations: ["order", "producer"],
    });

    if (!bid) {
      return res.status(404).json({ error: "Associated bid not found" });
    }

    const isBuyer = bid.order.buyerId === userId;
    const isProducer = bid.producer?.user?.id === userId;
    if (!isBuyer && !isProducer) {
      return res.status(403).json({ error: "Unauthorized - you're not part of this transaction" });
    }

    dispute.respondentResponse = response;
    dispute.respondentResponseDate = new Date();
    dispute.status = DisputeStatus.UNDER_REVIEW;

    await disputeRepo.save(dispute);

    res.json({
      message: "Response submitted. Dispute under review by admin.",
      dispute,
    });
  } catch (error) {
    console.error("Respond to dispute error:", error);
    res.status(500).json({ error: "Failed to respond to dispute" });
  }
});

/**
 * PUT /disputes/:disputeId/resolve - Admin resolves dispute
 */
router.put("/disputes/:disputeId/resolve", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { disputeId } = req.params;
    const { resolution, refundAmount, adminNotes } = req.body;

    // Verify user is admin
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId } });

    if (!user || (user.role !== "admin" && !user.isStaff)) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const disputeRepo = AppDataSource.getRepository(Dispute);
    const dispute = await disputeRepo.findOne({ where: { id: disputeId } });

    if (!dispute) {
      return res.status(404).json({ error: "Dispute not found" });
    }

    dispute.resolution = resolution || DisputeResolution.PENDING;
    dispute.refundAmount = refundAmount || 0;
    dispute.adminNotes = adminNotes || null;
    dispute.status = DisputeStatus.RESOLVED;
    dispute.resolvedAt = new Date();
    dispute.appealable = true; // Allow appeal of admin decision

    // === ISSUE STRIPE REFUND IF APPLICABLE ===
    if (
      refundAmount > 0 &&
      (resolution === DisputeResolution.BUYER_WINS || resolution === DisputeResolution.PARTIAL_REFUND)
    ) {
      try {
        // Find the order's payment intent via the bid's order
        const orderRepo = AppDataSource.getRepository(Order);
        const bid = await AppDataSource.getRepository(Bid).findOne({ where: { id: dispute.bidId } });
        const order = bid ? await orderRepo.findOne({ where: { id: bid.orderId } }) : null;

        if (order?.stripePaymentIntentId) {
          const refund = await stripe.refunds.create({
            payment_intent: order.stripePaymentIntentId,
            amount: Math.round(refundAmount * 100), // cents
            metadata: {
              disputeId: dispute.id,
              resolution,
              source: "pds-marketplace-dispute",
            },
          });

          dispute.stripeRefundId = refund.id;

          // Create refund invoice
          await invoiceService.createRefundInvoice({
            userId: dispute.filedBy,
            amount: refundAmount,
            stripeRefundId: refund.id,
            description: `Dispute refund — ${resolution}`,
            sourceEntityType: "dispute",
            sourceEntityId: dispute.id,
            metadata: { orderId: order.id, disputeId: dispute.id, resolution },
          });
        }
      } catch (refundErr: any) {
        console.error("Stripe refund failed (dispute still resolved):", refundErr.message);
        dispute.adminNotes = (dispute.adminNotes || "") + ` | REFUND FAILED: ${refundErr.message}`;
      }
    }

    await disputeRepo.save(dispute);

    res.json({
      message: "Dispute resolved",
      dispute,
    });

    // === AUDIT LOG: Dispute Resolved ===
    try {
      const auditRepo = AppDataSource.getRepository(AuditLog);
      await auditRepo.save(auditRepo.create({
        entityType: "Dispute",
        entityId: disputeId,
        action: "STATUS_CHANGE",
        userId,
        changes: JSON.stringify({ status: { old: "UNDER_REVIEW", new: "RESOLVED" }, resolution, refundAmount }),
        snapshot: JSON.stringify({ disputeId, resolution, refundAmount, adminNotes }),
        reason: adminNotes || undefined,
        ipAddress: req.ip || undefined,
      }));
    } catch (auditErr) {
      console.error("Audit log error (non-fatal):", auditErr);
    }
  } catch (error) {
    console.error("Resolve dispute error:", error);
    res.status(500).json({ error: "Failed to resolve dispute" });
  }
});

// ============================================================================
// BID PROGRESS UPDATE & ARCHIVE
// ============================================================================

/**
 * PUT /bids/:bidId/progress - Update progress on accepted bid
 * Body: { progressPercent: 20|40|60|80|100, progressNote: "string" }
 * 60% automatically sets status to READY_TO_SHIP
 * 100% automatically sets status to COMPLETED
 */
router.put("/:bidId/progress", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { bidId } = req.params;
    const { progressPercent, progressNote } = req.body;

    if (progressPercent === undefined || ![0, 20, 40, 60, 80, 100].includes(Number(progressPercent))) {
      return res.status(400).json({ error: "progressPercent must be one of: 0, 20, 40, 60, 80, 100" });
    }

    const bidRepo = AppDataSource.getRepository(Bid);
    const bid = await bidRepo.findOne({ where: { id: bidId }, relations: ["order", "producer"] });

    if (!bid) return res.status(404).json({ error: "Bid not found" });

    // Either the producer who made the bid, or the buyer who owns the order can update
    const producerRepo = AppDataSource.getRepository(Producer);
    const producer = await producerRepo.findOne({ where: { id: bid.producerId }, relations: ["user"] });
    const isProducer = producer?.user?.id === userId;
    const isBuyer = bid.order?.buyerId === userId;

    if (!isProducer && !isBuyer) {
      return res.status(403).json({ error: "Only the producer or buyer can update progress" });
    }

    // Must be in an active state
    const activeStatuses = [BidStatus.ACCEPTED, BidStatus.IN_PRODUCTION, BidStatus.READY_TO_SHIP, BidStatus.SHIPPED];
    if (!activeStatuses.includes(bid.status)) {
      return res.status(400).json({ error: `Cannot update progress for bid with status: ${bid.status}` });
    }

    bid.progressPercent = Number(progressPercent);
    if (progressNote !== undefined) bid.progressNote = progressNote;

    // Auto-transition statuses based on progress
    if (progressPercent >= 20 && bid.status === BidStatus.ACCEPTED) {
      bid.status = BidStatus.IN_PRODUCTION;
    }
    if (progressPercent >= 60) {
      bid.status = BidStatus.READY_TO_SHIP;
    }
    if (progressPercent >= 80) {
      bid.status = BidStatus.SHIPPED;
    }
    if (progressPercent >= 100) {
      bid.status = BidStatus.DELIVERED;
    }

    await bidRepo.save(bid);

    res.json({ success: true, bid: { id: bid.id, status: bid.status, progressPercent: bid.progressPercent, progressNote: bid.progressNote } });
  } catch (error) {
    console.error("Update bid progress error:", error);
    res.status(500).json({ error: "Failed to update progress" });
  }
});

/**
 * PATCH /bids/:bidId/archive - Toggle archive flag on a bid card
 */
router.patch("/:bidId/archive", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { bidId } = req.params;

    const bidRepo = AppDataSource.getRepository(Bid);
    const bid = await bidRepo.findOne({ where: { id: bidId }, relations: ["order", "producer"] });

    if (!bid) return res.status(404).json({ error: "Bid not found" });

    // Authorization
    const producerRepo = AppDataSource.getRepository(Producer);
    const producer = await producerRepo.findOne({ where: { id: bid.producerId }, relations: ["user"] });
    const isProducer = producer?.user?.id === userId;
    const isBuyer = bid.order?.buyerId === userId;

    if (!isProducer && !isBuyer) {
      return res.status(403).json({ error: "Not authorized" });
    }

    bid.archived = !bid.archived;
    await bidRepo.save(bid);

    res.json({ success: true, archived: bid.archived });
  } catch (error) {
    console.error("Archive bid error:", error);
    res.status(500).json({ error: "Failed to archive bid" });
  }
});

export default router;
