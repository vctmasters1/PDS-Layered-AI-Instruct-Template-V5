import { Router, Request, Response } from "express";
import { In } from "typeorm";
import Stripe from "stripe";
import AppDataSource from "../database.js";
import { User } from "../entities/user.js";
import { Order, OrderStatus } from "../entities/order.js";
import { OrderItem } from "../entities/order-item.js";
import { Product, FulfillmentType } from "../entities/product.js";
import { Producer } from "../entities/producer.js";
import { Bid, BidStatus } from "../entities/bid.js";
import { PaymentMilestone, MilestoneStatus, MilestoneType } from "../entities/payment-milestone.js";
import { SiteSettings } from "../entities/site-settings.js";
import { AuditLog } from "../entities/audit-log.js";
import { Notification, NotificationType } from "../entities/index.js";
import { notificationService } from "../services/notificationService.js";
import { invoiceService } from "../services/invoiceService.js";
import { InvoiceType } from "../entities/invoice.js";
import { verifyToken } from "./auth.js";
import { v4 as uuidv4 } from "uuid";
import stripe from "../config/stripe.js";

const router = Router();

/**
 * POST /v1/orders
 * Create a new order with optional producer selection and payment intent
 * 
 * Request Body:
 * {
 *   items: [
 *     {
 *       productId: string,
 *       quantity: number,
 *       selectedProducerId?: string  // If product allows bidding
 *     }
 *   ],
 *   shippingAddressId?: string,
 *   billingAddressId?: string,
 *   paymentMethodId?: string,  // Stripe payment method ID (NOT raw card data)
 *   idempotencyKey: string     // For preventing duplicate orders
 * }
 * 
 * Response: { order, paymentSecret, clientSecret }
 */
