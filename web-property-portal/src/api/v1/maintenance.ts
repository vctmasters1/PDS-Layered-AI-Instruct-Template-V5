import { Router, Request, Response, NextFunction } from "express";
import { MaintenanceRequest } from "@db-central/entities/maintenance_request.js";
import { MaintenanceRepository } from "../../repositories/MaintenanceRepository.js";

export const maintenanceRouter = Router();

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

// ── GET /api/v1/maintenance - List maintenance requests for account ──────────
maintenanceRouter.get("/", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new MaintenanceRepository(req.accountId!);
    const requests = await repo.findAll();
    return res.json({ data: requests });
  } catch (error) {
    return res.status(500).json({ error: "Failed to list maintenance requests" });
  }
});

// ── GET /api/v1/maintenance/:id - Get request details ───────────────────────
maintenanceRouter.get("/:id", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new MaintenanceRepository(req.accountId!);
    const request = await repo.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({ error: "Maintenance request not found" });
    }
    
    return res.json({ data: request });
  } catch (error) {
    return res.status(500).json({ error: "Failed to get maintenance request details" });
  }
});

// ── POST /api/v1/maintenance - Create new maintenance request ───────────────
maintenanceRouter.post("/", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new MaintenanceRepository(req.accountId!);
    const request = await repo.create(req.body);
    return res.status(201).json({ data: request });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create maintenance request" });
  }
});

// ── PUT /api/v1/maintenance/:id - Update request ─────────────────────────────
maintenanceRouter.put("/:id", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new MaintenanceRepository(req.accountId!);
    const request = await repo.update(req.params.id, req.body);
    
    if (!request) {
      return res.status(404).json({ error: "Maintenance request not found" });
    }
    
    return res.json({ data: request });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update maintenance request" });
  }
});

// ── DELETE /api/v1/maintenance/:id - Soft delete request ─────────────────────
maintenanceRouter.delete("/:id", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new MaintenanceRepository(req.accountId!);
    const deleted = await repo.softDelete(req.params.id);
    
    if (!deleted) {
      return res.status(404).json({ error: "Maintenance request not found" });
    }
    
    return res.json({ message: "Maintenance request deleted successfully" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete maintenance request" });
  }
});

// ── PATCH /api/v1/maintenance/:id/status - Update request status ─────────────
maintenanceRouter.patch("/:id/status", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new MaintenanceRepository(req.accountId!);
    const { status } = req.body;
    
    if (!status || !MaintenanceRequest.Status[status as keyof typeof MaintenanceRequest.Status]) {
      return res.status(400).json({ error: "Invalid request status" });
    }
    
    const request = await repo.updateStatus(req.params.id, status);
    
    if (!request) {
      return res.status(404).json({ error: "Maintenance request not found" });
    }
    
    return res.json({ data: request });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update maintenance request status" });
  }
});