import { Router, Request, Response } from "express";
import { Repository } from "typeorm";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { User, UserRole } from "../entities/user.js";
import { Order, OrderStatus } from "../entities/order.js";
import { OrderItem } from "../entities/order-item.js";
import { Product } from "../entities/product.js";
import { Bid } from "../entities/bid.js";
import { Dispute, DisputeStatus } from "../entities/dispute.js";
import { SiteSettings } from "../entities/site-settings.js";
import { AuditLog } from "../entities/audit-log.js";
import { MessageFee } from "../entities/message-fee.js";
import { BulletinCard, BulletinCardStatus } from "../entities/bulletin-card.js";
import { Report, ReportStatus } from "../entities/report.js";
import { Invoice, InvoiceType, InvoiceStatus } from "../entities/invoice.js";
import { Payout, PayoutStatus, PayoutType } from "../entities/payout.js";
import AppDataSource from "../database.js";
import { verifyToken } from "./auth.js";
import { auditService } from "../services/auditService.js";
import { runBillingCycle } from "../jobs/messaging-fee-billing.js";
import { runPayoutProcessing } from "../jobs/payout-processing.js";
import { payoutService } from "../services/payoutService.js";
import { invoiceService } from "../services/invoiceService.js";
import stripe from "../config/stripe.js";
import Stripe from "stripe";

const router = Router();

/**
 * Admin Authorization Middleware
 * Checks if user is an admin
 */
async function requireAdmin(req: Request, res: Response, next: Function) {
  try {
    const userId = (req as any).userId;
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId } });

    if (!user || (user.role !== UserRole.ADMIN && !user.isStaff)) {
      return res.status(403).json({ error: "Admin access required" });
    }

    (req as any).admin = user;
    next();
  } catch (error) {
    res.status(401).json({ error: "Unauthorized" });
  }
}

// ============================================================================
// USER MANAGEMENT
// ============================================================================

/**
 * GET /v1/admin/users
 * List all users with optional filtering
 */
router.get("/users", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = Math.min(parseInt(req.query.offset as string) || 0, 1000);
    const role = req.query.role as string;
    const status = req.query.status as string; // "active", "suspended", "verified"

    const userRepo = AppDataSource.getRepository(User);
    let query = userRepo.createQueryBuilder("u");

    if (role) {
      query = query.andWhere("u.role = :role", { role });
    }

    if (status === "suspended") {
      query = query.andWhere("u.suspendedUntil > NOW()");
    } else if (status === "verified") {
      query = query.andWhere("u.verified = true");
    } else if (status === "active") {
      query = query.andWhere("u.active = true");
    }

    const [users, total] = await query
      .orderBy("u.createdAt", "DESC")
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    res.json({
      success: true,
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        isStaff: u.isStaff,
        verified: u.verified,
        active: u.active,
        commissionRate: u.commissionRate || 0,
        postingFeesWaived: !!u.postingFeesWaived,
        suspended: u.suspendedUntil && new Date(u.suspendedUntil) > new Date(),
        suspendedReason: u.suspendedReason,
        deviceNetworkAccess: u.deviceNetworkAccess,
        propertyPortalAccess: u.propertyPortalAccess,
        resumeAccess: u.resumeAccess,
        createdAt: u.createdAt,
      })),
      total,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

/**
 * GET /v1/admin/users/:userId
 * Get detailed user information
 */
router.get("/users/:userId", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        isStaff: user.isStaff,
        staffRole: user.staffRole,
        verified: user.verified,
        active: user.active,
        emailVerified: user.emailVerified,
        suspended: user.suspendedUntil && new Date(user.suspendedUntil) > new Date(),
        suspendedReason: user.suspendedReason,
        suspendedUntil: user.suspendedUntil,
        shippingAddress: {
          street: user.shippingStreet,
          city: user.shippingCity,
          state: user.shippingState,
          zip: user.shippingZip,
          country: user.shippingCountry,
        },
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

/**
 * PATCH /v1/admin/users/:userId/verify
 * Verify/unverify user account
 */
router.patch(
  "/users/:userId/verify",
  verifyToken,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId;
      const { verified } = req.body;

      const userRepo = AppDataSource.getRepository(User);
      const result = await userRepo.update({ id: userId }, { verified });

      if (result.affected === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ success: true, message: "User verification status updated" });
    } catch (error) {
      console.error("Error updating user verification:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  }
);

/**
 * PATCH /v1/admin/users/:userId/suspend
 * Suspend user account
 */
router.patch(
  "/users/:userId/suspend",
  verifyToken,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId;
      const { reason, durationDays } = req.body;

      if (!reason) {
        return res.status(400).json({ error: "Suspension reason required" });
      }

      const suspendedUntil = new Date();
      suspendedUntil.setDate(suspendedUntil.getDate() + (durationDays || 30));

      const userRepo = AppDataSource.getRepository(User);
      const result = await userRepo.update(
        { id: userId },
        { suspendedReason: reason, suspendedUntil, active: false }
      );

      if (result.affected === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        success: true,
        message: `User suspended until ${suspendedUntil.toISOString()}`,
      });
    } catch (error) {
      console.error("Error suspending user:", error);
      res.status(500).json({ error: "Failed to suspend user" });
    }
  }
);

/**
 * PATCH /v1/admin/users/:userId/unsuspend
 * Unsuspend user account
 */
router.patch(
  "/users/:userId/unsuspend",
  verifyToken,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId;
      const userRepo = AppDataSource.getRepository(User);

      const result = await userRepo.update(
        { id: userId },
        { active: true, suspendedReason: null as any, suspendedUntil: null as any }
      );

      if (result.affected === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ success: true, message: "User unsuspended" });
    } catch (error) {
      console.error("Error unsuspending user:", error);
      res.status(500).json({ error: "Failed to unsuspend user" });
    }
  }
);

