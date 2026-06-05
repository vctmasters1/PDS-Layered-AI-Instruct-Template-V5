/**
 * Search & Discovery Routes
 * Handles product search, capability-based discovery, and user recommendations
 */

import express, { Request, Response } from "express";
import AppDataSource from "../database.js";
import { Product } from "../entities/product.js";
import { User } from "../entities/user.js";
import { Designer } from "../entities/designer.js";
import { Producer } from "../entities/producer.js";
import { Favorite } from "../entities/favorite.js";
import { SearchSavedSearch } from "../entities/search.js";
import { verifyToken } from "./auth.js";

// Alias for middleware compatibility
const requireAuth = verifyToken;

const router = express.Router();

const MAX_SEARCH_LIMIT = 100;
const clampLimit = (val: unknown): number => Math.min(Math.max(1, Number(val) || 20), MAX_SEARCH_LIMIT);

/**
 * Deterministically fuzz coordinates for a user that has opted for location privacy.
 * Uses the userId as a seed so the offset is stable across requests (same user always
 * gets the same fuzzed position) but isn't predictable from the outside.
 * Offsets are bounded to ±~0.02 degrees (~1.5 km), keeping the pin within the zip area.
 */
function fuzzCoords(userId: string, lat: number, lng: number): { lat: number; lng: number } {
  // Simple deterministic hash from userId
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (Math.imul(31, h) + userId.charCodeAt(i)) | 0;
  }
  const h2 = (Math.imul(17, h) + 0x12345678) | 0;
  // Map to [-1, 1] range using sin/cos of hash
  const latOffset = Math.sin(h) * 0.02;
  const lngOffset = Math.cos(h2) * 0.03;
  return {
    lat: Math.round((lat + latOffset) * 1e6) / 1e6,
    lng: Math.round((lng + lngOffset) * 1e6) / 1e6,
  };
}

/**
 * Search products with filtering
 * GET /v1/search/products?query=widget&capability=cnc&location=New%20York&distance=50&sort=relevance&limit=20&offset=0
 */
router.get("/products", async (req: Request, res: Response) => {
  try {
    const {
      query = "",
      capability = "",
      location = "",
      distance = 50,
      category = "",
      minPrice = 0,
      maxPrice = 999999,
      sort = "relevance",
      limit = 20,
      offset = 0,
    } = req.query;

    const productRepo = AppDataSource.getRepository(Product);
    let queryBuilder = productRepo.createQueryBuilder("product")
      .where("product.active = true")
      .andWhere("product.deletedAt IS NULL");

    // Text search on name and description
    if (query) {
      queryBuilder = queryBuilder.andWhere(
        "(product.name ILIKE :query OR product.description ILIKE :query)",
        { query: `%${query}%` }
      );
    }

    // Capability filtering
    if (capability) {
      queryBuilder = queryBuilder.andWhere(
        "product.manufacturingRequirements LIKE :capability",
        { capability: `%${capability}%` }
      );
    }

    // Price range filtering
    queryBuilder = queryBuilder.andWhere(
      "product.price >= :minPrice AND product.price <= :maxPrice",
      { minPrice: Number(minPrice), maxPrice: Number(maxPrice) }
    );

    // Category filtering
    if (category) {
      queryBuilder = queryBuilder.andWhere("product.category = :category", {
        category,
      });
    }

    // Filter by owner's active service flags for specific categories
    // Ensures deactivated users' listings don't appear on marketplace tabs
    if (category === "materials" || category === "gizmos") {
      // Join happens later for all queries; add condition via subquery
      if (category === "materials") {
        queryBuilder = queryBuilder.andWhere(
          `product."designerId" IN (SELECT id FROM users WHERE "activeMaterials" = true)`
        );
      } else {
        queryBuilder = queryBuilder.andWhere(
          `product."designerId" IN (SELECT id FROM users WHERE "activeGizmo" = true)`
        );
      }
    }

    // Relevance sorting (text match score)
    if (sort === "relevance" && query) {
      queryBuilder = queryBuilder.addSelect(
        `CASE WHEN product.name ILIKE :exactQuery THEN 0 ELSE 1 END`,
        "relevance_score"
      );
      queryBuilder = queryBuilder.setParameter("exactQuery", `${query}`);
      queryBuilder = queryBuilder.orderBy("relevance_score", "ASC");
      queryBuilder = queryBuilder.addOrderBy("product.createdAt", "DESC");
    } else if (sort === "price_low") {
      queryBuilder = queryBuilder.orderBy("product.price", "ASC");
    } else if (sort === "price_high") {
      queryBuilder = queryBuilder.orderBy("product.price", "DESC");
    } else if (sort === "newest") {
      queryBuilder = queryBuilder.orderBy("product.createdAt", "DESC");
    } else if (sort === "rating") {
      queryBuilder = queryBuilder.orderBy("product.rating", "DESC");
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Pagination — load products with designer relation
    const safeLim = clampLimit(limit);
    const products = await queryBuilder
      .leftJoinAndSelect("product.designer", "designer")
      .skip(Number(offset))
      .take(safeLim)
      .getMany();

    res.json({
      success: true,
      search: {
        query,
        capability,
        location,
        distance: Number(distance),
        sort,
      },
      results: products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        category: p.category,
        rating: p.rating,
        image: p.images?.[0] || null,
        active: p.active,
        designerId: p.designerId,
        designerName: p.designer ? `${p.designer.firstName} ${p.designer.lastName}` : null,
        designerBusinessName: p.designer?.businessName || null,
        designerLatitude: p.designer?.businessLatitude || null,
        designerLongitude: p.designer?.businessLongitude || null,
        designerCity: p.designer?.businessCity || null,
        designerState: p.designer?.businessState || null,
        createdAt: p.createdAt,
      })),
      pagination: {
        limit: safeLim,
        offset: Number(offset),
        total,
        pages: Math.ceil(total / safeLim),
      },
    });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: "Search failed" });
  }
});

