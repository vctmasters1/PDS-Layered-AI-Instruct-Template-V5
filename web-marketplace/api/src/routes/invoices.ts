import { Router, Request, Response } from "express";
import AppDataSource from "../database.js";
import { Invoice, InvoiceType, InvoiceStatus } from "../entities/invoice.js";
import { verifyToken } from "./auth.js";
import { invoiceService } from "../services/invoiceService.js";

const router = Router();

/**
 * GET /v1/invoices
 * List the authenticated user's invoices.
 * Query params: ?type=messaging_fee&status=paid&limit=50&offset=0
 */
router.get("/", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { type, status, limit, offset } = req.query;

    const result = await invoiceService.getUserInvoices(userId, {
      type: type as InvoiceType | undefined,
      status: status as InvoiceStatus | undefined,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });

    res.json(result);
  } catch (error: any) {
    console.error("Error fetching invoices:", error);
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

/**
 * GET /v1/invoices/summary/totals
 * Get invoice totals summary for the authenticated user.
 * NOTE: Must be defined BEFORE /:id to prevent "summary" matching as :id
 */
router.get("/summary/totals", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const repo = AppDataSource.getRepository(Invoice);

    const result = await repo
      .createQueryBuilder("inv")
      .select("inv.type", "type")
      .addSelect("inv.status", "status")
      .addSelect("COUNT(*)", "count")
      .addSelect("SUM(inv.amount)", "totalAmount")
      .addSelect("SUM(inv.platformFee)", "totalPlatformFee")
      .where("inv.userId = :userId", { userId })
      .groupBy("inv.type")
      .addGroupBy("inv.status")
      .getRawMany();

    res.json({ summary: result });
  } catch (error: any) {
    console.error("Error fetching invoice summary:", error);
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

/**
 * GET /v1/invoices/:id
 * Get a single invoice (must belong to the authenticated user).
 */
router.get("/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const repo = AppDataSource.getRepository(Invoice);
    const invoice = await repo.findOne({
      where: { id, userId },
    });

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    res.json(invoice);
  } catch (error: any) {
    console.error("Error fetching invoice:", error);
    res.status(500).json({ error: "Failed to fetch invoice" });
  }
});

export default router;