router.post("/", verifyToken, async (req: Request, res: Response) => {
  const transaction = AppDataSource.createQueryRunner();
  await transaction.connect();
  await transaction.startTransaction();

  try {
    const userId = (req as any).userId;
    const {
      items,
      shippingAddressId,
      billingAddressId,
      paymentMethodId,
      idempotencyKey,
    } = req.body;

    // === VALIDATION ===
    if (!items || !Array.isArray(items) || items.length === 0) {
      await transaction.rollbackTransaction();
      return res
        .status(400)
        .json({ error: "At least one item is required" });
    }

    if (!idempotencyKey) {
      await transaction.rollbackTransaction();
      return res.status(400).json({ error: "Idempotency key required" });
    }

    // === IDEMPOTENCY CHECK — return existing order if this key was already processed ===
    const existingOrder = await transaction.manager.getRepository(Order).findOne({
      where: { buyerId: userId, idempotencyKey },
    });
    if (existingOrder) {
      await transaction.rollbackTransaction();
      return res.status(200).json({
        order: existingOrder,
        message: "Duplicate request — returning existing order",
      });
    }

    if (!shippingAddressId) {
      await transaction.rollbackTransaction();
      return res
        .status(400)
        .json({ error: "Shipping address ID required" });
    }

    // === FETCH USER & VALIDATE ===
    const userRepo = transaction.manager.getRepository(User);
    const buyer = await userRepo.findOne({ where: { id: userId } });

    if (!buyer) {
      await transaction.rollbackTransaction();
      return res.status(401).json({ error: "User not found" });
    }

    // === FETCH PRODUCTS & VALIDATE ===
    const productRepo = transaction.manager.getRepository(Product);
    const productIds = items.map((i: any) => i.productId);

    // Lock product rows for the duration of this transaction to prevent concurrent
    // orders from passing the stock availability check simultaneously (TOCTOU race).
    const products = await productRepo.find({
      where: { id: In(productIds) },
      lock: { mode: "pessimistic_write" },
    });

    if (products.length !== items.length) {
      await transaction.rollbackTransaction();
      return res.status(400).json({ error: "One or more products not found" });
    }

    // === VALIDATE QUANTITIES & STOCK CONSTRAINTS ===
    for (const item of items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) {
        await transaction.rollbackTransaction();
        return res.status(400).json({ error: `Product ${item.productId} not found` });
      }

      // Check quantity doesn't exceed maxOrderQuantity
      if (item.quantity > product.maxOrderQuantity) {
        await transaction.rollbackTransaction();
        return res.status(400).json({
          error: `Product "${product.name}" has a maximum order quantity of ${product.maxOrderQuantity}. You requested ${item.quantity}.`,
          productId: product.id,
          maxOrderQuantity: product.maxOrderQuantity,
          requestedQuantity: item.quantity,
        });
      }

      // For self-fulfilled products, check available stock
      if (product.fulfilledBy === FulfillmentType.SELF) {
        const availableStock = product.stock - product.reservedStock;
        if (availableStock < item.quantity) {
          await transaction.rollbackTransaction();
          return res.status(400).json({
            error: `Product "${product.name}" only has ${availableStock} units available. You requested ${item.quantity}.`,
            productId: product.id,
            availableStock,
            requestedQuantity: item.quantity,
          });
        }
      }
    }

    // === CALCULATE TOTALS ===
    let subtotal = 0;
    const orderItems: any[] = [];

    for (const item of items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) {
        await transaction.rollbackTransaction();
        return res.status(400).json({ error: `Product ${item.productId} not found` });
      }

      const lineTotal = product.price * item.quantity;
      subtotal += lineTotal;

      orderItems.push({
        product,
        quantity: item.quantity,
        unitPrice: product.price,
        totalPrice: lineTotal,
        selectedProducerId: item.selectedProducerId || null,
      });
    }

    // === CALCULATE TAX & SHIPPING ===
    const TAX_RATE = parseFloat(process.env.TAX_RATE || "0.08");
    const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
    const FLAT_SHIPPING = parseFloat(process.env.FLAT_SHIPPING || "12.99");
    const totalAmount = subtotal + tax + FLAT_SHIPPING;

    // === CREATE ORDER RECORD ===
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const order = new Order();
    order.id = uuidv4();
    order.orderNumber = orderNumber;
    order.buyerId = userId;
    order.status = OrderStatus.PENDING;
    order.totalAmount = totalAmount;
    order.tax = tax;
    order.shippingCost = FLAT_SHIPPING;
    order.subtotal = subtotal;
    order.shippingAddressId = shippingAddressId;
    order.billingAddressId = billingAddressId || shippingAddressId;
    order.notes = `Payment Method: ${paymentMethodId ? "Card (Stripe)" : "TBD"}`;
    order.idempotencyKey = idempotencyKey;

    const savedOrder = await transaction.manager.save(order);

    // === CREATE ORDER ITEMS ===
    const orderItemRepo = transaction.manager.getRepository(OrderItem);

    for (const item of orderItems) {
      const orderItem = new OrderItem();
      orderItem.id = uuidv4();
      orderItem.orderId = savedOrder.id;
      orderItem.productId = item.product.id;
      orderItem.quantity = item.quantity;
      orderItem.unitPrice = item.product.price; // Store price at time of order
      orderItem.totalPrice = item.product.price * item.quantity;

      await transaction.manager.save(orderItem);

      // If product has a selected producer, assign them
      if (item.selectedProducerId) {
        savedOrder.producerId = item.selectedProducerId;
        await transaction.manager.save(savedOrder);
      }
    }

    // === INCREMENT RESERVED STOCK FOR SELF-FULFILLED PRODUCTS ===
    for (const item of orderItems) {
      if (item.product.fulfilledBy === FulfillmentType.SELF) {
        // Increment reservedStock to track pending orders
        item.product.reservedStock += item.quantity;
        await transaction.manager.save(item.product);
      }
    }

    // === PAYMENT MILESTONES ===
    // Milestones (40/30/30 escrow) are created when a bid is accepted (see bids.ts /:bidId/accept).
    // Each milestone is charged individually via /milestones/:milestoneId/mark-buyer-payment.

    // === AUTO-CREATE BID REQUESTS FOR PRODUCTS WITH BIDDING ===
    const producerIds: string[] = [];
    const biddableItems = orderItems.filter(item => item.product.allowBidding && !item.selectedProducerId);

    if (biddableItems.length > 0) {
      const producerRepo = transaction.manager.getRepository(Producer);
      const producers = await producerRepo.find({
        where: { active: true, verified: true },
        relations: ["user"],
      });

      const bidsToSave: Bid[] = [];
      for (const item of biddableItems) {
        for (const prod of producers) {
          const bid = new Bid();
          bid.orderId = savedOrder.id;
          bid.producerId = prod.id;
          bid.status = BidStatus.PENDING;
          bid.quotedPrice = item.product.price;
          bid.leadTimeDays = 0;
          bid.notes = `Auto-bid request for: ${item.product.name}`;
          bid.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          bidsToSave.push(bid);

          if (prod.user?.id && !producerIds.includes(prod.user.id)) {
            producerIds.push(prod.user.id);
          }
        }
      }

      if (bidsToSave.length > 0) {
        await transaction.manager.save(bidsToSave);
      }
    }

    // === COMMIT TRANSACTION ===
    await transaction.commitTransaction();

    // === AUDIT LOG: Order Created ===
    try {
      const auditRepo = AppDataSource.getRepository(AuditLog);
      await auditRepo.save(auditRepo.create({
        entityType: "Order",
        entityId: savedOrder.id,
        action: "CREATE",
        userId,
        snapshot: JSON.stringify({
          orderNumber: savedOrder.orderNumber,
          totalAmount: savedOrder.totalAmount,
          subtotal: savedOrder.subtotal,
          tax: savedOrder.tax,
          shippingCost: savedOrder.shippingCost,
          status: savedOrder.status,
          itemCount: items.length,
        }),
        ipAddress: req.ip || undefined,
      }));
    } catch (auditErr) {
      console.error("Audit log error (non-fatal):", auditErr);
    }

    // === SEND NOTIFICATIONS ===
    // Notify producers about new bidding opportunity
    for (const producerId of producerIds) {
      await notificationService.createNotification(
        producerId,
        NotificationType.BID_RECEIVED,
        "New order opportunity available",
        `New order "${orderItems[0]?.product.name || "Order"}" is available for bidding on the producer queue`,
        {
          senderId: userId,
          relatedEntityId: savedOrder.id,
          relatedEntityType: "order",
          actionUrl: `/producer-queue`,
          actionLabel: "View Order",
        }
      );
    }

    // === RESPONSE (PRODUCTION: would include Stripe clientSecret) ===
    // Create Stripe PaymentIntent for the order total
    let clientSecret: string | null = null;
    let paymentIntentId: string | null = null;

    if (paymentMethodId || buyer.stripeCustomerId) {
      try {
        // Ensure buyer has a Stripe customer ID
        let customerId = buyer.stripeCustomerId;
        if (!customerId) {
          const customer = await stripe.customers.create({
            email: buyer.email,
            name: `${buyer.firstName || ""} ${buyer.lastName || ""}`.trim(),
            metadata: { userId: buyer.id },
          });
          customerId = customer.id;
          buyer.stripeCustomerId = customerId;
          await AppDataSource.getRepository(User).save(buyer);
        }

        const piParams: Stripe.PaymentIntentCreateParams = {
          amount: Math.round(totalAmount * 100), // cents
          currency: "usd",
          customer: customerId,
          description: `PDS Marketplace Order #${savedOrder.orderNumber}`,
          metadata: {
            orderId: savedOrder.id,
            orderNumber: savedOrder.orderNumber,
            userId: buyer.id,
            source: "pds-marketplace-order",
          },
          automatic_payment_methods: { enabled: true },
        };

        // If caller provided a specific payment method, attach and confirm immediately
        if (paymentMethodId) {
          piParams.payment_method = paymentMethodId;
          piParams.confirm = true;
          piParams.automatic_payment_methods = { enabled: true, allow_redirects: "never" };
        }

        const paymentIntent = await stripe.paymentIntents.create(piParams);

        paymentIntentId = paymentIntent.id;
        clientSecret = paymentIntent.client_secret;

        // Save PI on order
        savedOrder.stripePaymentIntentId = paymentIntent.id;
        if (paymentIntent.status === "succeeded") {
          savedOrder.paymentReceived = true;
          savedOrder.status = OrderStatus.BID_ACCEPTED;
        }
        await AppDataSource.getRepository(Order).save(savedOrder);

        // Create an invoice
        await invoiceService.createChargeInvoice({
          userId: buyer.id,
          type: InvoiceType.ORDER_PAYMENT,
          amount: totalAmount,
          stripePaymentIntentId: paymentIntent.status === "succeeded" ? paymentIntent.id : undefined,
          description: `Order #${savedOrder.orderNumber}`,
          lineItems: orderItems.map((item) => ({
            description: item.product.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.totalPrice,
          })),
          sourceEntityType: "order",
          sourceEntityId: savedOrder.id,
          metadata: { orderNumber: savedOrder.orderNumber, tax, shipping: FLAT_SHIPPING },
        });
      } catch (stripeErr: any) {
        console.error("Stripe PaymentIntent for order failed:", stripeErr.message);
        // Order is still created — frontend can retry payment
      }
    }

    res.status(201).json({
      success: true,
      order: {
        id: savedOrder.id,
        orderNumber: savedOrder.orderNumber,
        status: savedOrder.status,
        totalAmount: savedOrder.totalAmount,
        subtotal: savedOrder.subtotal,
        tax: savedOrder.tax,
        shippingCost: savedOrder.shippingCost,
        itemCount: items.length,
        createdAt: savedOrder.createdAt,
      },
      clientSecret,
      paymentIntentId,
      nextStep: orderItems.some((i) => i.product.allowBidding && !i.selectedProducerId)
        ? "awaiting_bids"
        : clientSecret ? "confirm_payment" : "ready_for_payment",
      message: "Order created successfully. Proceeding to payment...",
    });
  } catch (error) {
    await transaction.rollbackTransaction();
    console.error("Order creation error:", error);
    res.status(500).json({ error: "Failed to create order" });
  } finally {
    await transaction.release();
  }
});

