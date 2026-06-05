import { Router, Request, Response, NextFunction } from "express";
import { DocumentRepository } from "../../repositories/DocumentRepository.js";

export const documentsRouter = Router();

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

// ── GET /api/v1/documents - List documents for account ───────────────────────
documentsRouter.get("/", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new DocumentRepository(req.accountId!);
    const documents = await repo.findAll();
    return res.json({ data: documents });
  } catch (error) {
    return res.status(500).json({ error: "Failed to list documents" });
  }
});

// ── GET /api/v1/documents/:id - Get document details ─────────────────────────
documentsRouter.get("/:id", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new DocumentRepository(req.accountId!);
    const document = await repo.findById(req.params.id);
    
    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }
    
    return res.json({ data: document });
  } catch (error) {
    return res.status(500).json({ error: "Failed to get document details" });
  }
});

// ── POST /api/v1/documents - Create new document ─────────────────────────────
documentsRouter.post("/", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new DocumentRepository(req.accountId!);
    const document = await repo.create(req.body);
    return res.status(201).json({ data: document });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create document" });
  }
});

// ── PUT /api/v1/documents/:id - Update document ──────────────────────────────
documentsRouter.put("/:id", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new DocumentRepository(req.accountId!);
    const document = await repo.update(req.params.id, req.body);
    
    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }
    
    return res.json({ data: document });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update document" });
  }
});

// ── DELETE /api/v1/documents/:id - Soft delete document ──────────────────────
documentsRouter.delete("/:id", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new DocumentRepository(req.accountId!);
    const deleted = await repo.softDelete(req.params.id);
    
    if (!deleted) {
      return res.status(404).json({ error: "Document not found" });
    }
    
    return res.json({ message: "Document deleted successfully" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete document" });
  }
});

// ── GET /api/v1/documents/:id/download - Get S3 download URL ─────────────────
documentsRouter.get("/:id/download", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new DocumentRepository(req.accountId!);
    const document = await repo.findById(req.params.id);
    
    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }
    
    // TODO: Generate signed S3 URL
    const downloadUrl = `https://${document.s3Bucket}.s3.amazonaws.com/${document.s3Key}`;
    
    return res.json({ 
      downloadUrl,
      s3Key: document.s3Key,
      contentType: document.contentType,
      fileName: document.title,
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to generate download URL" });
  }
});