/**
 * Search designers with filtering
 * GET /v1/search/designers?query=name&location=NYC&sort=rating
 */
router.get("/designers", async (req: Request, res: Response) => {
  try {
    const {
      query = "",
      location = "",
      sort = "rating",
      limit = 20,
      offset = 0,
    } = req.query;

    const designerRepo = AppDataSource.getRepository(Designer);
    let queryBuilder = designerRepo
      .createQueryBuilder("designer")
      .leftJoinAndSelect("designer.user", "user")
      .where("designer.active = true")
      .andWhere("user.activeDesigner = true")
      .andWhere("designer.deletedAt IS NULL");

    // Text search on business name or user name
    if (query) {
      queryBuilder = queryBuilder.andWhere(
        "(designer.businessName ILIKE :query OR user.firstName ILIKE :query OR user.lastName ILIKE :query)",
        { query: `%${query}%` }
      );
    }

    // Location filtering (city or state)
    if (location) {
      queryBuilder = queryBuilder.andWhere(
        "(designer.location_city ILIKE :location OR designer.location_state ILIKE :location)",
        { location: `%${location}%` }
      );
    }

    // Sorting
    if (sort === "rating") {
      queryBuilder = queryBuilder.orderBy("designer.rating", "DESC");
    } else if (sort === "newest") {
      queryBuilder = queryBuilder.orderBy("designer.createdAt", "DESC");
    } else if (sort === "reviews") {
      queryBuilder = queryBuilder.orderBy("designer.reviewCount", "DESC");
    }

    const total = await queryBuilder.getCount();

    const safeLim = clampLimit(limit);
    const designers = await queryBuilder
      .skip(Number(offset))
      .take(safeLim)
      .getMany();

    res.json({
      success: true,
      search: { query, location, sort },
      results: designers.map((d) => {
        let latitude = d.location_latitude;
        let longitude = d.location_longitude;
        if (d.user?.locationPrivate && latitude && longitude) {
          if ((d.user as any).customPinLat && (d.user as any).customPinLng) {
            latitude = Number((d.user as any).customPinLat);
            longitude = Number((d.user as any).customPinLng);
          } else {
            const fuzzed = fuzzCoords(d.user.id, latitude, longitude);
            latitude = fuzzed.lat;
            longitude = fuzzed.lng;
          }
        }
        return {
        id: d.id,
        userId: d.user?.id,
        displayName: (d.user as any)?.displayName ?? null,
        name: d.user ? `${d.user.firstName} ${d.user.lastName}` : null,
        businessName: d.businessName,
        businessType: d.businessType,
        bio: d.bio ?? null,
        specialties: (() => { try { return (JSON.parse(d.website || '{}') as any).specialties ?? ''; } catch { return ''; } })(),
        capabilities: (() => { try { return (JSON.parse(d.website || '{}') as any).capabilities ?? []; } catch { return []; } })(),
        location: `${d.location_city}, ${d.location_state}`,
        city: d.location_city,
        state: d.location_state,
        latitude,
        longitude,
        rating: d.rating,
        reviewCount: d.reviewCount,
        totalSales: d.totalSales,
        averageLeadTime: d.averageLeadTime,
        availability: d.availability,
        verified: d.verified,
        createdAt: d.createdAt,
        services: {
          designer: d.user?.activeDesigner || false,
          producer: d.user?.activeProducer || false,
          materials: d.user?.activeMaterials || false,
          author: d.user?.activeAuthor || false,
          gizmo: d.user?.activeGizmo || false,
        },
        };
      }),
      pagination: {
        limit: safeLim,
        offset: Number(offset),
        total,
        pages: Math.ceil(total / safeLim),
      },
    });
  } catch (error) {
    console.error("Designer search error:", error);
    res.status(500).json({ error: "Designer search failed" });
  }
});

