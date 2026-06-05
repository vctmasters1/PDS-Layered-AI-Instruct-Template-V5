import express, { Request, Response } from "express";
import { MoreThan } from "typeorm";
import Stripe from "stripe";
import AppDataSource from "../database";
import { Product, FulfillmentType } from "../entities/product";
import { User } from "../entities/user";
import { verifyToken } from "./auth.js";
import { v4 as uuidv4 } from "uuid";
import stripe from "../config/stripe.js";
import { invoiceService } from "../services/invoiceService.js";
import { InvoiceType } from "../entities/invoice.js";

const router = express.Router();

// Listing limits for spam prevention
const MAX_LISTINGS_PER_DAY = 25;
const MAX_ACTIVE_LISTINGS = 50;

/**
 * POST /v1/products - Create a new product (Designer only)
 * 
 * Request body:
 * {
 *   name: string,
 *   description: string,
 *   category: string,
 *   price: number,
 *   sku: string,
 *   leadTime: number (days),
 *   images: string[] (URLs),
 *   fulfilledBy: "self" | "producer",
 *   manufacturingRequirements?: string,
 *   stock?: number (for self-fulfilled),
 *   maxOrderQuantity?: number (limit per order, default 100),
 *   producerIds?: string[] (producers to route bids to)
 * }
 */
