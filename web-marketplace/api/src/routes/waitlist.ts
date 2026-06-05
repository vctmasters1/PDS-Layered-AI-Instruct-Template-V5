import express, { Request, Response } from "express";
import AppDataSource from "../database.js";
import { WaitlistEntry } from "../entities/waitlist-entry.js";
import { Product } from "../entities/product.js";
import { verifyToken } from "./auth.js";

const router = express.Router();

/**
 * POST /v1/waitlist
 * Body: { productId: string }
 * Adds the authenticated user to the waitlist for a sold-out product.
 * Duplicate entries (same user + same product) are silently ignored.
 */
router.post("/", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ error: "productId is required" });
    }

    const productRepo = AppDataSource.getRepository(Product);
    const product = await productRepo.findOne({ where: { id: productId } });
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const waitlistRepo = AppDataSource.getRepository(WaitlistEntry);

    // Upsert — ignore if already on the list
    const existing = await waitlistRepo.findOne({ where: { userId, productId } });
    if (existing) {
      return res.status(200).json({ message: "Already on waitlist", id: existing.id });
    }

    const entry = waitlistRepo.create({ userId, productId, productName: product.name });
    await waitlistRepo.save(entry);

    res.status(201).json({ message: "Added to waitlist", id: entry.id, productName: product.name });
  } catch (err: any) {
    console.error("POST /waitlist error:", err);
    res.status(500).json({ error: "Failed to join waitlist" });
  }
});

/**
 * GET /v1/waitlist
 * Returns the authenticated user's waitlist entries.
 */
router.get("/", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const waitlistRepo = AppDataSource.getRepository(WaitlistEntry);

    const entries = await waitlistRepo.find({
      where: { userId },
      relations: ["product"],
      order: { createdAt: "DESC" },
    });

    res.json(entries.map(e => ({
      id: e.id,
      productId: e.productId,
      productName: e.product?.name ?? e.productName,
      productImage: e.product?.images?.[0] ?? null,
      productPrice: e.product?.price ?? null,
      createdAt: e.createdAt,
    })));
  } catch (err: any) {
    console.error("GET /waitlist error:", err);
    res.status(500).json({ error: "Failed to fetch waitlist" });
  }
});

/**
 * DELETE /v1/waitlist/:productId
 * Remove a product from the user's waitlist.
 */
router.delete("/:productId", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { productId } = req.params;

    const waitlistRepo = AppDataSource.getRepository(WaitlistEntry);
    await waitlistRepo.delete({ userId, productId });

    res.json({ message: "Removed from waitlist" });
  } catch (err: any) {
    console.error("DELETE /waitlist error:", err);
    res.status(500).json({ error: "Failed to remove from waitlist" });
  }
});

export default router;
