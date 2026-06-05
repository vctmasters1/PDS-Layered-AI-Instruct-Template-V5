import { Router, Request, Response, NextFunction } from "express";
import { AccountService } from "../../services/AccountService.js";

export const accountRouter = Router();

// ── Express request with account context ─────────────────────────────────────
interface AuthRequest extends Request {
  accountId?: string;
  userId?: string;
}

// ── Middleware to extract account from auth header or JWT ────────────────────
const extractAccount = (req: AuthRequest, res: Response, next: NextFunction) => {
  // Extract account_id from request headers or JWT token
  const accountId = req.headers["x-account-id"]?.toString();
  if (!accountId) {
    return res.status(401).json({ error: "Missing account ID" });
  }
  req.accountId = accountId;
  next();
};

// ── GET /api/v1/account/status - Get account status and configuration ───────
accountRouter.get("/status", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const service = new AccountService(req.accountId!);
    const result = await service.getStatus();
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: "Failed to get account status" });
  }
});

// ── PUT /api/v1/account/settings - Update account settings ───────────────────
accountRouter.put("/settings", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const service = new AccountService(req.accountId!);
    const result = await service.updateSettings(req.body);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: "Failed to update account settings" });
  }
});

// ── GET /api/v1/account/usage - Get storage and usage statistics ─────────────
accountRouter.get("/usage", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const service = new AccountService(req.accountId!);
    const result = await service.getUsage();
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: "Failed to get account usage" });
  }
});

// ── POST /api/v1/account/verify - Verify account details ─────────────────────
accountRouter.post("/verify", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const service = new AccountService(req.accountId!);
    const result = await service.verifyAccount();
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: "Failed to verify account" });
  }
});