/**
 * POST /v1/orders/custom-project
 * Create a custom project Request for Bids (RFB)
 * Posting fee: $1 (configured via CUSTOM_BID_POSTING_FEE or defaults to 100 cents)
 * 
 * Body: { title, description, budget, requiredCapabilities[], deadline? }
 */
router.post("/custom-project", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { title, description, budget, requiredCapabilities, deadline } = req.body;

    if (!title || !description || !budget) {
      return res.status(400).json({ error: "Title, description, and budget are required" });
    }

    const userRepo = AppDataSource.getRepository(User);
    const orderRepo = AppDataSource.getRepository(Order);
    const buyer = await userRepo.findOne({ where: { id: userId } });
    if (!buyer) return res.status(401).json({ error: "User not found" });

    // Check if posting fees are waived for this user
    const feeWaived = !!buyer.postingFeesWaived;

    // Generate order number
    const orderCount = await orderRepo.count();
    const orderNumber = `RFB-${new Date().getFullYear()}-${String(orderCount + 1).padStart(5, "0")}`;

    const order = orderRepo.create({
      id: uuidv4(),
      orderNumber,
      buyerId: userId,
      status: OrderStatus.PENDING,
      totalAmount: parseFloat(budget),
      subtotal: parseFloat(budget),
      tax: 0,
      shippingCost: 0,
      notes: JSON.stringify({
        type: "custom_project",
        title,
        description,
        requiredCapabilities: requiredCapabilities || [],
        deadline: deadline || null,
        postingFee: feeWaived ? 0 : 1.00,
        postingFeeWaived: feeWaived,
      }),
    });

    await orderRepo.save(order);

    res.status(201).json({
      success: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        title,
        description,
        budget: order.totalAmount,
        status: order.status,
        createdAt: order.createdAt,
      },
    });
  } catch (error) {
    console.error("Custom project creation error:", error);
    res.status(500).json({ error: "Failed to create custom project" });
  }
});

