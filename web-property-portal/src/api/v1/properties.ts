import { Router, Request, Response, NextFunction } from "express";
import { PropertyRepository } from "../../repositories/PropertyRepository.js";

export const propertiesRouter = Router();

// ── Express request with account context ─────────────────────────────────────
interface AuthRequest extends Request {
  accountId?: string;
}

// ── Middleware to extract account from auth header or JWT ────────────────────
const extractAccount = (req: AuthRequest, res: Response, next: NextFunction) => {
  const accountId = req.headers["x-account-id"]?.toString();
  if (!accountId) {
    return res.status(401).json({ error: "Missing account ID" });
  }
  req.accountId = accountId;
  next();
};

// ── GET /api/v1/properties - List properties for account ─────────────────────
propertiesRouter.get("/", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new PropertyRepository(req.accountId!);
    const properties = await repo.findAll();
    return res.json({ data: properties });
  } catch (error) {
    return res.status(500).json({ error: "Failed to list properties" });
  }
});

// ── GET /api/v1/properties/:id - Get property details ────────────────────────
propertiesRouter.get("/:id", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new PropertyRepository(req.accountId!);
    const property = await repo.findById(req.params.id);
    
    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }
    
    return res.json({ data: property });
  } catch (error) {
    return res.status(500).json({ error: "Failed to get property details" });
  }
});

// ── POST /api/v1/properties - Create new property ────────────────────────────
propertiesRouter.post("/", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new PropertyRepository(req.accountId!);
    const property = await repo.create(req.body);
    return res.status(201).json({ data: property });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create property" });
  }
});

// ── PUT /api/v1/properties/:id - Update property ─────────────────────────────
propertiesRouter.put("/:id", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new PropertyRepository(req.accountId!);
    const property = await repo.update(req.params.id, req.body);
    
    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }
    
    return res.json({ data: property });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update property" });
  }
});

// ── DELETE /api/v1/properties/:id - Delete property (soft delete) ────────────
propertiesRouter.delete("/:id", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new PropertyRepository(req.accountId!);
    const deleted = await repo.softDelete(req.params.id);
    
    if (!deleted) {
      return res.status(404).json({ error: "Property not found" });
    }
    
    return res.json({ message: "Property deleted successfully" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete property" });
  }
});