// ============================================================================
// ORDER MONITORING
// ============================================================================

/**
 * GET /v1/admin/orders
 * List all orders with optional filtering
 */
router.get("/orders", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = Math.min(parseInt(req.query.offset as string) || 0, 1000);
    const status = req.query.status as string;

    const orderRepo = AppDataSource.getRepository(Order);
    let query = orderRepo.createQueryBuilder("o").leftJoinAndSelect("o.buyer", "buyer");

    if (status) {
      query = query.where("o.status = :status", { status });
    }

    const [orders, total] = await query
      .orderBy("o.createdAt", "DESC")
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    res.json({
      success: true,
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        buyerEmail: o.buyer?.email,
        buyerName: `${o.buyer?.firstName} ${o.buyer?.lastName}`,
        status: o.status,
        totalAmount: o.totalAmount,
        subtotal: o.subtotal,
        tax: o.tax,
        shippingCost: o.shippingCost,
        createdAt: o.createdAt,
      })),
      total,
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

/**
 * GET /v1/admin/orders/:orderId
 * Get detailed order information
 */
router.get("/orders/:orderId", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const orderId = req.params.orderId;
    const orderRepo = AppDataSource.getRepository(Order);

    const order = await orderRepo.findOne({
      where: { id: orderId },
      relations: [
        "buyer",
        "items",
        "items.product",
        "paymentMilestones",
        "bids",
        "bids.producer",
      ],
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json({
      success: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        buyer: {
          id: order.buyer.id,
          email: order.buyer.email,
          name: `${order.buyer.firstName} ${order.buyer.lastName}`,
        },
        status: order.status,
        totalAmount: order.totalAmount,
        subtotal: order.subtotal,
        tax: order.tax,
        shippingCost: order.shippingCost,
        items: order.items?.map((item: OrderItem) => ({
          id: item.id,
          productName: item.product?.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
        })),
        // Note: PaymentMilestones are tied to bids, not orders directly
        bids: order.bids?.map((b: Bid) => ({
          id: b.id,
          producerId: b.producerId,
          status: b.status,
          quotedPrice: b.quotedPrice,
          leadTimeDays: b.leadTimeDays,
        })),
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching order:", error);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

// ============================================================================
// DISPUTE RESOLUTION
// ============================================================================

/**
 * GET /v1/admin/disputes
 * List all disputes with optional filtering
 */
router.get("/disputes", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = Math.min(parseInt(req.query.offset as string) || 0, 1000);
    const status = req.query.status as string;

    const disputeRepo = AppDataSource.getRepository(Dispute);
    let query = disputeRepo
      .createQueryBuilder("d")
      .leftJoinAndSelect("d.bid", "bid")
      .leftJoinAndSelect("d.filedByUser", "filer");

    if (status) {
      query = query.where("d.status = :status", { status });
    }

    const [disputes, total] = await query
      .orderBy("d.createdAt", "DESC")
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    res.json({
      success: true,
      disputes: disputes.map((d: Dispute) => ({
        id: d.id,
        bidId: d.bidId,
        failureType: d.failureType,
        status: d.status,
        claimedAmount: d.claimedAmount,
        createdAt: d.createdAt,
      })),
      total,
    });
  } catch (error) {
    console.error("Error fetching disputes:", error);
    res.status(500).json({ error: "Failed to fetch disputes" });
  }
});

/**
 * GET /v1/admin/disputes/:disputeId
 * Get detailed dispute information
 */
router.get(
  "/disputes/:disputeId",
  verifyToken,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const disputeId = req.params.disputeId;
      const disputeRepo = AppDataSource.getRepository(Dispute);

      const dispute = await disputeRepo.findOne({
        where: { id: disputeId },
        relations: ["bid", "filedByUser"],
      });

      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found" });
      }

      res.json({
        success: true,
        dispute: {
          id: dispute.id,
          bidId: dispute.bidId,
          failureType: dispute.failureType,
          description: dispute.description,
          status: dispute.status,
          claimedAmount: dispute.claimedAmount,
          resolution: dispute.resolution,
          adminNotes: dispute.adminNotes,
          createdAt: dispute.createdAt,
          updatedAt: dispute.updatedAt,
        },
      });
    } catch (error) {
      console.error("Error fetching dispute:", error);
      res.status(500).json({ error: "Failed to fetch dispute" });
    }
  }
);

/**
 * PATCH /v1/admin/disputes/:disputeId/resolve
 * Resolve a dispute with admin decision + optional Stripe refund
 */
router.patch(
  "/disputes/:disputeId/resolve",
  verifyToken,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const disputeId = req.params.disputeId;
      const { resolution, resolutionNotes, refundAmount } = req.body;

      if (!resolution) {
        return res.status(400).json({ error: "Resolution decision required" });
      }

      const disputeRepo = AppDataSource.getRepository(Dispute);
      const dispute = await disputeRepo.findOne({ where: { id: disputeId } });

      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found" });
      }

      dispute.status = DisputeStatus.RESOLVED;
      dispute.resolution = resolution;
      dispute.adminNotes = resolutionNotes || "";
      dispute.resolvedAt = new Date();
      dispute.refundAmount = refundAmount || 0;

      // Issue Stripe refund if applicable
      let stripeRefundId: string | null = null;
      if (
        refundAmount > 0 &&
        (resolution === "buyer_wins" || resolution === "partial_refund")
      ) {
        try {
          // Find the order via bid
          const bidRepo = AppDataSource.getRepository(Bid);
          const bid = await bidRepo.findOne({ where: { id: dispute.bidId } });
          const orderRepo = AppDataSource.getRepository(Order);
          const order = bid ? await orderRepo.findOne({ where: { id: bid.orderId } }) : null;

          if (order?.stripePaymentIntentId) {
            const refund = await stripe.refunds.create({
              payment_intent: order.stripePaymentIntentId,
              amount: Math.round(refundAmount * 100),
              metadata: {
                disputeId: dispute.id,
                resolution,
                source: "pds-marketplace-admin-dispute",
              },
            });

            stripeRefundId = refund.id;
            dispute.stripeRefundId = refund.id;

            // Create refund invoice
            await invoiceService.createRefundInvoice({
              userId: dispute.filedBy,
              amount: refundAmount,
              stripeRefundId: refund.id,
              description: `Admin dispute refund — ${resolution}`,
              sourceEntityType: "dispute",
              sourceEntityId: dispute.id,
              metadata: { orderId: order.id, disputeId: dispute.id },
            });
          }
        } catch (refundErr: any) {
          console.error("Stripe refund failed:", refundErr.message);
          dispute.adminNotes += ` | REFUND FAILED: ${refundErr.message}`;
        }
      }

      await disputeRepo.save(dispute);

      res.json({
        success: true,
        message: "Dispute resolved",
        stripeRefundId,
      });
    } catch (error) {
      console.error("Error resolving dispute:", error);
      res.status(500).json({ error: "Failed to resolve dispute" });
    }
  }
);

