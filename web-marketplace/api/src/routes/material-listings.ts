import express, { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import AppDataSource from "../database.js";
import { MaterialListing } from "../entities/material-listing.js";
import { verifyToken } from "./auth.js";

const router = express.Router();

const MAX_LISTINGS = 50;

// ── helpers ──────────────────────────────────────────────────────────────────

function shape(l: MaterialListing) {
  return {
    id:              l.id,
    title:           l.title,
    description:     l.description,
    materialTypes:   l.materialTypes ?? [],
    imageUrl:        l.imageUrl ?? null,
    pricePerUnit:    Number(l.pricePerUnit),
    unit:            l.unit,
    amountAvailable: Number(l.amountAvailable),
    leadTimeDays:    l.leadTimeDays,
    condition:       l.condition,
    notes:           l.notes ?? null,
    active:          l.active,
    createdAt:       l.createdAt,
    updatedAt:       l.updatedAt,
  };
}

// ── GET /v1/material-listings/public  — browse all active listings (no auth) ─
router.get("/public", async (req: Request, res: Response) => {
  try {
    const { q, limit = "50", offset = "0" } = req.query as Record<string, string>;
    const lim = Math.min(parseInt(limit) || 50, 100);
    const off = Math.max(parseInt(offset) || 0, 0);

    let qb = AppDataSource.getRepository(MaterialListing)
      .createQueryBuilder("ml")
      .where("ml.active = true");

    if (q?.trim()) {
      qb = qb.andWhere(
        "(ml.title ILIKE :q OR ml.description ILIKE :q OR CAST(ml.\"materialTypes\" AS text) ILIKE :q)",
        { q: `%${q.trim()}%` }
      );
    }

    const [listings, total] = await qb
      .orderBy("ml.createdAt", "DESC")
      .skip(off)
      .take(lim)
      .getManyAndCount();

    // Enrich each listing with seller info from the designers table
    const userIds = [...new Set(listings.map((l) => l.userId))];
    const sellerMap: Record<string, { businessName: string | null; city: string | null; state: string | null; lat: number | null; lng: number | null }> = {};

    if (userIds.length > 0) {
      const rows: Array<{ userId: string; businessName: string | null; businessCity: string | null; businessState: string | null; businessLatitude: string | null; businessLongitude: string | null }> =
        await AppDataSource.query(
          `SELECT d."userId", d."businessName", d."businessCity", d."businessState", d."businessLatitude", d."businessLongitude"
           FROM designers d WHERE d."userId" = ANY($1)`,
          [userIds]
        );
      for (const row of rows) {
        sellerMap[row.userId] = {
          businessName: row.businessName ?? null,
          city:         row.businessCity ?? null,
          state:        row.businessState ?? null,
          lat:          row.businessLatitude  ? Number(row.businessLatitude)  : null,
          lng:          row.businessLongitude ? Number(row.businessLongitude) : null,
        };
      }
    }

    const results = listings.map((l) => ({
      ...shape(l),
      seller: sellerMap[l.userId] ?? { businessName: null, city: null, state: null, lat: null, lng: null },
    }));

    res.json({ success: true, total, listings: results });
  } catch (err) {
    console.error("material-listings public GET error:", err);
    res.status(500).json({ error: "Failed to fetch listings" });
  }
});

// ── GET /v1/material-listings  — list caller's own listings (newest first) ───
router.get("/", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const repo = AppDataSource.getRepository(MaterialListing);
    const listings = await repo.find({
      where: { userId },
      order: { createdAt: "DESC" },
    });
    res.json({ success: true, count: listings.length, listings: listings.map(shape) });
  } catch (err) {
    console.error("material-listings GET error:", err);
    res.status(500).json({ error: "Failed to fetch listings" });
  }
});

// ── POST /v1/material-listings  — create ─────────────────────────────────────
router.post("/", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const repo = AppDataSource.getRepository(MaterialListing);

    // Cap at 50 per user
    const count = await repo.count({ where: { userId } });
    if (count >= MAX_LISTINGS) {
      return res.status(429).json({
        error: `Maximum of ${MAX_LISTINGS} material listings reached. Delete an existing listing first.`,
      });
    }

    const {
      title, description, materialTypes, imageUrl,
      pricePerUnit, unit, amountAvailable, leadTimeDays,
      condition, notes, active,
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: "title and description are required" });
    }

    const listing = new MaterialListing();
    listing.id              = uuidv4();
    listing.userId          = userId;
    listing.title           = String(title).substring(0, 120);
    listing.description     = String(description);
    listing.materialTypes   = Array.isArray(materialTypes) ? materialTypes : [];
    listing.imageUrl        = imageUrl ?? null;
    listing.pricePerUnit    = parseFloat(pricePerUnit) || 0;
    listing.unit            = String(unit || "unit").substring(0, 30);
    listing.amountAvailable = parseFloat(amountAvailable) || 0;
    listing.leadTimeDays    = parseInt(leadTimeDays) || 1;
    listing.condition       = condition ?? "new";
    listing.notes           = notes ?? null;
    listing.active          = active !== false;

    await repo.save(listing);
    res.status(201).json({ success: true, listing: shape(listing) });
  } catch (err) {
    console.error("material-listings POST error:", err);
    res.status(500).json({ error: "Failed to create listing" });
  }
});

// ── PUT /v1/material-listings/:id  — update ───────────────────────────────────
router.put("/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const repo = AppDataSource.getRepository(MaterialListing);

    const listing = await repo.findOne({ where: { id: req.params.id, userId } });
    if (!listing) return res.status(404).json({ error: "Listing not found" });

    const {
      title, description, materialTypes, imageUrl,
      pricePerUnit, unit, amountAvailable, leadTimeDays,
      condition, notes, active,
    } = req.body;

    if (title        !== undefined) listing.title           = String(title).substring(0, 120);
    if (description  !== undefined) listing.description     = String(description);
    if (materialTypes !== undefined) listing.materialTypes  = Array.isArray(materialTypes) ? materialTypes : [];
    if (imageUrl     !== undefined) listing.imageUrl        = imageUrl ?? null;
    if (pricePerUnit !== undefined) listing.pricePerUnit    = parseFloat(pricePerUnit) || 0;
    if (unit         !== undefined) listing.unit            = String(unit).substring(0, 30);
    if (amountAvailable !== undefined) listing.amountAvailable = parseFloat(amountAvailable) || 0;
    if (leadTimeDays !== undefined) listing.leadTimeDays    = parseInt(leadTimeDays) || 1;
    if (condition    !== undefined) listing.condition       = condition;
    if (notes        !== undefined) listing.notes           = notes ?? null;
    if (active       !== undefined) listing.active          = Boolean(active);

    await repo.save(listing);
    res.json({ success: true, listing: shape(listing) });
  } catch (err) {
    console.error("material-listings PUT error:", err);
    res.status(500).json({ error: "Failed to update listing" });
  }
});

// ── DELETE /v1/material-listings/:id  — delete ────────────────────────────────
router.delete("/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const repo = AppDataSource.getRepository(MaterialListing);

    const listing = await repo.findOne({ where: { id: req.params.id, userId } });
    if (!listing) return res.status(404).json({ error: "Listing not found" });

    await repo.remove(listing);
    res.json({ success: true });
  } catch (err) {
    console.error("material-listings DELETE error:", err);
    res.status(500).json({ error: "Failed to delete listing" });
  }
});

export default router;
