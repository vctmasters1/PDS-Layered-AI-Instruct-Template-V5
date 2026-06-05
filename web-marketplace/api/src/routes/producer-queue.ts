import { Router, Request, Response } from "express";
import AppDataSource from "../database.js";
import { Order, OrderStatus } from "../entities/order.js";
import { OrderItem } from "../entities/order-item.js";
import { Bid, BidStatus } from "../entities/bid.js";
import { Product, FulfillmentType } from "../entities/product.js";
import { Producer } from "../entities/producer.js";
import { User } from "../entities/user.js";
import { verifyToken } from "./auth.js";

const router = Router();

// ============================================================================
// PRODUCER QUEUE ENDPOINTS - Producers browse and bid on available orders
// ============================================================================

/**
 * GET /producer-queue/available
 * List orders available for the authenticated producer to bid on
 * Filters by: producer's capabilities, location, and order requirements
 */
router.get("/available", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    // Get logged-in user and verify they're a producer
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId } });

    if (!user || user.role !== "producer") {
      return res
        .status(403)
        .json({ error: "Producer access required" });
    }

    // Get producer profile
    const producerRepo = AppDataSource.getRepository(Producer);
    const producer = await producerRepo.findOne({
      where: { user: { id: userId } },
    });

    if (!producer) {
      return res
        .status(404)
        .json({ error: "Producer profile not found" });
    }

    // Find all pending bids for this producer
    const bidRepo = AppDataSource.getRepository(Bid);
    const pendingBids = await bidRepo.find({
      where: {
        producerId: producer.id,
        status: BidStatus.PENDING,
      },
      relations: ["order", "order.items", "order.items.product"],
    });

    // Find orders with PENDING status where this producer is in selectedProducerIds
    const orderRepo = AppDataSource.getRepository(Order);
    const pendingOrders = await orderRepo.find({
      where: {
        status: OrderStatus.PENDING,
      },
      relations: ["items", "items.product", "buyer"],
    });

    // Filter orders that target this producer
    const availableOrders = pendingOrders.filter((order) => {
      return order.items.some((item) => {
        const product = item.product;
        return (
          product?.selectedProducerIds &&
          product.selectedProducerIds.includes(producer.id)
        );
      });
    });

    // Build response with queue items
    const queueItems = availableOrders.map((order) => {
      // Get items relevant to this producer's capabilities
      const relevantItems = order.items.filter((item) => {
        const product = item.product;
        return (
          product?.selectedProducerIds &&
          product.selectedProducerIds.includes(producer.id)
        );
      });

      // Calculate total quantity for all relevant items
      const totalQuantity = relevantItems.reduce(
        (sum, item) => sum + item.quantity,
        0
      );

      // Get stock constraints
      const constraints = relevantItems.map((item) => ({
        productId: item.productId,
        productName: item.product?.name || "Unknown",
        quantity: item.quantity,
        maxOrderQuantity: item.product?.maxOrderQuantity || 100,
        fulfilledBy: item.product?.fulfilledBy,
        availableStock:
          item.product?.stock - item.product?.reservedStock || null,
      }));

      // Check if any bid already exists
      const existingBid = pendingBids.find((b) => b.orderId === order.id);

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        buyerName: order.buyer?.email || "Unknown",
        status: order.status,
        totalQuantity,
        constraints,
        createdAt: order.createdAt,
        existingBidId: existingBid?.id || null,
        existingBidStatus: existingBid?.status || null,
        orderTotal: order.totalAmount,
      };
    });

    res.json({
      availableCount: availableOrders.length,
      items: queueItems,
    });
  } catch (error) {
    console.error("Get available orders error:", error);
    res.status(500).json({ error: "Failed to fetch available orders" });
  }
});

/**
 * POST /producer-queue/submit-bid
 * Producer submits a bid quote for an order
 * Either updates pending bid or creates new bid if producer wasn't initially targeted
 */