/**
 * GET /v1/orders/custom-projects
 * List all custom project RFBs (public, for producers to browse)
 */
router.get("/custom-projects", verifyToken, async (req: Request, res: Response) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    const orderRepo = AppDataSource.getRepository(Order);

    const [orders, total] = await orderRepo.createQueryBuilder("order")
      .where("order.status = :status", { status: OrderStatus.PENDING })
      .andWhere("order.notes LIKE :type", { type: "%custom_project%" })
      .orderBy("order.createdAt", "DESC")
      .take(Number(limit))
      .skip(Number(offset))
      .getManyAndCount();

    res.json({
      success: true,
      projects: orders.map(o => {
        let meta: any = {};
        try { meta = JSON.parse(o.notes || "{}"); } catch {}
        return {
          id: o.id,
          orderNumber: o.orderNumber,
          title: meta.title || "Custom Project",
          description: meta.description || "",
          budget: o.totalAmount,
          requiredCapabilities: meta.requiredCapabilities || [],
          deadline: meta.deadline || null,
          status: o.status,
          createdAt: o.createdAt,
        };
      }),
      total,
      pagination: { limit: Number(limit), offset: Number(offset), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (error) {
    console.error("Get custom projects error:", error);
    res.status(500).json({ error: "Failed to fetch custom projects" });
  }
});

/**
 * GET /v1/orders/my-rfbs
 * List current user's custom project RFBs
 */
router.get("/my-rfbs", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const orderRepo = AppDataSource.getRepository(Order);

    const orders = await orderRepo.createQueryBuilder("order")
      .where("order.buyerId = :userId", { userId })
      .andWhere("order.notes LIKE :type", { type: "%custom_project%" })
      .orderBy("order.createdAt", "DESC")
      .getMany();

    res.json({
      success: true,
      projects: orders.map(o => {
        let meta: any = {};
        try { meta = JSON.parse(o.notes || "{}"); } catch {}
        return {
          id: o.id,
          orderNumber: o.orderNumber,
          title: meta.title || "Custom Project",
          description: meta.description || "",
          budget: o.totalAmount,
          requiredCapabilities: meta.requiredCapabilities || [],
          deadline: meta.deadline || null,
          status: o.status,
          createdAt: o.createdAt,
        };
      }),
    });
  } catch (error) {
    console.error("Get my RFBs error:", error);
    res.status(500).json({ error: "Failed to fetch your projects" });
  }
});