router.post("/", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const {
      name,
      description,
      category,
      price,
      sku,
      leadTime,
      images,
      fulfilledBy,
      manufacturingRequirements,
      stock,
      maxOrderQuantity,
      producerIds,
      productWidth,
      productHeight,
      productDepth,
      productWeight,
      shippingWidth,
      shippingHeight,
      shippingDepth,
      shippingWeight,
      paymentMethodId,
    } = req.body;

    // Validation
    if (!name || !description || !category || price === undefined || !sku) {
      return res.status(400).json({
        error: "Missing required fields: name, description, category, price, sku",
      });
    }

    if (price < 0) {
      return res.status(400).json({ error: "Price cannot be negative" });
    }

    if (!["self", "producer"].includes(fulfilledBy)) {
      return res.status(400).json({
        error: 'fulfilledBy must be "self" or "producer"',
      });
    }

    const productRepository = AppDataSource.getRepository(Product);
    const userRepo = AppDataSource.getRepository(User);
    
    // Check if account is suspended
    const creator = await userRepo.findOne({ where: { id: userId } });
    if (creator && creator.suspendedUntil && new Date(creator.suspendedUntil) > new Date()) {
      return res.status(403).json({ error: "Your account is suspended. Cannot create listings." });
    }

    // --- Spam Prevention: Listing Limits ---
    // Check active listings count (max 100)
    const activeListings = await productRepository.count({
      where: { designerId: userId, active: true },
    });
    if (activeListings >= MAX_ACTIVE_LISTINGS) {
      return res.status(429).json({
        error: `Maximum active listings limit reached (${MAX_ACTIVE_LISTINGS}). Please deactivate or remove existing listings first.`,
        activeListings,
        limit: MAX_ACTIVE_LISTINGS,
      });
    }
    
    // Check listings created today (max 25/day)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayListings = await productRepository.count({
      where: { designerId: userId, createdAt: MoreThan(todayStart) },
    });
    if (todayListings >= MAX_LISTINGS_PER_DAY) {
      return res.status(429).json({
        error: `Daily listing limit reached (${MAX_LISTINGS_PER_DAY}/day). Try again tomorrow.`,
        todayListings,
        limit: MAX_LISTINGS_PER_DAY,
      });
    }

    // Check SKU uniqueness (now enforced globally by unique constraint,
    // but provide a user-friendly error before hitting DB)
    const existingSku = await productRepository.findOne({
      where: { sku },
    });

    if (existingSku) {
      return res.status(400).json({
        error: "This SKU already exists. Please use a unique SKU.",
      });
    }

    // --- Listing Fee: Charge $1.00 via Stripe ---
    // Save product first (inactive), then charge, then activate.
    // This prevents orphaned Stripe charges if the DB save fails.
    const feeWaived = !!creator?.postingFeesWaived;
    let paymentIntent: Stripe.PaymentIntent | null = null;

    if (!feeWaived) {
      if (!paymentMethodId) {
        return res.status(400).json({ error: "Payment method is required for the listing fee." });
      }
      if (!creator?.stripeCustomerId) {
        return res.status(400).json({ error: "No payment method on file. Please update your account." });
      }
    }

    // Create product (inactive until fee is confirmed)
    const product = new Product();
    product.id = uuidv4();
    product.designerId = userId;
    product.name = name;
    product.description = description;
    product.category = category;
    product.price = parseFloat(price);
    product.sku = sku;
    product.leadTime = parseInt(leadTime) || 0;
    product.images = images || [];
    product.fulfilledBy = fulfilledBy as FulfillmentType;
    product.manufacturingRequirements = manufacturingRequirements || null;
    product.stock = fulfilledBy === "self" ? parseInt(stock) || 0 : 0;
    product.reservedStock = 0;
    product.maxOrderQuantity = Math.max(1, parseInt(maxOrderQuantity) || 100);
    product.active = feeWaived; // Only active immediately if fee is waived

    // JSON field for selected producers (for routing bids)
    product.selectedProducerIds = producerIds || [];

    // Product dimensions & weight
    if (productWidth !== undefined) product.productWidth = parseFloat(productWidth) || null;
    if (productHeight !== undefined) product.productHeight = parseFloat(productHeight) || null;
    if (productDepth !== undefined) product.productDepth = parseFloat(productDepth) || null;
    if (productWeight !== undefined) product.productWeight = parseFloat(productWeight) || null;
    // Shipping dimensions & weight
    if (shippingWidth !== undefined) product.shippingWidth = parseFloat(shippingWidth) || null;
    if (shippingHeight !== undefined) product.shippingHeight = parseFloat(shippingHeight) || null;
    if (shippingDepth !== undefined) product.shippingDepth = parseFloat(shippingDepth) || null;
    if (shippingWeight !== undefined) product.shippingWeight = parseFloat(shippingWeight) || null;

    await productRepository.save(product);

    // Now charge the listing fee (product saved, safe to charge)
    if (!feeWaived) {
      try {
        paymentIntent = await stripe.paymentIntents.create({
          amount: 100, // $1.00 in cents
          currency: "usd",
          customer: creator!.stripeCustomerId!,
          payment_method: paymentMethodId,
          confirm: true,
          description: "Product listing fee",
          metadata: {
            type: "listing_fee",
            userId,
            productId: product.id,
          },
          automatic_payment_methods: {
            enabled: true,
            allow_redirects: "never",
          },
        });

        // Charge succeeded — activate the product
        product.active = true;
        await productRepository.save(product);
      } catch (stripeError: any) {
        // Charge failed — remove the draft product
        await productRepository.remove(product);
        console.error("Listing fee payment failed:", stripeError);
        return res.status(402).json({
          error: "Listing fee payment failed",
          details: stripeError.message,
        });
      }
    }

    // Create invoice for listing fee (skip if waived)
    if (!feeWaived && paymentIntent) {
      try {
        await invoiceService.createChargeInvoice({
          userId,
          type: InvoiceType.LISTING_FEE,
          amount: 1.0,
          stripePaymentIntentId: paymentIntent.id,
          description: "Product listing fee",
          lineItems: [{ description: "Product listing fee", quantity: 1, unitPrice: 1.0, total: 1.0 }],
          sourceEntityType: "product",
          sourceEntityId: product.id,
          metadata: { productName: product.name, productSku: product.sku },
        });
      } catch (invoiceErr) {
        console.error("Listing fee invoice creation failed (non-fatal):", invoiceErr);
      }
    }

    res.status(201).json({
      success: true,
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        price: product.price,
        category: product.category,
        fulfilledBy: product.fulfilledBy,
        active: product.active,
        createdAt: product.createdAt,
      },
    });
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({ error: "Failed to create product" });
  }
});