// ============================================================================
// SITE SETTINGS & ANALYTICS
// ============================================================================

/**
 * GET /v1/admin/settings
 * Get current site settings
 */
router.get("/settings", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const settingsRepo = AppDataSource.getRepository(SiteSettings);
    let settings = await settingsRepo.findOne({ where: { active: true } });

    if (!settings) {
      settings = settingsRepo.create({ active: true });
      await settingsRepo.save(settings);
    }

    res.json({ success: true, settings });
  } catch (error) {
    console.error("Error fetching settings:", error);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

/**
 * PATCH /v1/admin/settings
 * Update site settings (whitelist allowed fields to prevent mass assignment)
 */
router.patch("/settings", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const settingsRepo = AppDataSource.getRepository(SiteSettings);
    let settings = await settingsRepo.findOne({ where: { active: true } });

    if (!settings) {
      settings = new SiteSettings();
      settings.active = true;
    }

    // Whitelist allowed fields (prevent mass assignment of id, createdAt, etc.)
    const allowedFields = [
      "paymentUpfrontPercent", "paymentShippingPercent", "paymentDeliveryPercent",
      "disputeResponseDays", "disputeResolutionDays", "platformFeePercent",
      "postingFeePerRequest", "salesTaxWithholdingPercent",
      "producerFailureToProducePenalty", "producerFailureToShipPenalty", "producerFailureToDeliverPenalty",
      "buyerFailureToDepositPenalty", "buyerFailureToPayPenalty",
      "disputeResolutionPolicy",
    ];
    
    const changes: Record<string, { old: any; new: any }> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        changes[field] = { old: (settings as any)[field], new: req.body[field] };
        (settings as any)[field] = req.body[field];
      }
    }

    await settingsRepo.save(settings);
    
    // Audit log for settings changes
    if (Object.keys(changes).length > 0) {
      await auditService.logUpdate("SiteSettings", settings.id, admin.id, changes);
    }

    res.json({ success: true, message: "Settings updated", settings });
  } catch (error) {
    console.error("Error updating settings:", error);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

/**
 * GET /v1/admin/analytics
 * Get marketplace analytics
 */
router.get("/analytics", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const userRepo = AppDataSource.getRepository(User);
    const orderRepo = AppDataSource.getRepository(Order);
    const productRepo = AppDataSource.getRepository(Product);

    // User stats
    const totalUsers = await userRepo.count();
    const activeUsers = await userRepo.count({ where: { active: true } });
    const verifiedUsers = await userRepo.count({ where: { verified: true } });
    const designers = await userRepo.count({ where: { role: UserRole.DESIGNER } });
    const producers = await userRepo.count({ where: { role: UserRole.PRODUCER } });
    const buyers = await userRepo.count({ where: { role: UserRole.BUYER } });

    // Order stats
    const totalOrders = await orderRepo.count();
    const deliveredOrders = await orderRepo.count({
      where: { status: OrderStatus.DELIVERED },
    });
    const pendingOrders = await orderRepo.count({
      where: { status: OrderStatus.PENDING },
    });

    // Revenue stats (use SQL SUM for efficiency)
    const revenueResult = await orderRepo
      .createQueryBuilder("o")
      .select("COALESCE(SUM(o.totalAmount), 0)", "total")
      .getRawOne();
    const totalRevenue = Number(revenueResult?.total || 0);

    // Product stats
    const totalProducts = await productRepo.count();
    // const publishedProducts = await productRepo.count({ where: { active: true } });

    res.json({
      success: true,
      analytics: {
        users: {
          total: totalUsers,
          active: activeUsers,
          verified: verifiedUsers,
          byRole: {
            designers,
            producers,
            buyers,
          },
        },
        orders: {
          total: totalOrders,
          delivered: deliveredOrders,
          pending: pendingOrders,
          averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        },
        revenue: {
          total: totalRevenue,
        },
        products: {
          total: totalProducts,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// ============================================================================
// COMMISSION MANAGEMENT
// ============================================================================

/**
 * GET /v1/admin/commissions
 * List all users with their commission rates
 */
router.get(
  "/commissions",
  verifyToken,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const userRepo = AppDataSource.getRepository(User);
      const users = await userRepo.find({
        select: [
          "id",
          "email",
          "firstName",
          "lastName",
          "role",
          "commissionRate",
          "createdAt",
        ],
        order: { commissionRate: "DESC" },
      });

      res.json({
        users: users.map((user) => ({
          id: user.id,
          email: user.email,
          name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
          role: user.role,
          commissionRate: user.commissionRate || 0,
          createdAt: user.createdAt,
        })),
      });
    } catch (error) {
      console.error("Error fetching commissions:", error);
      res.status(500).json({ error: "Failed to fetch commission data" });
    }
  }
);

/**
 * PUT /v1/admin/commissions/:userId
 * Update user commission rate
 * Body: { commissionRate: number (0-100) }
 */
router.put(
  "/commissions/:userId",
  verifyToken,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { commissionRate } = req.body;

      // Validate commission rate
      if (
        commissionRate === undefined ||
        commissionRate === null ||
        typeof commissionRate !== "number"
      ) {
        return res
          .status(400)
          .json({ error: "commissionRate must be a number" });
      }

      if (commissionRate < 0 || commissionRate > 100) {
        return res
          .status(400)
          .json({ error: "commissionRate must be between 0 and 100" });
      }

      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({ where: { id: userId } });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      user.commissionRate = commissionRate;
      await userRepo.save(user);

      res.json({
        message: `Commission rate for ${user.email} updated to ${commissionRate}%`,
        user: {
          id: user.id,
          email: user.email,
          commissionRate: user.commissionRate,
        },
      });
    } catch (error) {
      console.error("Error updating commission:", error);
      res.status(500).json({ error: "Failed to update commission rate" });
    }
  }
);

/**
 * PUT /v1/admin/users/:userId/posting-fee-waiver
 * Toggle posting fee waiver for a user
 * Body: { waived: boolean }
 */
router.put(
  "/users/:userId/posting-fee-waiver",
  verifyToken,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { waived } = req.body;

      if (typeof waived !== "boolean") {
        return res.status(400).json({ error: "waived must be a boolean" });
      }

      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({ where: { id: userId } });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      user.postingFeesWaived = waived;
      await userRepo.save(user);

      res.json({
        message: `Posting fees for ${user.email} ${waived ? "WAIVED" : "reinstated"}`,
        user: { id: user.id, email: user.email, postingFeesWaived: user.postingFeesWaived },
      });
    } catch (error) {
      console.error("Error toggling posting fee waiver:", error);
      res.status(500).json({ error: "Failed to update posting fee waiver" });
    }
  }
);