router.post("/submit-bid", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { orderId, quotedPrice, leadTimeDays, productionDetails, notes } =
      req.body;

    // Validate input
    if (!orderId || !quotedPrice || !leadTimeDays) {
      return res
        .status(400)
        .json({
          error: "Missing required fields: orderId, quotedPrice, leadTimeDays",
        });
    }

    if (quotedPrice <= 0 || leadTimeDays <= 0) {
      return res
        .status(400)
        .json({ error: "Price and lead time must be positive" });
    }

    // Get logged-in user and verify they're a producer
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId } });

    if (!user || user.role !== "producer") {
      return res
        .status(403)
        .json({ error: "Producer access required" });
    }

    // Get producer profile
    const producerRepo = AppDataSource.getRepository(Producer);
    const producer = await producerRepo.findOne({
      where: { user: { id: userId } },
    });

    if (!producer) {
      return res
        .status(404)
        .json({ error: "Producer profile not found" });
    }

    // Get order with items
    const orderRepo = AppDataSource.getRepository(Order);
    const order = await orderRepo.findOne({
      where: { id: orderId },
      relations: ["items", "items.product"],
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Verify order is still in PENDING status
    if (order.status !== OrderStatus.PENDING) {
      return res
        .status(400)
        .json({ error: "Order is no longer pending bids" });
    }

    // Check if producer is eligible for this order
    const isEligible = order.items.some((item) => {
      const product = item.product;
      return (
        product?.selectedProducerIds &&
        product.selectedProducerIds.includes(producer.id)
      );
    });

    if (!isEligible) {
      return res
        .status(403)
        .json({
          error: "You are not eligible to bid on this order (not in producers list)",
        });
    }

    // Check if bid already exists
    const bidRepo = AppDataSource.getRepository(Bid);
    let bid = await bidRepo.findOne({
      where: {
        orderId: order.id,
        producerId: producer.id,
      },
    });

    if (bid) {
      // Update existing bid if it's still pending
      if (bid.status !== BidStatus.PENDING && bid.status !== BidStatus.WITHDRAWN) {
        return res
          .status(400)
          .json({
            error: `Cannot update bid with status: ${bid.status}`,
          });
      }

      bid.quotedPrice = quotedPrice;
      bid.leadTimeDays = leadTimeDays;
      bid.productionDetails = productionDetails || null;
      bid.notes = notes || null;
      bid.status = BidStatus.PENDING;
      bid.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days expiry
    } else {
      // Create new bid if producer wasn't initially targeted
      bid = bidRepo.create({
        orderId: order.id,
        producerId: producer.id,
        quotedPrice,
        leadTimeDays,
        productionDetails: productionDetails || null,
        notes: notes || null,
        status: BidStatus.PENDING,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        selected: false,
      });
    }

    await bidRepo.save(bid);

    res.json({
      success: true,
      bidId: bid.id,
      message: "Bid submitted successfully",
      bid: {
        id: bid.id,
        orderId: bid.orderId,
        quotedPrice: bid.quotedPrice,
        leadTimeDays: bid.leadTimeDays,
        status: bid.status,
        expiresAt: bid.expiresAt,
      },
    });
  } catch (error) {
    console.error("Submit bid error:", error);
    res.status(500).json({ error: "Failed to submit bid" });
  }
});

/**
 * GET /producer-queue/my-bids
 * Get all bids submitted by the authenticated producer
 * Supports filtering by status
 */
router.get("/my-bids", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { status } = req.query;

    // Get logged-in user and verify they're a producer
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId } });

    if (!user || user.role !== "producer") {
      return res
        .status(403)
        .json({ error: "Producer access required" });
    }

    // Get producer profile
    const producerRepo = AppDataSource.getRepository(Producer);
    const producer = await producerRepo.findOne({
      where: { user: { id: userId } },
    });

    if (!producer) {
      return res
        .status(404)
        .json({ error: "Producer profile not found" });
    }

    // Build query
    const bidRepo = AppDataSource.getRepository(Bid);
    const query = bidRepo
      .createQueryBuilder("bid")
      .where("bid.producerId = :producerId", {
        producerId: producer.id,
      })
      .leftJoinAndSelect("bid.order", "order")
      .leftJoinAndSelect("order.items", "items")
      .leftJoinAndSelect("items.product", "product")
      .leftJoinAndSelect("order.buyer", "buyer");

    // Filter by status if provided
    if (status) {
      const statusArray = (status as string).split(",");
      query.andWhere("bid.status IN (:...statuses)", { statuses: statusArray });
    }

    // Default: show all pending, accepted, in-production, and ready-to-ship bids
    // (hide old completed/cancelled bids by default)
    if (!status) {
      query.andWhere("bid.status IN (:...defaultStatuses)", {
        defaultStatuses: [
          BidStatus.PENDING,
          BidStatus.ACCEPTED,
          BidStatus.IN_PRODUCTION,
          BidStatus.READY_TO_SHIP,
          BidStatus.SHIPPED,
          BidStatus.DELIVERED,
        ],
      });
    }

    query.orderBy("bid.createdAt", "DESC");

    const bids = await query.getMany();

    // Transform response
    const bidsList = bids.map((bid) => ({
      bidId: bid.id,
      orderId: bid.orderId,
      orderNumber: bid.order?.orderNumber,
      status: bid.status,
      quotedPrice: bid.quotedPrice,
      leadTimeDays: bid.leadTimeDays,
      productionDetails: bid.productionDetails,
      notes: bid.notes,
      expiresAt: bid.expiresAt,
      acceptedAt: bid.acceptedAt,
      totalItems: bid.order?.items?.length || 0,
      totalQuantity: bid.order?.items?.reduce(
        (sum, item) => sum + item.quantity,
        0
      ) || 0,
      buyerEmail: bid.order?.buyer?.email,
      createdAt: bid.createdAt,
      updatedAt: bid.updatedAt,
    }));

    res.json({
      totalBids: bidsList.length,
      bids: bidsList,
    });
  } catch (error) {
    console.error("Get my bids error:", error);
    res.status(500).json({ error: "Failed to fetch your bids" });
  }
});