/**
 * Search producers with filtering
 * GET /v1/search/producers?query=name&capability=welding&location=Texas&sort=rating
 */
router.get("/producers", async (req: Request, res: Response) => {
  try {
    const {
      query = "",
      capability = "",
      location = "",
      sort = "rating",
      limit = 20,
      offset = 0,
    } = req.query;

    const producerRepo = AppDataSource.getRepository(Producer);
    let queryBuilder = producerRepo
      .createQueryBuilder("producer")
      .leftJoinAndSelect("producer.user", "user")
      .where("producer.active = true")
      .andWhere("user.activeProducer = true")
      .andWhere("producer.deletedAt IS NULL");

    // Text search on business name or user name
    if (query) {
      queryBuilder = queryBuilder.andWhere(
        "(producer.businessName ILIKE :query OR user.firstName ILIKE :query OR user.lastName ILIKE :query)",
        { query: `%${query}%` }
      );
    }

    // Capability filtering (material types)
    if (capability) {
      queryBuilder = queryBuilder.andWhere(
        "producer.capabilities_materialTypes LIKE :capability",
        { capability: `%${capability}%` }
      );
    }

    // Location filtering (city or state)
    if (location) {
      queryBuilder = queryBuilder.andWhere(
        "(producer.location_city ILIKE :location OR producer.location_state ILIKE :location)",
        { location: `%${location}%` }
      );
    }

    // Sorting
    if (sort === "rating") {
      queryBuilder = queryBuilder.orderBy("producer.rating", "DESC");
    } else if (sort === "newest") {
      queryBuilder = queryBuilder.orderBy("producer.createdAt", "DESC");
    } else if (sort === "reviews") {
      queryBuilder = queryBuilder.orderBy("producer.reviewCount", "DESC");
    }

    const total = await queryBuilder.getCount();

    const safeLim = clampLimit(limit);
    const producers = await queryBuilder
      .skip(Number(offset))
      .take(safeLim)
      .getMany();

    res.json({
      success: true,
      search: { query, capability, location, sort },
      results: producers.map((p) => {
        let latitude = p.location_latitude;
        let longitude = p.location_longitude;
        if (p.user?.locationPrivate && latitude && longitude) {
          if ((p.user as any).customPinLat && (p.user as any).customPinLng) {
            latitude = Number((p.user as any).customPinLat);
            longitude = Number((p.user as any).customPinLng);
          } else {
            const fuzzed = fuzzCoords(p.user.id, latitude, longitude);
            latitude = fuzzed.lat;
            longitude = fuzzed.lng;
          }
        }
        return {
        id: p.id,
        userId: p.user?.id,
        displayName: (p.user as any)?.displayName ?? null,
        name: p.user ? `${p.user.firstName} ${p.user.lastName}` : null,
        businessName: p.businessName,
        bio: p.bio ?? null,
        description: p.description,
        location: `${p.location_city}, ${p.location_state}`,
        city: p.location_city,
        state: p.location_state,
        latitude,
        longitude,
        capabilities: {
          materialTypes: p.capabilities_materialTypes,
          productTypes: p.capabilities_productTypes,
          minBatchSize: p.capabilities_minBatchSize,
          maxCapacityPerMonth: p.capabilities_maxCapacityPerMonth,
        },
        rating: p.rating,
        reviewCount: p.reviewCount,
        totalOrdersFulfilled: p.totalOrdersFulfilled,
        averageLeadTime: p.averageLeadTime,
        availability: p.availability,
        verified: p.verified,
        createdAt: p.createdAt,
        services: {
          designer: p.user?.activeDesigner || false,
          producer: p.user?.activeProducer || false,
          materials: p.user?.activeMaterials || false,
          author: p.user?.activeAuthor || false,
          gizmo: p.user?.activeGizmo || false,
        },
        };
      }),
      pagination: {
        limit: safeLim,
        offset: Number(offset),
        total,
        pages: Math.ceil(total / safeLim),
      },
    });
  } catch (error) {
    console.error("Producer search error:", error);
    res.status(500).json({ error: "Producer search failed" });
  }
});