/**
 * GET /v1/admin/commissions/:userId
 * Get specific user's commission rate
 */
router.get(
  "/commissions/:userId",
  verifyToken,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({
        where: { id: userId },
        select: ["id", "email", "firstName", "lastName", "commissionRate"],
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        id: user.id,
        email: user.email,
        name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
        commissionRate: Number(user.commissionRate) || 0,
      });
    } catch (error) {
      console.error("Error fetching user commission:", error);
      res.status(500).json({ error: "Failed to fetch user commission" });
    }
  }
);

// ============================================================================
// ADMIN USER CREATION
// ============================================================================

/**
 * POST /v1/admin/users
 * Create a new user from admin panel
 */
router.post("/users", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, role, roles, isStaff, staffRole, commissionRate } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    
    const userRepo = AppDataSource.getRepository(User);
    
    // Check for existing user
    const existing = await userRepo.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "User with this email already exists" });
    }
    
    // Determine primary role from roles array or single role field
    const validRoles = Object.values(UserRole);
    let userRole = UserRole.BUYER;
    if (Array.isArray(roles) && roles.length > 0) {
      // Priority order: admin > designer > producer > service_provider > author > buyer
      const rolePriority = ["admin", "designer", "producer", "service_provider", "author", "buyer"];
      for (const r of rolePriority) {
        if (roles.includes(r) && validRoles.includes(r as UserRole)) {
          userRole = r as UserRole;
          break;
        }
      }
    } else if (role && validRoles.includes(role as UserRole)) {
      userRole = role as UserRole;
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = userRepo.create({
      id: uuidv4(),
      email,
      password: hashedPassword,
      firstName: firstName || "",
      lastName: lastName || "",
      role: userRole,
      isStaff: isStaff || false,
      staffRole: staffRole || null,
      emailVerified: true, // Admin-created users are auto-verified
      active: true,
      verified: true,
      commissionRate: commissionRate ?? 10, // Default to platform rate; admin can override
    });
    
    const savedUser = await userRepo.save(user);
    
    res.status(201).json({
      success: true,
      message: "User created successfully",
      user: {
        id: savedUser.id,
        email: savedUser.email,
        firstName: savedUser.firstName,
        lastName: savedUser.lastName,
        role: savedUser.role,
        isStaff: savedUser.isStaff,
      },
    });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// ============================================================================
// ADMIN PASSWORD OVERRIDE
// ============================================================================

/**
 * PATCH /v1/admin/users/:userId/reset-password
 * Admin overrides user's password
 */
router.patch(
  "/users/:userId/reset-password",
  verifyToken,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { newPassword } = req.body;
      
      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: "New password must be at least 8 characters" });
      }
      
      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({ where: { id: userId } });
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      user.password = await bcrypt.hash(newPassword, 10);
      await userRepo.save(user);
      
      res.json({ success: true, message: `Password reset for ${user.email}` });
    } catch (error) {
      console.error("Error resetting password:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  }
);

/**
 * PATCH /v1/admin/users/:userId/service-access
 * Toggle service access flags for a user
 * Body: { deviceNetworkAccess?, propertyPortalAccess?, resumeAccess?, isPropertyManager?, isPropertyTenant? }
 */
router.patch(
  "/users/:userId/service-access",
  verifyToken,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { deviceNetworkAccess, propertyPortalAccess, resumeAccess, isPropertyManager, isPropertyTenant } = req.body;

      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({ where: { id: userId } });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (typeof deviceNetworkAccess === "boolean") {
        user.deviceNetworkAccess = deviceNetworkAccess;
      }
      if (typeof propertyPortalAccess === "boolean") {
        user.propertyPortalAccess = propertyPortalAccess;
        // Revoke sub-roles if portal access is removed
        if (!propertyPortalAccess) {
          user.isPropertyManager = false;
          user.isPropertyTenant = false;
        }
      }
      if (typeof resumeAccess === "boolean") {
        user.resumeAccess = resumeAccess;
      }
      if (typeof isPropertyManager === "boolean") {
        user.isPropertyManager = isPropertyManager;
      }
      if (typeof isPropertyTenant === "boolean") {
        user.isPropertyTenant = isPropertyTenant;
      }

      await userRepo.save(user);
      res.json({
        success: true,
        deviceNetworkAccess: user.deviceNetworkAccess,
        propertyPortalAccess: user.propertyPortalAccess,
        resumeAccess: user.resumeAccess,
        isPropertyManager: user.isPropertyManager,
        isPropertyTenant: user.isPropertyTenant,
      });
    } catch (error) {
      console.error("Error updating service access:", error);
      res.status(500).json({ error: "Failed to update service access" });
    }
  }
);