/**
 * GET /v1/orders/sales
 * List orders where the authenticated user is the seller (designer or producer).
 * Returns orders with buyer info, items, amounts, and dates.
 */
router.get("/sales", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const orderRepo = AppDataSource.getRepository(Order);
    const orderItemRepo = AppDataSource.getRepository(OrderItem);

    // Find the user's designer and producer profile IDs
    const designerRepo = AppDataSource.getRepository(
      (await import("../entities/designer.js")).Designer
    );
    const producerRepo = AppDataSource.getRepository(
      (await import("../entities/producer.js")).Producer
    );

    const designerProfile = await designerRepo.findOne({
      where: { user: { id: userId } },
    });
    const producerProfile = await producerRepo.findOne({
      where: { user: { id: userId } },
    });

    // Build where conditions: orders where user is the designer or producer
    const whereConditions: any[] = [];
    if (designerProfile) {
      whereConditions.push({ designerId: designerProfile.id });
    }
    if (producerProfile) {
      whereConditions.push({ producerId: producerProfile.id });
    }

    if (whereConditions.length === 0) {
      return res.json({ success: true, count: 0, sales: [] });
    }

    const orders = await orderRepo.find({
      where: whereConditions,
      relations: ["buyer"],
      order: { createdAt: "DESC" },
    });

    // Fetch items for each order
    const salesWithItems = await Promise.all(
      orders.map(async (order) => {
        const items = await orderItemRepo.find({
          where: { orderId: order.id },
          relations: ["product"],
        });

        return {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          totalAmount: order.totalAmount,
          subtotal: order.subtotal,
          tax: order.tax,
          shippingCost: order.shippingCost,
          paymentReceived: order.paymentReceived,
          buyer: order.buyer
            ? {
                id: order.buyer.id,
                name: `${order.buyer.firstName || ""} ${order.buyer.lastName || ""}`.trim() || "Unknown",
                email: order.buyer.email,
              }
            : { id: null, name: "Deleted User", email: "" },
          items: items.map((i) => ({
            productName: i.product?.name || "Unknown Product",
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            totalPrice: i.totalPrice,
          })),
          notes: order.notes,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        };
      })
    );

    res.json({
      success: true,
      count: salesWithItems.length,
      sales: salesWithItems,
    });
  } catch (error) {
    console.error("Get sales history error:", error);
    res.status(500).json({ error: "Failed to fetch sales history" });
  }
});

/**
 * GET /v1/orders
 * List all orders for authenticated user (buyer or designer view)
 */
router.get("/", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const userRepo = AppDataSource.getRepository(User);
    const orderRepo = AppDataSource.getRepository(Order);

    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    // Buyer view: show their orders
    const orders = await orderRepo.find({
      where: { buyerId: userId },
      relations: ["buyer"],
      order: { createdAt: "DESC" },
    });

    res.json({
      success: true,
      count: orders.length,
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        totalAmount: o.totalAmount,
        itemCount: 0, // Would aggregate from OrderItems
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Get orders error:", error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

/**
 * GET /v1/orders/:orderId
 * Get detailed order information with items, milestones, and bids
 */
router.get("/:orderId", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { orderId } = req.params;

    const orderRepo = AppDataSource.getRepository(Order);
    const order = await orderRepo.findOne({
      where: { id: orderId },
      relations: ["buyer", "designer", "producer"],
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Authorization: only buyer, designer, or producer can view
    if (
      order.buyerId !== userId &&
      order.designerId !== userId &&
      order.producerId !== userId
    ) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const orderItemRepo = AppDataSource.getRepository(OrderItem);
    const items = await orderItemRepo.find({
      where: { orderId },
      relations: ["product"],
    });

    res.json({
      success: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        totalAmount: order.totalAmount,
        subtotal: order.subtotal,
        tax: order.tax,
        shippingCost: order.shippingCost,
        items: items.map((i) => ({
          productId: i.productId,
          productName: i.product?.name || "Unknown",
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          totalPrice: i.totalPrice,
        })),
        buyer: {
          id: order.buyer.id,
          email: order.buyer.email,
          name: `${order.buyer.firstName} ${order.buyer.lastName}`,
        },
        shippingAddressId: order.shippingAddressId,
        billingAddressId: order.billingAddressId,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      },
    });
  } catch (error) {
    console.error("Get order details error:", error);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

export default router;
