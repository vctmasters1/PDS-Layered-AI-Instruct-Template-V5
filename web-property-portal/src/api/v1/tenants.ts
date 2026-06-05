import { Router, Request, Response, NextFunction } from "express";
import { TenantRepository } from "../../repositories/TenantRepository.js";

export const tenantsRouter = Router();

interface AuthRequest extends Request {
  accountId?: string;
}

const extractAccount = (req: AuthRequest, res: Response, next: NextFunction) => {
  const accountId = req.headers["x-account-id"]?.toString();
  if (!accountId) {
    return res.status(401).json({ error: "Missing account ID" });
  }
  req.accountId = accountId;
  next();
};

// ── GET /api/v1/tenants - List tenants for account ───────────────────────────
tenantsRouter.get("/", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new TenantRepository(req.accountId!);
    const tenants = await repo.findAll();
    return res.json({ data: tenants });
  } catch (error) {
    return res.status(500).json({ error: "Failed to list tenants" });
  }
});

// ── GET /api/v1/tenants/:id - Get tenant details ─────────────────────────────
tenantsRouter.get("/:id", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new TenantRepository(req.accountId!);
    const tenant = await repo.findById(req.params.id);
    
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    return res.json({ data: tenant });
  } catch (error) {
    return res.status(500).json({ error: "Failed to get tenant details" });
  }
});

// ── POST /api/v1/tenants - Create new tenant ────────────────────────────────
tenantsRouter.post("/", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new TenantRepository(req.accountId!);
    const tenant = await repo.create(req.body);
    return res.status(201).json({ data: tenant });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create tenant" });
  }
});

// ── PUT /api/v1/tenants/:id - Update tenant ─────────────────────────────────
tenantsRouter.put("/:id", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new TenantRepository(req.accountId!);
    const tenant = await repo.update(req.params.id, req.body);
    
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    return res.json({ data: tenant });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update tenant" });
  }
});

// ── DELETE /api/v1/tenants/:id - Soft delete tenant ─────────────────────────
tenantsRouter.delete("/:id", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new TenantRepository(req.accountId!);
    const deleted = await repo.softDelete(req.params.id);
    
    if (!deleted) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    return res.json({ message: "Tenant deleted successfully" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete tenant" });
  }
});