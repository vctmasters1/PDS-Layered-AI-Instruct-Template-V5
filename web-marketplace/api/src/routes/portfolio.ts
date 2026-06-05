import { Router, Request, Response } from "express";
import multer from "multer";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { In } from "typeorm";
import { verifyToken } from "./auth.js";
import AppDataSource from "../database.js";
import { PortfolioImage, PortfolioServiceType } from "../entities/portfolio-image.js";
import { User } from "../entities/user.js";
import { Designer } from "../entities/designer.js";
import { Producer } from "../entities/producer.js";
import { Product } from "../entities/product.js";
import { Review } from "../entities/review.js";

const router = Router();

const MAX_PORTFOLIO_IMAGES = 50;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const COMPRESSED_MAX_WIDTH = 1200;
const COMPRESSED_QUALITY = 80;

const uploadsDir = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 10 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP, GIF`));
    }
  },
});

const validServiceTypes = Object.values(PortfolioServiceType);

/**
 * GET /v1/portfolio/:userId
 * Get all portfolio images for a user (public — no auth required)
 * Optional query: ?serviceType=designer
 */
router.get("/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { serviceType } = req.query;

    const repo = AppDataSource.getRepository(PortfolioImage);
    const where: any = { userId };
    if (serviceType && validServiceTypes.includes(serviceType as PortfolioServiceType)) {
      where.serviceType = serviceType;
    }

    const images = await repo.find({
      where,
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });

    res.json({ images, count: images.length });
  } catch (error: any) {
    console.error("Portfolio fetch error:", error);
    res.status(500).json({ error: "Failed to load portfolio" });
  }
});

/**
 * POST /v1/portfolio/upload
 * Upload portfolio images (up to 10 at a time, max 50 per service type)
 * Body: serviceType (required), images (multipart files), captions (optional JSON array)
 */
router.post(
  "/upload",
  verifyToken,
  (req: Request, res: Response, next: any) => {
    upload.array("images", 10)(req, res, (err: any) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_COUNT") {
          return res.status(400).json({ error: "Maximum 10 images per upload" });
        }
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ error: "File too large. Maximum 10MB per image" });
        }
        return res.status(400).json({ error: err.message });
      }
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { serviceType } = req.body;
      const files = req.files as Express.Multer.File[];

      if (!serviceType || !validServiceTypes.includes(serviceType)) {
        return res.status(400).json({
          error: `serviceType is required. Valid: ${validServiceTypes.join(", ")}`,
        });
      }

      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No images provided" });
      }

      const repo = AppDataSource.getRepository(PortfolioImage);

      // Check existing count
      const existingCount = await repo.count({ where: { userId, serviceType } });
      if (existingCount + files.length > MAX_PORTFOLIO_IMAGES) {
        return res.status(400).json({
          error: `Maximum ${MAX_PORTFOLIO_IMAGES} portfolio images per service type. You have ${existingCount}, tried to add ${files.length}.`,
        });
      }

      const savedImages: PortfolioImage[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filename = `portfolio_${userId}_${uuidv4()}.webp`;
        const filepath = path.join(uploadsDir, filename);

        const compressed = await sharp(file.buffer)
          .resize(COMPRESSED_MAX_WIDTH, undefined, {
            withoutEnlargement: true,
            fit: "inside",
          })
          .webp({ quality: COMPRESSED_QUALITY })
          .toBuffer();

        fs.writeFileSync(filepath, compressed);

        const image = repo.create({
          userId,
          serviceType,
          imageUrl: `/uploads/${filename}`,
          sortOrder: existingCount + i,
        });

        const saved = await repo.save(image);
        savedImages.push(saved);
      }

      res.json({
        success: true,
        images: savedImages,
        count: savedImages.length,
        totalCount: existingCount + savedImages.length,
        maxAllowed: MAX_PORTFOLIO_IMAGES,
      });
    } catch (error: any) {
      console.error("Portfolio upload error:", error);
      res.status(500).json({ error: "Portfolio image upload failed" });
    }
  }
);

/**
 * PUT /v1/portfolio/reorder
 * Update sort order of portfolio images
 * Body: { imageIds: string[] } — ordered array of image IDs
 */
router.put("/reorder", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { imageIds } = req.body;

    if (!Array.isArray(imageIds)) {
      return res.status(400).json({ error: "imageIds array is required" });
    }

    const repo = AppDataSource.getRepository(PortfolioImage);

    // Verify ownership of all images
    const images = await repo.find({
      where: { id: In(imageIds), userId },
    });

    if (images.length !== imageIds.length) {
      return res.status(403).json({ error: "Some images not found or not owned by you" });
    }

    // Update sort order
    for (let i = 0; i < imageIds.length; i++) {
      await repo.update({ id: imageIds[i], userId }, { sortOrder: i });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Portfolio reorder error:", error);
    res.status(500).json({ error: "Failed to reorder portfolio" });
  }
});

/**
 * PUT /v1/portfolio/:imageId/caption
 * Update caption for a portfolio image
 */
router.put("/:imageId/caption", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { imageId } = req.params;
    const { caption } = req.body;

    const repo = AppDataSource.getRepository(PortfolioImage);
    const image = await repo.findOne({ where: { id: imageId, userId } });

    if (!image) {
      return res.status(404).json({ error: "Image not found" });
    }

    image.caption = (typeof caption === "string") ? caption.substring(0, 200) : "";
    await repo.save(image);

    res.json({ success: true, image });
  } catch (error: any) {
    console.error("Portfolio caption error:", error);
    res.status(500).json({ error: "Failed to update caption" });
  }
});

/**
 * DELETE /v1/portfolio/:imageId
 * Delete a portfolio image
 */
router.delete("/:imageId", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { imageId } = req.params;

    const repo = AppDataSource.getRepository(PortfolioImage);
    const image = await repo.findOne({ where: { id: imageId, userId } });

    if (!image) {
      return res.status(404).json({ error: "Image not found" });
    }

    // Delete file from disk
    const filename = image.imageUrl.replace("/uploads/", "");
    const filepath = path.join(uploadsDir, filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }

    await repo.remove(image);

    res.json({ success: true, message: "Portfolio image deleted" });
  } catch (error: any) {
    console.error("Portfolio delete error:", error);
    res.status(500).json({ error: "Failed to delete portfolio image" });
  }
});

/**
 * GET /v1/portfolio/profile/:userId
 * Get public profile data for a user (no auth required)
 * Returns user info, designer/producer details, portfolio images, products, reviews
 */
router.get("/profile/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Gather profile components in parallel
    const [designer, producer, portfolioImages, products, reviews] = await Promise.all([
      user.activeDesigner
        ? AppDataSource.getRepository(Designer).findOne({ where: { user: { id: userId } } })
        : null,
      user.activeProducer
        ? AppDataSource.getRepository(Producer).findOne({ where: { user: { id: userId } } })
        : null,
      AppDataSource.getRepository(PortfolioImage).find({
        where: { userId },
        order: { serviceType: "ASC", sortOrder: "ASC" },
      }),
      AppDataSource.getRepository(Product).find({
        where: { designerId: userId, active: true },
        order: { createdAt: "DESC" },
        take: 50,
      }),
      AppDataSource.getRepository(Review).find({
        where: { targetId: userId },
        order: { createdAt: "DESC" },
        take: 50,
        relations: ["reviewer"],
      }),
    ]);

    const profile: any = {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        businessName: user.businessName || designer?.businessName || producer?.businessName,
        memberSince: user.createdAt,
        services: {
          designer: user.activeDesigner || false,
          producer: user.activeProducer || false,
          materials: user.activeMaterials || false,
          author: user.activeAuthor || false,
          gizmo: user.activeGizmo || false,
        },
      },
    };

    if (designer) {
      profile.designer = {
        businessName: designer.businessName,
        location: `${designer.location_city || ''}, ${designer.location_state || ''}`.replace(/^,\s*|,\s*$/g, ''),

        rating: designer.rating,
        reviewCount: designer.reviewCount,
        verifiedReviewCount: designer.verifiedReviewCount,
        totalSales: designer.totalSales,
        averageLeadTime: designer.averageLeadTime,
        availability: designer.availability,
        waitlistCount: designer.waitlistCount,
        verified: designer.verified,
        website: designer.website,
      };
    }

    if (producer) {
      profile.producer = {
        businessName: producer.businessName,
        description: producer.description,
        location: `${producer.location_city || ''}, ${producer.location_state || ''}`.replace(/^,\s*|,\s*$/g, ''),
        rating: producer.rating,
        reviewCount: producer.reviewCount,
        verifiedReviewCount: producer.verifiedReviewCount,
        totalOrdersFulfilled: producer.totalOrdersFulfilled,
        averageLeadTime: producer.averageLeadTime,
        availability: producer.availability,
        waitlistCount: producer.waitlistCount,
        verified: producer.verified,
        website: producer.website,
        materialTypes: producer.capabilities_materialTypes,
        productTypes: producer.capabilities_productTypes,
        minBatchSize: producer.capabilities_minBatchSize,
      };
    }

    profile.portfolio = portfolioImages.map((img: PortfolioImage) => ({
      id: img.id,
      serviceType: img.serviceType,
      imageUrl: img.imageUrl,
      caption: img.caption,
      sortOrder: img.sortOrder,
    }));

    profile.products = products.map((p: Product) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      images: p.images,
      category: p.category,
      stock: p.stock,
      createdAt: p.createdAt,
    }));

    profile.reviews = reviews.map((r: Review) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      comment: r.body,
      reviewerName: r.reviewer
        ? `${r.reviewer.firstName} ${r.reviewer.lastName}`
        : "Anonymous",
      verified: r.isVerifiedPurchase,
      createdAt: r.createdAt,
    }));

    res.json(profile);
  } catch (error: any) {
    console.error("Public profile error:", error);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

export default router;