// NOTE: Saved searches and favorites functionality disabled pending entity implementation

// Get single designer public profile
router.get("/designers/:id", async (req: Request, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(Designer);
    const d = await repo
      .createQueryBuilder("designer")
      .leftJoinAndSelect("designer.user", "user")
      .where("designer.id = :id", { id: req.params.id })
      .andWhere("designer.active = true")
      .andWhere("designer.deletedAt IS NULL")
      .getOne();
    if (!d) return res.status(404).json({ error: "Designer not found" });

    let meta: Record<string, unknown> = {};
    try { meta = JSON.parse(d.website || "{}"); } catch {}

    res.json({
      id: d.id,
      userId: d.user?.id,
      displayName: (d.user as any)?.displayName ?? null,
      name: d.user ? `${d.user.firstName ?? ''} ${d.user.lastName ?? ''}`.trim() : null,
      businessName: d.businessName,
      bio: d.bio ?? null,
      specialties: (meta.specialties as string) ?? "",
      capabilities: (meta.capabilities as string[]) ?? [],
      experience: (meta.experience as number) ?? 0,
      hourlyRate: (meta.hourlyRate as number) ?? 0,
      city: d.location_city,
      state: d.location_state,
      location: `${d.location_city ?? ''}, ${d.location_state ?? ''}`.replace(/^, |, $/, '') || 'USA',
      latitude: d.location_latitude,
      longitude: d.location_longitude,
      rating: d.rating,
      reviewCount: d.reviewCount,
      verifiedReviewCount: d.verifiedReviewCount,
      totalSales: d.totalSales,
      averageLeadTime: d.averageLeadTime,
      availability: d.availability,
      waitlistCount: d.waitlistCount,
      verified: d.verified,
    });
  } catch (error) {
    console.error("Get designer error:", error);
    res.status(500).json({ error: "Failed to fetch designer" });
  }
});

