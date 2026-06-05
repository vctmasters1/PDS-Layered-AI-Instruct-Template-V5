import { Router, Request, Response, NextFunction } from "express";
import { Lease } from "@db-central/entities/lease.js";
import { LeaseRepository } from "../../repositories/LeaseRepository.js";

export const leasesRouter = Router();

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

// ── GET /api/v1/leases - List leases for account ─────────────────────────────
leasesRouter.get("/", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new LeaseRepository(req.accountId!);
    const leases = await repo.findAll();
    return res.json({ data: leases });
  } catch (error) {
    return res.status(500).json({ error: "Failed to list leases" });
  }
});

// ── GET /api/v1/leases/:id - Get lease details ───────────────────────────────
leasesRouter.get("/:id", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new LeaseRepository(req.accountId!);
    const lease = await repo.findById(req.params.id);
    
    if (!lease) {
      return res.status(404).json({ error: "Lease not found" });
    }
    
    return res.json({ data: lease });
  } catch (error) {
    return res.status(500).json({ error: "Failed to get lease details" });
  }
});

// ── POST /api/v1/leases - Create new lease ───────────────────────────────────
leasesRouter.post("/", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new LeaseRepository(req.accountId!);
    const lease = await repo.create(req.body);
    return res.status(201).json({ data: lease });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create lease" });
  }
});

// ── PUT /api/v1/leases/:id - Update lease ────────────────────────────────────
leasesRouter.put("/:id", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new LeaseRepository(req.accountId!);
    const lease = await repo.update(req.params.id, req.body);
    
    if (!lease) {
      return res.status(404).json({ error: "Lease not found" });
    }
    
    return res.json({ data: lease });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update lease" });
  }
});

// ── DELETE /api/v1/leases/:id - Soft delete lease ────────────────────────────
leasesRouter.delete("/:id", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new LeaseRepository(req.accountId!);
    const deleted = await repo.softDelete(req.params.id);
    
    if (!deleted) {
      return res.status(404).json({ error: "Lease not found" });
    }
    
    return res.json({ message: "Lease deleted successfully" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete lease" });
  }
});

// ── PATCH /api/v1/leases/:id/status - Update lease status ───────────────────
leasesRouter.patch("/:id/status", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new LeaseRepository(req.accountId!);
    const { status } = req.body;
    
    if (!status || !Lease.Status[status as keyof typeof Lease.Status]) {
      return res.status(400).json({ error: "Invalid lease status" });
    }
    
    const lease = await repo.updateStatus(req.params.id, status);
    
    if (!lease) {
      return res.status(404).json({ error: "Lease not found" });
    }
    
    return res.json({ data: lease });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update lease status" });
  }
});