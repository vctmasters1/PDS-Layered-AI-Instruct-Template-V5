import { Router, Request, Response } from "express";
import AppDataSource from "../database.js";
import { Payout, PayoutStatus } from "../entities/payout.js";
import { verifyToken } from "./auth.js";
import { payoutService } from "../services/payoutService.js";

const router = Router();

/**
 * GET /v1/payouts
 * List the authenticated user's payouts.
 * Query params: ?status=completed&limit=50&offset=0
 */
router.get("/", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { status, limit, offset } = req.query;

    const repo = AppDataSource.getRepository(Payout);
    const qb = repo
      .createQueryBuilder("p")
      .where("p.userId = :userId", { userId })
      .orderBy("p.createdAt", "DESC");

    if (status) {
      qb.andWhere("p.status = :status", { status });
    }

    const total = await qb.getCount();
    const payouts = await qb
      .take(limit ? parseInt(limit as string, 10) : 50)
      .skip(offset ? parseInt(offset as string, 10) : 0)
      .getMany();

    res.json({ payouts, total });
  } catch (error: any) {
    console.error("Error fetching payouts:", error);
    res.status(500).json({ error: "Failed to fetch payouts" });
  }
});

/**
 * GET /v1/payouts/summary
 * Get payout summary (total earned, pending, held, completed, fees).
 */
router.get("/summary", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const summary = await payoutService.getUserPayoutSummary(userId);

    // Don't send all payout records in summary — just the totals
    const { payouts, ...totals } = summary;
    res.json(totals);
  } catch (error: any) {
    console.error("Error fetching payout summary:", error);
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

/**
 * GET /v1/payouts/connect/status
 * Check the user's Stripe Connect onboarding status.
 * NOTE: Must be defined BEFORE /:id to prevent "connect" matching as :id
 */
router.get("/connect/status", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const status = await payoutService.checkConnectStatus(userId);
    res.json(status);
  } catch (error: any) {
    console.error("Stripe Connect status error:", error);
    res.status(500).json({ error: "Failed to check status" });
  }
});

/**
 * GET /v1/payouts/:id
 * Get a single payout (must belong to the authenticated user).
 */
router.get("/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const repo = AppDataSource.getRepository(Payout);
    const payout = await repo.findOne({
      where: { id, userId },
      relations: ["invoice"],
    });

    if (!payout) {
      return res.status(404).json({ error: "Payout not found" });
    }

    res.json(payout);
  } catch (error: any) {
    console.error("Error fetching payout:", error);
    res.status(500).json({ error: "Failed to fetch payout" });
  }
});

/**
 * POST /v1/payouts/connect/onboard
 * Start or resume Stripe Connect onboarding for the authenticated user.
 * Returns a URL to redirect the user to Stripe's hosted onboarding flow.
 */
router.post("/connect/onboard", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const result = await payoutService.createConnectAccount(userId);
    res.json(result);
  } catch (error: any) {
    console.error("Stripe Connect onboarding error:", error);
    res.status(500).json({ error: "Failed to start onboarding" });
  }
});

export default router;