/**
 * PATCH /v1/admin/users/:userId/role
 * Admin changes a user's role
 */
router.patch(
  "/users/:userId/role",
  verifyToken,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      
      const validRoles = Object.values(UserRole);
      if (!validRoles.includes(role as UserRole)) {
        return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` });
      }
      
      const userRepo = AppDataSource.getRepository(User);
      const result = await userRepo.update({ id: userId }, { role });
      
      if (result.affected === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({ success: true, message: `User role updated to ${role}` });
    } catch (error) {
      console.error("Error updating role:", error);
      res.status(500).json({ error: "Failed to update role" });
    }
  }
);

/**
 * DELETE /v1/admin/users/:userId
 * Soft-delete a user account (GAAP compliance: never hard-delete)
 * Sets deletedAt timestamp and deactivates user. All related data is preserved.
 */
router.delete("/users/:userId", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const admin = (req as any).admin;
    
    // Prevent self-deletion
    if (userId === admin.id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }
    
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId } });
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Soft-delete: set deletedAt, deactivate, record who deleted
    user.active = false;
    user.deletedBy = admin.id;
    await userRepo.softRemove(user);
    
    // Audit log
    await auditService.logSoftDelete("User", userId, admin.id, `Admin soft-deleted user ${user.email}`);
    
    res.json({ success: true, message: `User ${user.email} soft-deleted (data preserved for GAAP compliance)` });
  } catch (error) {
    console.error("Error soft-deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// ============================================================================
// DATA MANAGEMENT
// ============================================================================

/**
 * POST /v1/admin/purge-data
 * Soft-delete all non-admin data (GAAP compliance: data is preserved with deletedAt timestamps)
 * Hard-deletes only non-financial preference data (favorites, saved searches, notification prefs)
 */
router.post("/purge-data", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { confirmPhrase } = req.body;
    const admin = (req as any).admin;
    
    if (confirmPhrase !== "PURGE_ALL_DATA") {
      return res.status(400).json({ error: 'Send { confirmPhrase: "PURGE_ALL_DATA" } to confirm' });
    }
    
    const queryRunner = AppDataSource.createQueryRunner();
    const purged: string[] = [];
    
    // Soft-delete financial entities (set deletedAt = NOW())
    const softDeleteTables = [
      "order_items", "payment_milestones", "disputes", "bids", "orders",
      "products", "services", "designers", "producers", "messages",
    ];
    
    for (const table of softDeleteTables) {
      try {
        await queryRunner.query(`UPDATE "${table}" SET "deletedAt" = NOW() WHERE "deletedAt" IS NULL`);
        purged.push(`${table} (soft-deleted)`);
      } catch (e: any) {
        // Table might not exist or not have deletedAt yet
        console.warn(`[PURGE] Could not soft-delete ${table}:`, e.message);
      }
    }
    
    // Hard-delete non-financial preference data (OK to remove)
    const hardDeleteTables = [
      "notifications", "notification_preferences",
      "favorites", "saved_searches",
      "password_reset_tokens",
    ];
    
    for (const table of hardDeleteTables) {
      try {
        await queryRunner.query(`DELETE FROM "${table}"`);
        purged.push(`${table} (hard-deleted)`);
      } catch (e: any) {
        // Table might not exist
      }
    }
    
    // Soft-delete non-admin users
    const userRepo = AppDataSource.getRepository(User);
    await userRepo.createQueryBuilder()
      .update(User)
      .set({ active: false, deletedBy: admin.id } as any)
      .where("role != :role", { role: UserRole.ADMIN })
      .andWhere("deletedAt IS NULL")
      .execute();
    
    await queryRunner.query(
      `UPDATE "users" SET "deletedAt" = NOW() WHERE "role" != 'admin' AND "deletedAt" IS NULL`
    );
    purged.push("users (non-admin, soft-deleted)");
    
    await queryRunner.release();
    
    // Audit log
    await auditService.log({
      entityType: "System",
      entityId: "purge-data",
      action: "SOFT_DELETE",
      userId: admin.id,
      reason: "Admin triggered purge-data",
      snapshot: { purgedTables: purged },
    });
    
    res.json({ success: true, message: "Data purged (soft-delete for financial records)", purgedTables: purged });
  } catch (error) {
    console.error("Error purging data:", error);
    res.status(500).json({ error: "Failed to purge data" });
  }
});

/**
 * POST /v1/admin/billing/run
 * Manually trigger the daily messaging fee billing cycle.
 * Admin-only. Useful for testing or catching up missed runs.
 */
router.post("/billing/run", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    await runBillingCycle();
    res.json({ success: true, message: "Billing cycle executed" });
  } catch (error: any) {
    console.error("Error running manual billing:", error);
    res.status(500).json({ error: "Billing cycle failed", details: error.message });
  }
});

// ============================================================================
// AUDIT LOG VIEWER
// ============================================================================

/**
 * GET /v1/admin/audit-logs
 * Browse the immutable audit log with optional filters.
 * Query: ?entityType=Order&action=CREATE&userId=...&limit=50&offset=0
 */
router.get("/audit-logs", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const entityType = req.query.entityType as string;
    const action = req.query.action as string;
    const userId = req.query.userId as string;

    const repo = AppDataSource.getRepository(AuditLog);
    let query = repo.createQueryBuilder("a");

    if (entityType) query = query.andWhere("a.entityType = :entityType", { entityType });
    if (action) query = query.andWhere("a.action = :action", { action });
    if (userId) query = query.andWhere("a.userId = :userId", { userId });

    const [logs, total] = await query
      .orderBy("a.createdAt", "DESC")
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    res.json({ success: true, logs, total });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

// ============================================================================
// MESSAGING FEE DASHBOARD
// ============================================================================

/**
 * GET /v1/admin/messaging-fees
 * Messaging fee overview: totals, unbilled amounts, per-user breakdown.
 * Query: ?status=unbilled|billed|all&limit=50&offset=0
 */
router.get("/messaging-fees", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const feeRepo = AppDataSource.getRepository(MessageFee);
    const status = req.query.status as string || "all";
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    // Summary stats
    const totalFeesResult = await feeRepo
      .createQueryBuilder("f")
      .select("COUNT(*)", "count")
      .addSelect("COALESCE(SUM(f.amount), 0)", "total")
      .getRawOne();

    const unbilledResult = await feeRepo
      .createQueryBuilder("f")
      .select("COUNT(*)", "count")
      .addSelect("COALESCE(SUM(f.amount), 0)", "total")
      .where("f.billed = false AND f.waived = false")
      .getRawOne();

    const billedResult = await feeRepo
      .createQueryBuilder("f")
      .select("COUNT(*)", "count")
      .addSelect("COALESCE(SUM(f.amount), 0)", "total")
      .where("f.billed = true")
      .getRawOne();

    const waivedResult = await feeRepo
      .createQueryBuilder("f")
      .select("COUNT(*)", "count")
      .where("f.waived = true")
      .getRawOne();

    // Fee list with optional status filter
    let listQuery = feeRepo.createQueryBuilder("f");
    if (status === "unbilled") {
      listQuery = listQuery.where("f.billed = false AND f.waived = false");
    } else if (status === "billed") {
      listQuery = listQuery.where("f.billed = true");
    } else if (status === "waived") {
      listQuery = listQuery.where("f.waived = true");
    }

    const [fees, feeCount] = await listQuery
      .orderBy("f.createdAt", "DESC")
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    res.json({
      success: true,
      summary: {
        totalFees: Number(totalFeesResult?.count || 0),
        totalAmount: Number(totalFeesResult?.total || 0),
        unbilledCount: Number(unbilledResult?.count || 0),
        unbilledAmount: Number(unbilledResult?.total || 0),
        billedCount: Number(billedResult?.count || 0),
        billedAmount: Number(billedResult?.total || 0),
        waivedCount: Number(waivedResult?.count || 0),
      },
      fees,
      total: feeCount,
    });
  } catch (error) {
    console.error("Error fetching messaging fees:", error);
    res.status(500).json({ error: "Failed to fetch messaging fees" });
  }
});

// ============================================================================
// BULLETIN BOARD MODERATION
// ============================================================================

/**
 * GET /v1/admin/bulletin-cards
 * List all bulletin cards for moderation
 */
router.get("/bulletin-cards", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const repo = AppDataSource.getRepository(BulletinCard);
    const [cards, total] = await repo
      .createQueryBuilder("c")
      .orderBy("c.createdAt", "DESC")
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    res.json({ success: true, cards, total });
  } catch (error) {
    console.error("Error fetching bulletin cards:", error);
    res.status(500).json({ error: "Failed to fetch bulletin cards" });
  }
});

/**
 * DELETE /v1/admin/bulletin-cards/:cardId
 * Admin removes an inappropriate bulletin card (sets status to REMOVED).
 */
router.delete("/bulletin-cards/:cardId", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { cardId } = req.params;
    const admin = (req as any).admin;
    const repo = AppDataSource.getRepository(BulletinCard);

    const card = await repo.findOne({ where: { id: cardId } });
    if (!card) {
      return res.status(404).json({ error: "Bulletin card not found" });
    }

    card.status = BulletinCardStatus.REMOVED;
    card.active = false;
    await repo.save(card);
    await auditService.logSoftDelete("BulletinCard", cardId, admin.id, `Admin removed bulletin card: ${card.title}`);

    res.json({ success: true, message: "Bulletin card removed" });
  } catch (error) {
    console.error("Error deleting bulletin card:", error);
    res.status(500).json({ error: "Failed to delete bulletin card" });
  }
});

// ============================================================================
// PRODUCT MODERATION
// ============================================================================

/**
 * GET /v1/admin/products
 * List all products for moderation
 */
router.get("/products", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const productRepo = AppDataSource.getRepository(Product);

    const [products, total] = await productRepo.createQueryBuilder("p")
      .leftJoinAndSelect("p.designer", "designer")
      .withDeleted()
      .orderBy("p.createdAt", "DESC")
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    res.json({
      success: true,
      products: products.map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        category: p.category,
        designerEmail: p.designer?.email,
        designerName: p.designer ? `${p.designer.firstName} ${p.designer.lastName}` : null,
        active: p.active,
        deletedAt: p.deletedAt,
        createdAt: p.createdAt,
      })),
      total,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

/**
 * DELETE /v1/admin/products/:productId
 * Admin soft-deletes an inappropriate product listing.
 */
router.delete("/products/:productId", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const admin = (req as any).admin;
    const productRepo = AppDataSource.getRepository(Product);

    const product = await productRepo.findOne({ where: { id: productId } });
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    await productRepo.softRemove(product);
    await auditService.logSoftDelete("Product", productId, admin.id, `Admin removed product: ${product.name}`);

    res.json({ success: true, message: `Product "${product.name}" removed` });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ error: "Failed to delete product" });
  }
});

// ============================================================================
// ORDER STATUS OVERRIDE
// ============================================================================

/**
 * PATCH /v1/admin/orders/:orderId/status
 * Admin forcefully updates an order status (for stuck orders, disputes, etc.)
 */
router.patch("/orders/:orderId/status", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { status, reason } = req.body;
    const admin = (req as any).admin;

    const validStatuses = Object.values(OrderStatus);
    if (!status || !validStatuses.includes(status as OrderStatus)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    if (!reason) {
      return res.status(400).json({ error: "Reason for status override is required" });
    }

    const orderRepo = AppDataSource.getRepository(Order);
    const order = await orderRepo.findOne({ where: { id: orderId } });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const oldStatus = order.status;
    order.status = status as OrderStatus;
    await orderRepo.save(order);

    await auditService.log({
      entityType: "Order",
      entityId: orderId,
      action: "STATUS_CHANGE",
      userId: admin.id,
      changes: { status: { old: oldStatus, new: status } },
      reason: `Admin override: ${reason}`,
    });

    res.json({ success: true, message: `Order status changed from ${oldStatus} to ${status}`, orderId });
  } catch (error) {
    console.error("Error overriding order status:", error);
    res.status(500).json({ error: "Failed to update order status" });
  }
});

// ============================================================================
// REPORT MANAGEMENT
// ============================================================================

/**
 * GET /v1/admin/reports
 * List all reports with optional filtering by status and category
 */
router.get("/reports", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status, category, page = "1", limit = "20" } = req.query;
    const reportRepo = AppDataSource.getRepository(Report);

    const qb = reportRepo
      .createQueryBuilder("r")
      .leftJoinAndSelect("r.reporterUser", "reporter")
      .leftJoinAndSelect("r.reportedUser", "reported")
      .orderBy("r.createdAt", "DESC");

    if (status && Object.values(ReportStatus).includes(status as ReportStatus)) {
      qb.andWhere("r.status = :status", { status });
    }
    if (category) {
      qb.andWhere("r.category = :category", { category });
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
    qb.skip((pageNum - 1) * pageSize).take(pageSize);

    const [reports, total] = await qb.getManyAndCount();

    res.json({
      reports: reports.map((r) => ({
        id: r.id,
        reporterUserId: r.reporterUserId,
        reporterEmail: r.reporterUser?.email,
        reportedUserId: r.reportedUserId,
        reportedEmail: r.reportedUser?.email,
        entityType: r.entityType,
        entityId: r.entityId,
        category: r.category,
        description: r.description,
        status: r.status,
        adminNotes: r.adminNotes,
        resolvedByUserId: r.resolvedByUserId,
        resolvedAt: r.resolvedAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      total,
      page: pageNum,
      pageSize,
    });
  } catch (error) {
    console.error("Error fetching reports:", error);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

/**
 * GET /v1/admin/reports/:reportId
 * Get a single report's full details
 */
router.get("/reports/:reportId", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;
    const reportRepo = AppDataSource.getRepository(Report);

    const report = await reportRepo.findOne({
      where: { id: reportId },
      relations: ["reporterUser", "reportedUser", "resolvedByUser"],
    });

    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }

    res.json({
      ...report,
      reporterEmail: report.reporterUser?.email,
      reportedEmail: report.reportedUser?.email,
      resolvedByEmail: report.resolvedByUser?.email,
    });
  } catch (error) {
    console.error("Error fetching report:", error);
    res.status(500).json({ error: "Failed to fetch report" });
  }
});

/**
 * PATCH /v1/admin/reports/:reportId
 * Update report status (review, resolve, dismiss) with admin notes
 */
router.patch("/reports/:reportId", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;
    const { status, adminNotes } = req.body;
    const admin = (req as any).admin;

    if (!status || !Object.values(ReportStatus).includes(status as ReportStatus)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${Object.values(ReportStatus).join(", ")}`,
      });
    }

    const reportRepo = AppDataSource.getRepository(Report);
    const report = await reportRepo.findOne({ where: { id: reportId } });
    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }

    const oldStatus = report.status;
    report.status = status as ReportStatus;

    if (adminNotes !== undefined) {
      report.adminNotes = adminNotes;
    }

    if (status === ReportStatus.RESOLVED || status === ReportStatus.DISMISSED) {
      report.resolvedByUserId = admin.id;
      report.resolvedAt = new Date();
    }

    await reportRepo.save(report);

    await auditService.log({
      entityType: "Report",
      entityId: reportId,
      action: "STATUS_CHANGE",
      userId: admin.id,
      changes: { status: { old: oldStatus, new: status } },
      reason: adminNotes || `Admin updated report status to ${status}`,
    });

    res.json({
      success: true,
      message: `Report status changed from ${oldStatus} to ${status}`,
      reportId,
    });
  } catch (error) {
    console.error("Error updating report:", error);
    res.status(500).json({ error: "Failed to update report" });
  }
});