// Get single producer public profile
router.get("/producers/:id", async (req: Request, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(Producer);
    const p = await repo
      .createQueryBuilder("producer")
      .leftJoinAndSelect("producer.user", "user")
      .where("producer.id = :id", { id: req.params.id })
      .andWhere("producer.active = true")
      .andWhere("producer.deletedAt IS NULL")
      .getOne();
    if (!p) return res.status(404).json({ error: "Producer not found" });

    let meta: Record<string, unknown> = {};
    try { meta = JSON.parse(p.description || "{}"); } catch {}

    res.json({
      id: p.id,
      userId: p.user?.id,
      displayName: (p.user as any)?.displayName ?? null,
      name: p.user ? `${p.user.firstName ?? ''} ${p.user.lastName ?? ''}`.trim() : null,
      businessName: p.businessName,
      bio: p.bio ?? null,
      specialties: (meta.specialties as string) ?? "",
      certifications: (meta.certifications as string) ?? "",
      capabilities: p.capabilities_materialTypes ?? [],
      minBatch: p.capabilities_minBatchSize,
      capacity: p.capabilities_maxCapacityPerMonth,
      city: p.location_city,
      state: p.location_state,
      location: `${p.location_city ?? ''}, ${p.location_state ?? ''}`.replace(/^, |, $/, '') || 'USA',
      latitude: p.location_latitude,
      longitude: p.location_longitude,
      rating: p.rating,
      reviewCount: p.reviewCount,
      verifiedReviewCount: p.verifiedReviewCount,
      totalOrdersFulfilled: p.totalOrdersFulfilled,
      averageLeadTime: p.averageLeadTime,
      availability: p.availability,
      waitlistCount: p.waitlistCount,
      verified: p.verified,
    });
  } catch (error) {
    console.error("Get producer error:", error);
    res.status(500).json({ error: "Failed to fetch producer" });
  }
});

router.post("/saved", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { name, query, filters } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    const repo = AppDataSource.getRepository(SearchSavedSearch);
    const saved = repo.create({ userId, name, query: query || "", filters: filters ? JSON.stringify(filters) : undefined });
    await repo.save(saved);
    res.status(201).json({ success: true, search: saved });
  } catch (error) {
    console.error("Save search error:", error);
    res.status(500).json({ error: "Failed to save search" });
  }
});

/**
 * Get user's saved searches
 * GET /v1/search/saved
 */
router.get("/saved", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { limit = 50, offset = 0 } = req.query;

    const repo = AppDataSource.getRepository(SearchSavedSearch);
    const [searches, total] = await repo.findAndCount({
      where: { userId },
      order: { createdAt: "DESC" },
      take: Number(limit),
      skip: Number(offset),
    });
    res.json({ success: true, searches, total });
  } catch (error) {
    console.error("Fetch saved searches error:", error);
    res.status(500).json({ error: "Failed to fetch saved searches" });
  }
});

/**
 * Delete a saved search
 * DELETE /v1/search/saved/:searchId
 */
router.delete(
  "/saved/:searchId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { searchId } = req.params;

      const repo = AppDataSource.getRepository(SearchSavedSearch);
      const search = await repo.findOne({ where: { id: searchId, userId } });
      if (!search) return res.status(404).json({ error: "Saved search not found" });
      await repo.remove(search);
      res.json({ success: true, message: "Search deleted" });
    } catch (error) {
      console.error("Delete search error:", error);
      res.status(500).json({ error: "Failed to delete search" });
    }
  }
);

/**
 * Add product to favorites/wishlist
 * POST /v1/search/favorites
 */
router.post(
  "/favorites",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { productId } = req.body;

      if (!productId) {
        return res.status(400).json({ error: "Product ID required" });
      }

      const repo = AppDataSource.getRepository(Favorite);
      // Check if already favorited
      const existing = await repo.findOne({ where: { userId, productId } });
      if (existing) return res.json({ success: true, message: "Already in favorites", favorite: existing });

      const fav = repo.create({ userId, productId });
      await repo.save(fav);
      res.status(201).json({ success: true, favorite: fav });
    } catch (error) {
      console.error("Add favorite error:", error);
      res.status(500).json({ error: "Failed to add favorite" });
    }
  }
);

/**
 * Remove product from favorites/wishlist
 * DELETE /v1/search/favorites/:productId
 */