/**
 * PATCH /producer-queue/:bidId/withdraw
 * Producer withdraws their bid (only if still PENDING)
 */
router.patch(
  "/:bidId/withdraw",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { bidId } = req.params;

      // Get logged-in user and verify they're a producer
      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({ where: { id: userId } });

      if (!user || user.role !== "producer") {
        return res
          .status(403)
          .json({ error: "Producer access required" });
      }

      // Get producer profile
      const producerRepo = AppDataSource.getRepository(Producer);
      const producer = await producerRepo.findOne({
        where: { user: { id: userId } },
      });

      if (!producer) {
        return res
          .status(404)
          .json({ error: "Producer profile not found" });
      }

      // Get bid
      const bidRepo = AppDataSource.getRepository(Bid);
      const bid = await bidRepo.findOne({ where: { id: bidId } });

      if (!bid) {
        return res.status(404).json({ error: "Bid not found" });
      }

      // Verify ownership
      if (bid.producerId !== producer.id) {
        return res
          .status(403)
          .json({ error: "You can only withdraw your own bids" });
      }

      // Only allow withdrawal of pending bids
      if (bid.status !== BidStatus.PENDING) {
        return res
          .status(400)
          .json({
            error: `Cannot withdraw bid with status: ${bid.status}`,
          });
      }

      bid.status = BidStatus.WITHDRAWN;
      await bidRepo.save(bid);

      res.json({
        success: true,
        message: "Bid withdrawn successfully",
        bid: {
          id: bid.id,
          status: bid.status,
        },
      });
    } catch (error) {
      console.error("Withdraw bid error:", error);
      res.status(500).json({ error: "Failed to withdraw bid" });
    }
  }
);

/**
 * GET /producer-queue/stats
 * Get producer statistics (acceptance rate, total bids, active orders, etc.)
 */
router.get("/stats", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    // Get logged-in user and verify they're a producer
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId } });

    if (!user || user.role !== "producer") {
      return res
        .status(403)
        .json({ error: "Producer access required" });
    }

    // Get producer profile
    const producerRepo = AppDataSource.getRepository(Producer);
    const producer = await producerRepo.findOne({
      where: { user: { id: userId } },
    });

    if (!producer) {
      return res
        .status(404)
        .json({ error: "Producer profile not found" });
    }

    // Get bids statistics
    const bidRepo = AppDataSource.getRepository(Bid);

    const totalBids = await bidRepo.count({
      where: { producerId: producer.id },
    });

    const acceptedBids = await bidRepo.count({
      where: {
        producerId: producer.id,
        status: BidStatus.ACCEPTED,
      },
    });

    const pendingBids = await bidRepo.count({
      where: {
        producerId: producer.id,
        status: BidStatus.PENDING,
      },
    });

    const activeBids = await bidRepo.count({
      where: {
        producerId: producer.id,
        status: BidStatus.IN_PRODUCTION,
      },
    });

    const completedBids = await bidRepo.count({
      where: {
        producerId: producer.id,
        status: BidStatus.COMPLETED,
      },
    });

    const acceptanceRate =
      totalBids > 0 ? Math.round((acceptedBids / totalBids) * 100) : 0;

    res.json({
      stats: {
        totalBids,
        pendingBids,
        acceptedBids,
        activeBids,
        completedBids,
        acceptanceRate: `${acceptanceRate}%`,
        averageLeadTime: producer.averageLeadTime || 0,
        totalOrdersFulfilled: producer.totalOrdersFulfilled || 0,
        rating: producer.rating || 0,
        verified: producer.verified,
      },
    });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ error: "Failed to fetch producer stats" });
  }
});

export default router;