// ============================================================================
// INVOICE MANAGEMENT
// ============================================================================

/**
 * GET /v1/admin/invoices
 * List all invoices with optional filtering
 */
router.get("/invoices", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = Math.min(parseInt(req.query.offset as string) || 0, 1000);
    const type = req.query.type as string;
    const status = req.query.status as string;
    const userId = req.query.userId as string;

    const repo = AppDataSource.getRepository(Invoice);
    let qb = repo.createQueryBuilder("inv")
      .leftJoinAndSelect("inv.user", "user")
      .orderBy("inv.createdAt", "DESC");

    if (type) qb = qb.andWhere("inv.type = :type", { type });
    if (status) qb = qb.andWhere("inv.status = :status", { status });
    if (userId) qb = qb.andWhere("inv.userId = :userId", { userId });

    const [invoices, total] = await qb
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    res.json({ invoices, total, limit, offset });
  } catch (error) {
    console.error("Error fetching invoices:", error);
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

/**
 * GET /v1/admin/invoices/:id
 * Get a single invoice with full details
 */
router.get("/invoices/:id", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(Invoice);
    const invoice = await repo.findOne({
      where: { id: req.params.id },
      relations: ["user"],
    });

    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    res.json(invoice);
  } catch (error) {
    console.error("Error fetching invoice:", error);
    res.status(500).json({ error: "Failed to fetch invoice" });
  }
});