/**
 * GET /v1/products - List designer's products
 * Query parameters:
 *   ?active=true|false (filter by active status)
 *   ?category=string (filter by category)
 */
router.get("/", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { active, category } = req.query;

    const productRepository = AppDataSource.getRepository(Product);

    let query = productRepository
      .createQueryBuilder("product")
      .where("product.designerId = :designerId", { designerId: userId });

    if (active !== undefined) {
      query = query.andWhere("product.active = :active", {
        active: active === "true",
      });
    }

    if (category) {
      query = query.andWhere("product.category = :category", { category });
    }

    const products = await query
      .orderBy("product.createdAt", "DESC")
      .getMany();

    res.json({
      success: true,
      count: products.length,
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category,
        price: p.price,
        description: p.description,
        leadTime: p.leadTime,
        images: p.images,
        fulfilledBy: p.fulfilledBy,
        manufacturingRequirements: p.manufacturingRequirements,
        stock: p.stock,
        active: p.active,
        selectedProducerIds: p.selectedProducerIds || [],
        productWidth: p.productWidth,
        productHeight: p.productHeight,
        productDepth: p.productDepth,
        productWeight: p.productWeight,
        shippingWidth: p.shippingWidth,
        shippingHeight: p.shippingHeight,
        shippingDepth: p.shippingDepth,
        shippingWeight: p.shippingWeight,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

/**
 * GET /v1/products/:productId - Get single product details
 */
router.get("/:productId", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { productId } = req.params;

    const productRepository = AppDataSource.getRepository(Product);

    const product = await productRepository.findOne({
      where: { id: productId, designerId: userId },
    });

    if (!product) {
      return res
        .status(404)
        .json({ error: "Product not found or unauthorized" });
    }

    res.json({
      success: true,
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        category: product.category,
        price: product.price,
        description: product.description,
        leadTime: product.leadTime,
        images: product.images,
        fulfilledBy: product.fulfilledBy,
        manufacturingRequirements: product.manufacturingRequirements,
        stock: product.stock,
        active: product.active,
        selectedProducerIds: product.selectedProducerIds || [],
        productWidth: product.productWidth,
        productHeight: product.productHeight,
        productDepth: product.productDepth,
        productWeight: product.productWeight,
        shippingWidth: product.shippingWidth,
        shippingHeight: product.shippingHeight,
        shippingDepth: product.shippingDepth,
        shippingWeight: product.shippingWeight,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

/**
 * PUT /v1/products/:productId - Update product
 *
 * Request body: Same as POST (all fields optional except verification)
 */
router.put("/:productId", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { productId } = req.params;
    const updates = req.body;

    const productRepository = AppDataSource.getRepository(Product);

    // Find product and verify ownership
    const product = await productRepository.findOne({
      where: { id: productId, designerId: userId },
    });

    if (!product) {
      return res
        .status(404)
        .json({ error: "Product not found or unauthorized" });
    }

    // Validate and update fields
    if (updates.name !== undefined) product.name = updates.name;
    if (updates.description !== undefined)
      product.description = updates.description;
    if (updates.category !== undefined) product.category = updates.category;
    if (updates.price !== undefined) {
      if (updates.price < 0) {
        return res.status(400).json({ error: "Price cannot be negative" });
      }
      product.price = parseFloat(updates.price);
    }
    if (updates.sku !== undefined) {
      // Check SKU uniqueness (excluding current product)
      const existingSku = await productRepository.findOne({
        where: {
          sku: updates.sku,
          designerId: userId,
          id: productId,
        },
      });
      if (
        existingSku &&
        existingSku.id !== productId
      ) {
        return res.status(400).json({
          error: "This SKU already exists for your other products",
        });
      }
      product.sku = updates.sku;
    }
    if (updates.leadTime !== undefined)
      product.leadTime = parseInt(updates.leadTime);
    if (updates.images !== undefined) product.images = updates.images;
    if (updates.fulfilledBy !== undefined) {
      if (!["self", "producer"].includes(updates.fulfilledBy)) {
        return res.status(400).json({
          error: 'fulfilledBy must be "self" or "producer"',
        });
      }
      product.fulfilledBy = updates.fulfilledBy;
    }
    if (updates.manufacturingRequirements !== undefined)
      product.manufacturingRequirements = updates.manufacturingRequirements;
    if (updates.stock !== undefined && product.fulfilledBy === "self")
      product.stock = parseInt(updates.stock);
    if (updates.maxOrderQuantity !== undefined)
      product.maxOrderQuantity = Math.max(1, parseInt(updates.maxOrderQuantity));
    if (updates.active !== undefined) product.active = updates.active;
    if (updates.selectedProducerIds !== undefined)
      product.selectedProducerIds = updates.selectedProducerIds;
    // Product dimensions & weight
    if (updates.productWidth !== undefined) product.productWidth = parseFloat(updates.productWidth) || null;
    if (updates.productHeight !== undefined) product.productHeight = parseFloat(updates.productHeight) || null;
    if (updates.productDepth !== undefined) product.productDepth = parseFloat(updates.productDepth) || null;
    if (updates.productWeight !== undefined) product.productWeight = parseFloat(updates.productWeight) || null;
    // Shipping dimensions & weight
    if (updates.shippingWidth !== undefined) product.shippingWidth = parseFloat(updates.shippingWidth) || null;
    if (updates.shippingHeight !== undefined) product.shippingHeight = parseFloat(updates.shippingHeight) || null;
    if (updates.shippingDepth !== undefined) product.shippingDepth = parseFloat(updates.shippingDepth) || null;
    if (updates.shippingWeight !== undefined) product.shippingWeight = parseFloat(updates.shippingWeight) || null;

    await productRepository.save(product);

    res.json({
      success: true,
      message: "Product updated successfully",
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        price: product.price,
        category: product.category,
        fulfilledBy: product.fulfilledBy,
        active: product.active,
        selectedProducerIds: product.selectedProducerIds || [],
        updatedAt: product.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ error: "Failed to update product" });
  }
});

/**
 * DELETE /v1/products/:productId - Soft-delete product (GAAP: preserves record)
 */
router.delete(
  "/:productId",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { productId } = req.params;

      const productRepository = AppDataSource.getRepository(Product);

      // Find product and verify ownership
      const product = await productRepository.findOne({
        where: { id: productId, designerId: userId },
      });

      if (!product) {
        return res
          .status(404)
          .json({ error: "Product not found or unauthorized" });
      }

      // Soft-delete: deactivate and set deletedAt
      product.active = false;
      await productRepository.softRemove(product);

      res.json({
        success: true,
        message: "Product archived successfully (data preserved for GAAP compliance)",
      });
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ error: "Failed to delete product" });
    }
  }
);

