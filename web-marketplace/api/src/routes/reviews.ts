import express, { Request, Response } from "express";
import AppDataSource from "../database.js";
import { Review } from "../entities/review.js";
import { Order } from "../entities/order.js";
import { Product } from "../entities/product.js";
import { Designer } from "../entities/designer.js";
import { Producer } from "../entities/producer.js";
import { verifyToken } from "./auth.js";
import { reviewLimiter } from "../middleware/security.js";

const router = express.Router();

/**
 * GET /v1/reviews/:targetType/:targetId — Get reviews for a target
 * Public — no auth required
 * Query params: ?page=1&limit=20&sort=newest|oldest|helpful|verified
 */
router.get("/:targetType/:targetId", async (req: Request, res: Response) => {
  try {
    const { targetType, targetId } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const sort = (req.query.sort as string) || "newest";

    const validTypes = ["product", "designer", "producer", "service"];
    if (!validTypes.includes(targetType)) {
      return res.status(400).json({ error: "Invalid target type" });
    }

    const reviewRepo = AppDataSource.getRepository(Review);

    const qb = reviewRepo
      .createQueryBuilder("review")
      .leftJoinAndSelect("review.reviewer", "reviewer")
      .where("review.targetType = :targetType", { targetType })
      .andWhere("review.targetId = :targetId", { targetId })
      .andWhere("review.visible = :visible", { visible: true })
      .select([
        "review.id",
        "review.rating",
        "review.title",
        "review.body",
        "review.isVerifiedPurchase",
        "review.helpfulCount",
        "review.createdAt",
        "reviewer.id",
        "reviewer.firstName",
        "reviewer.lastName",
      ]);

    // Sorting
    if (sort === "oldest") {
      qb.orderBy("review.createdAt", "ASC");
    } else if (sort === "helpful") {
      qb.orderBy("review.helpfulCount", "DESC");
    } else if (sort === "verified") {
      qb.orderBy("review.isVerifiedPurchase", "DESC").addOrderBy("review.createdAt", "DESC");
    } else {
      qb.orderBy("review.createdAt", "DESC");
    }

    const [reviews, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // Aggregate stats
    const stats = await reviewRepo
      .createQueryBuilder("review")
      .where("review.targetType = :targetType", { targetType })
      .andWhere("review.targetId = :targetId", { targetId })
      .andWhere("review.visible = true")
      .select([
        "COUNT(*) as totalReviews",
        "ROUND(AVG(review.rating), 1) as averageRating",
        "SUM(CASE WHEN review.isVerifiedPurchase = true THEN 1 ELSE 0 END) as verifiedCount",
        "ROUND(AVG(CASE WHEN review.isVerifiedPurchase = true THEN review.rating END), 1) as verifiedAvgRating",
        "ROUND(AVG(CASE WHEN review.isVerifiedPurchase = false THEN review.rating END), 1) as communityAvgRating",
      ])
      .getRawOne();

    res.json({
      reviews,
      stats: {
        totalReviews: parseInt(stats.totalReviews) || 0,
        averageRating: parseFloat(stats.averageRating) || 0,
        verifiedCount: parseInt(stats.verifiedCount) || 0,
        communityCount: (parseInt(stats.totalReviews) || 0) - (parseInt(stats.verifiedCount) || 0),
        verifiedAvgRating: parseFloat(stats.verifiedAvgRating) || 0,
        communityAvgRating: parseFloat(stats.communityAvgRating) || 0,
      },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error("GET reviews error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /v1/reviews — Submit a review
 * Auth required
 * Body: { targetType, targetId, rating, title?, body?, orderId? }
 */
router.post("/", reviewLimiter, verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { targetType, targetId, rating, title, body, orderId } = req.body;

    // Validate
    const validTypes = ["product", "designer", "producer", "service"];
    if (!validTypes.includes(targetType)) {
      return res.status(400).json({ error: "Invalid target type" });
    }
    if (!targetId) return res.status(400).json({ error: "targetId required" });
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be 1.0-5.0" });
    }

    const reviewRepo = AppDataSource.getRepository(Review);

    // Check for existing review
    const existing = await reviewRepo.findOne({
      where: { reviewerId: userId, targetType, targetId },
    });
    if (existing) {
      return res.status(409).json({ error: "You have already reviewed this item" });
    }

    // Determine verified purchase status
    let isVerifiedPurchase = false;
    if (orderId) {
      const orderRepo = AppDataSource.getRepository(Order);
      const order = await orderRepo.findOne({
        where: { id: orderId, buyerId: userId, status: "delivered" as any },
      });
      if (order) {
        isVerifiedPurchase = true;
      }
    }

    const review = reviewRepo.create({
      reviewerId: userId,
      targetType,
      targetId,
      rating: Math.round(rating * 2) / 2, // snap to nearest 0.5
      title: title || null,
      body: body || null,
      isVerifiedPurchase,
      orderId: isVerifiedPurchase ? orderId : null,
      visible: true,
    });

    await reviewRepo.save(review);

    // Update aggregate rating on target entity
    await updateTargetRatings(targetType, targetId);

    res.status(201).json({ success: true, review });
  } catch (error: any) {
    console.error("POST review error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /v1/reviews/:reviewId/helpful — Mark review as helpful
 * Auth required
 */
router.post("/:reviewId/helpful", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { reviewId } = req.params;
    const reviewRepo = AppDataSource.getRepository(Review);

    const review = await reviewRepo.findOne({ where: { id: reviewId } });
    if (!review) return res.status(404).json({ error: "Review not found" });

    const voters = review.helpfulVoterIds || [];
    if (voters.includes(userId)) {
      return res.status(409).json({ error: "Already voted", helpfulCount: review.helpfulCount });
    }

    voters.push(userId);
    review.helpfulVoterIds = voters;
    review.helpfulCount = voters.length;
    await reviewRepo.save(review);

    res.json({ success: true, helpfulCount: review.helpfulCount });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /v1/reviews/:reviewId — Delete own review
 * Auth required
 */
router.delete("/:reviewId", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { reviewId } = req.params;
    const reviewRepo = AppDataSource.getRepository(Review);

    const review = await reviewRepo.findOne({ where: { id: reviewId, reviewerId: userId } });
    if (!review) return res.status(404).json({ error: "Review not found or not yours" });

    const { targetType, targetId } = review;
    await reviewRepo.softRemove(review);

    // Recalculate ratings
    await updateTargetRatings(targetType, targetId);

    res.json({ success: true, message: "Review deleted" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update aggregate rating/review counts on target entity after review changes.
 */
async function updateTargetRatings(targetType: string, targetId: string) {
  const reviewRepo = AppDataSource.getRepository(Review);

  const stats = await reviewRepo
    .createQueryBuilder("review")
    .where("review.targetType = :targetType", { targetType })
    .andWhere("review.targetId = :targetId", { targetId })
    .andWhere("review.visible = true")
    .andWhere("review.deletedAt IS NULL")
    .select([
      "COUNT(*) as total",
      "SUM(CASE WHEN review.isVerifiedPurchase = true THEN 1 ELSE 0 END) as verified",
      "AVG(review.rating) as avg",
    ])
    .getRawOne();

  const totalCount = parseInt(stats.total) || 0;
  const verifiedCount = parseInt(stats.verified) || 0;
  const avgRating = parseFloat(stats.avg) || 0;
  const roundedRating = Math.round(avgRating * 100) / 100;

  try {
    if (targetType === "product") {
      await AppDataSource.getRepository(Product).update(targetId, {
        rating: roundedRating,
        reviewCount: totalCount,
        verifiedReviewCount: verifiedCount,
      });
    } else if (targetType === "designer") {
      await AppDataSource.getRepository(Designer).update(targetId, {
        rating: roundedRating,
        reviewCount: totalCount,
        verifiedReviewCount: verifiedCount,
      });
    } else if (targetType === "producer") {
      await AppDataSource.getRepository(Producer).update(targetId, {
        rating: roundedRating,
        reviewCount: totalCount,
        verifiedReviewCount: verifiedCount,
      });
    }
    // service: handle when Service entity gets review columns
  } catch (err) {
    console.error("Failed to update target ratings:", err);
  }
}

export default router;