/**
 * GET /v1/admin/invoices/stats/revenue
 * Platform revenue stats (total collected, fees, net)
 */
router.get("/invoices/stats/revenue", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(Invoice);

    const stats = await repo
      .createQueryBuilder("inv")
      .select("inv.type", "type")
      .addSelect("COUNT(*)", "count")
      .addSelect("COALESCE(SUM(inv.amount), 0)", "totalAmount")
      .addSelect("COALESCE(SUM(inv.platformFee), 0)", "totalPlatformFee")
      .addSelect("COALESCE(SUM(inv.netAmount), 0)", "totalNetAmount")
      .where("inv.status IN (:...statuses)", { statuses: ["paid", "refunded"] })
      .groupBy("inv.type")
      .getRawMany();

    const overallTotal = stats.reduce((sum: number, s: any) => sum + parseFloat(s.totalAmount || 0), 0);
    const overallFees = stats.reduce((sum: number, s: any) => sum + parseFloat(s.totalPlatformFee || 0), 0);

    res.json({
      byType: stats,
      overall: {
        totalCollected: parseFloat(overallTotal.toFixed(2)),
        totalPlatformFees: parseFloat(overallFees.toFixed(2)),
      },
    });
  } catch (error) {
    console.error("Error fetching revenue stats:", error);
    res.status(500).json({ error: "Failed to fetch revenue stats" });
  }
});