/**
 * PATCH /v1/products/:productId/toggle - Toggle product active status
 */
router.patch(
  "/:productId/toggle",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { productId } = req.params;

      const productRepository = AppDataSource.getRepository(Product);

      const product = await productRepository.findOne({
        where: { id: productId, designerId: userId },
      });

      if (!product) {
        return res
          .status(404)
          .json({ error: "Product not found or unauthorized" });
      }

      // If toggling to active, check listing limit
      if (!product.active) {
        const activeCount = await productRepository.count({
          where: { designerId: userId, active: true },
        });
        if (activeCount >= MAX_ACTIVE_LISTINGS) {
          return res.status(429).json({
            error: `Maximum active listings limit reached (${MAX_ACTIVE_LISTINGS}). Archive or hide existing listings first.`,
            activeListings: activeCount,
            limit: MAX_ACTIVE_LISTINGS,
          });
        }
      }

      product.active = !product.active;
      await productRepository.save(product);

      res.json({
        success: true,
        message: `Product ${product.active ? "published" : "unpublished"}`,
        product: {
          id: product.id,
          name: product.name,
          active: product.active,
        },
      });
    } catch (error) {
      console.error("Error toggling product:", error);
      res.status(500).json({ error: "Failed to toggle product" });
    }
  }
);

export default router;