router.delete(
  "/favorites/:productId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { productId } = req.params;

      const repo = AppDataSource.getRepository(Favorite);
      const fav = await repo.findOne({ where: { userId, productId } });
      if (!fav) return res.status(404).json({ error: "Favorite not found" });
      await repo.remove(fav);
      res.json({ success: true, message: "Favorite removed" });
    } catch (error) {
      console.error("Remove favorite error:", error);
      res.status(500).json({ error: "Failed to remove favorite" });
    }
  }
);

/**
 * Get user's favorite products
 * GET /v1/search/favorites?limit=50&offset=0
 */
router.get("/favorites", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { limit = 50, offset = 0 } = req.query;

    const repo = AppDataSource.getRepository(Favorite);
    const [favorites, total] = await repo.findAndCount({
      where: { userId },
      relations: ["product"],
      order: { createdAt: "DESC" },
      take: Number(limit),
      skip: Number(offset),
    });
    res.json({
      success: true,
      favorites: favorites.map(f => ({
        id: f.id,
        productId: f.productId,
        product: f.product ? { id: f.product.id, name: f.product.name, price: f.product.price, images: f.product.images } : null,
        createdAt: f.createdAt,
      })),
      total,
    });
  } catch (error) {
    console.error("Get favorites error:", error);
    res.status(500).json({ error: "Failed to fetch favorites" });
  }
});

/**
 * Get capabilities for faceted search
 * GET /v1/search/capabilities?type=designer
 */
router.get("/capabilities", async (req: Request, res: Response) => {
  try {
    const { type = "designer" } = req.query;

    // These would come from a capabilities database in production
    const designerCapabilities = [
      "3D Design",
      "2D Design",
      "CAD",
      "Product Design",
      "Mechanical Design",
      "Electrical Design",
      "Industrial Design",
      "Prototype Design",
      "Reverse Engineering",
      "Technical Drawings",
      "Material Selection",
      "Cost Optimization",
      "Sustainability Focus",
      "Ergonomic Design",
      "Aesthetic Design",
      "UI/UX Design",
      "Packaging Design",
      "Assembly Design",
      "Manufacturing Feasibility",
      "Tolerance Stack-up",
    ];

    const producerCapabilities = [
      "CNC Machining",
      "3D Printing",
      "Welding",
      "Injection Molding",
      "Sheet Metal Fabrication",
      "Assembly",
      "Electronics",
      "PCB Assembly",
      "Powder Coating",
      "Plating",
      "Anodizing",
      "Laser Cutting",
      "Waterjet Cutting",
      "Stamping",
      "Forging",
      "Casting",
      "Composites",
      "Packaging",
      "Quality Inspection",
      "Testing & Certification",
      "Tooling",
      "Engraving",
      "Textile Stitching",
      "Wood Working",
      "Metal Fabrication",
    ];

    const capabilities =
      type === "producer" ? producerCapabilities : designerCapabilities;

    res.json({
      success: true,
      type: type,
      capabilities: capabilities,
    });
  } catch (error) {
    console.error("Get capabilities error:", error);
    res.status(500).json({ error: "Failed to fetch capabilities" });
  }
});

/**
 * Get search recommendations based on user profile
 * GET /v1/search/recommendations
 */
router.get(
  "/recommendations",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const userRepo = AppDataSource.getRepository(User);
      const productRepo = AppDataSource.getRepository(Product);

      const user = await userRepo.findOne({ where: { id: userId } });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Recommend products based on user role
      let query = productRepo.createQueryBuilder("product");

      if (user.role === "producer") {
        // Recommend products that match producer capabilities
        query = query.where("product.manufacturingRequirements IS NOT NULL");
      } else if (user.role === "designer") {
        // Recommend products from similar designers
        query = query.orderBy("product.createdAt", "DESC");
      }

      const recommendations = await query
        .limit(10)
        .getMany();

      res.json({
        success: true,
        recommendations: recommendations.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          reason:
            user.role === "producer"
              ? "Matches your capabilities"
              : "Recently added",
        })),
      });
    } catch (error) {
      console.error("Get recommendations error:", error);
      res.status(500).json({ error: "Failed to fetch recommendations" });
    }
  }
);

export default router;