// ============================================================================
// PAYOUT MANAGEMENT
// ============================================================================

/**
 * GET /v1/admin/payouts
 * List all payouts with optional filtering
 */
router.get("/payouts", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = Math.min(parseInt(req.query.offset as string) || 0, 1000);
    const status = req.query.status as string;
    const type = req.query.type as string;
    const userId = req.query.userId as string;

    const repo = AppDataSource.getRepository(Payout);
    let qb = repo.createQueryBuilder("p")
      .leftJoinAndSelect("p.user", "user")
      .leftJoinAndSelect("p.invoice", "invoice")
      .orderBy("p.createdAt", "DESC");

    if (status) qb = qb.andWhere("p.status = :status", { status });
    if (type) qb = qb.andWhere("p.type = :type", { type });
    if (userId) qb = qb.andWhere("p.userId = :userId", { userId });

    const [payouts, total] = await qb
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    res.json({ payouts, total, limit, offset });
  } catch (error) {
    console.error("Error fetching payouts:", error);
    res.status(500).json({ error: "Failed to fetch payouts" });
  }
});

/**
 * GET /v1/admin/payouts/:id
 * Get a single payout with full details
 */
router.get("/payouts/:id", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(Payout);
    const payout = await repo.findOne({
      where: { id: req.params.id },
      relations: ["user", "invoice"],
    });

    if (!payout) return res.status(404).json({ error: "Payout not found" });

    res.json(payout);
  } catch (error) {
    console.error("Error fetching payout:", error);
    res.status(500).json({ error: "Failed to fetch payout" });
  }
});

/**
 * POST /v1/admin/payouts/:id/cancel
 * Cancel a pending/held payout
 */
router.post("/payouts/:id/cancel", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: "Cancellation reason is required" });
    }

    const payout = await payoutService.cancelPayout(req.params.id, reason, admin.id);
    res.json({ success: true, payout });
  } catch (error: any) {
    console.error("Error cancelling payout:", error);
    res.status(400).json({ error: error.message || "Failed to cancel payout" });
  }
});

/**
 * POST /v1/admin/payouts/:id/retry
 * Retry a failed payout
 */
router.post("/payouts/:id/retry", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const payout = await payoutService.retryPayout(req.params.id, admin.id);
    res.json({ success: true, payout });
  } catch (error: any) {
    console.error("Error retrying payout:", error);
    res.status(400).json({ error: error.message || "Failed to retry payout" });
  }
});

/**
 * POST /v1/admin/payouts/process
 * Manually trigger payout processing (release held payouts past hold date)
 */
router.post("/payouts/process", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await runPayoutProcessing();
    res.json({ success: true, message: "Payout processing triggered", result });
  } catch (error: any) {
    console.error("Error processing payouts:", error);
    res.status(500).json({ error: "Failed to process payouts" });
  }
});

/**
 * GET /v1/admin/payouts/stats/summary
 * Payout stats: total pending, held, completed, failed
 */
router.get("/payouts/stats/summary", verifyToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(Payout);

    const stats = await repo
      .createQueryBuilder("p")
      .select("p.status", "status")
      .addSelect("COUNT(*)", "count")
      .addSelect("COALESCE(SUM(p.netAmount), 0)", "totalNetAmount")
      .addSelect("COALESCE(SUM(p.platformFee), 0)", "totalPlatformFee")
      .groupBy("p.status")
      .getRawMany();

    res.json({ stats });
  } catch (error) {
    console.error("Error fetching payout stats:", error);
    res.status(500).json({ error: "Failed to fetch payout stats" });
  }
});

export default router;
