import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import AppDataSource from "../database.js";
import {
  Report,
  ReportCategory,
  ReportEntityType,
  ReportStatus,
} from "../entities/report.js";
import { User } from "../entities/user.js";
import { Product } from "../entities/product.js";
import { Message } from "../entities/message.js";
import { BulletinCard } from "../entities/bulletin-card.js";
import { verifyToken } from "./auth.js";

const router = Router();
const NODE_ENV = process.env.NODE_ENV || "development";

// Rate-limit report submissions to prevent abuse
const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: NODE_ENV === "production" ? 10 : 500,
  message: { error: "Too many reports submitted. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const validCategories = Object.values(ReportCategory);
const validEntityTypes = Object.values(ReportEntityType);

// ============================================================================
// POST /v1/reports — Submit a report
// ============================================================================
router.post("/", verifyToken, reportLimiter, async (req: Request, res: Response) => {
  try {
    const reporterUserId = (req as any).userId;
    const { reportedUserId, entityType, entityId, category, description } = req.body;

    // ── Validate required fields ──────────────────────────────────
    if (!category || !validCategories.includes(category)) {
      return res.status(400).json({
        error: `Invalid category. Must be one of: ${validCategories.join(", ")}`,
      });
    }

    if (!entityType || !validEntityTypes.includes(entityType)) {
      return res.status(400).json({
        error: `Invalid entityType. Must be one of: ${validEntityTypes.join(", ")}`,
      });
    }

    if (!description || typeof description !== "string" || description.trim().length < 10) {
      return res.status(400).json({
        error: "Description is required and must be at least 10 characters.",
      });
    }

    if (description.trim().length > 2000) {
      return res.status(400).json({
        error: "Description must not exceed 2000 characters.",
      });
    }

    // ── Cannot report yourself ────────────────────────────────────
    if (reportedUserId && reportedUserId === reporterUserId) {
      return res.status(400).json({ error: "You cannot report yourself." });
    }

    // ── Validate reported user exists (if provided) ───────────────
    if (reportedUserId) {
      const userRepo = AppDataSource.getRepository(User);
      const reportedUser = await userRepo.findOne({ where: { id: reportedUserId } });
      if (!reportedUser) {
        return res.status(404).json({ error: "Reported user not found." });
      }
    }

    // ── Validate referenced entity exists ─────────────────────────
    if (entityId) {
      let exists = false;
      switch (entityType) {
        case ReportEntityType.PRODUCT: {
          const repo = AppDataSource.getRepository(Product);
          exists = !!(await repo.findOne({ where: { id: entityId } }));
          break;
        }
        case ReportEntityType.MESSAGE: {
          const repo = AppDataSource.getRepository(Message);
          exists = !!(await repo.findOne({ where: { id: entityId } }));
          break;
        }
        case ReportEntityType.BULLETIN_CARD: {
          const repo = AppDataSource.getRepository(BulletinCard);
          exists = !!(await repo.findOne({ where: { id: entityId } }));
          break;
        }
        case ReportEntityType.USER: {
          const repo = AppDataSource.getRepository(User);
          exists = !!(await repo.findOne({ where: { id: entityId } }));
          break;
        }
      }
      if (!exists) {
        return res.status(404).json({ error: `Reported ${entityType} not found.` });
      }
    }

    // ── Prevent duplicate pending reports ─────────────────────────
    const reportRepo = AppDataSource.getRepository(Report);
    const existing = await reportRepo.findOne({
      where: {
        reporterUserId,
        reportedUserId: reportedUserId || undefined,
        entityType,
        entityId: entityId || undefined,
        status: ReportStatus.PENDING,
      },
    });
    if (existing) {
      return res.status(409).json({
        error: "You already have a pending report for this item.",
      });
    }

    // ── Create report ─────────────────────────────────────────────
    const report = reportRepo.create({
      reporterUserId,
      reportedUserId: reportedUserId || null,
      entityType,
      entityId: entityId || null,
      category,
      description: description.trim(),
      status: ReportStatus.PENDING,
    });

    await reportRepo.save(report);

    res.status(201).json({
      message: "Report submitted successfully. Our team will review it shortly.",
      reportId: report.id,
    });
  } catch (error) {
    console.error("Error submitting report:", error);
    res.status(500).json({ error: "Failed to submit report." });
  }
});

// ============================================================================
// GET /v1/reports/my — List the current user's reports
// ============================================================================
router.get("/my", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const reportRepo = AppDataSource.getRepository(Report);

    const reports = await reportRepo.find({
      where: { reporterUserId: userId },
      order: { createdAt: "DESC" },
      take: 50,
    });

    res.json(reports);
  } catch (error) {
    console.error("Error fetching user reports:", error);
    res.status(500).json({ error: "Failed to fetch reports." });
  }
});

export default router;
