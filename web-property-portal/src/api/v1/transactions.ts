import { Router, Request, Response, NextFunction } from "express";
import { Transaction } from "@db-central/entities/transaction.js";
import { TransactionRepository } from "../../repositories/TransactionRepository.js";

export const transactionsRouter = Router();

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

// ── GET /api/v1/transactions - List transactions for account ─────────────────
transactionsRouter.get("/", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new TransactionRepository(req.accountId!);
    const transactions = await repo.findAll();
    return res.json({ data: transactions });
  } catch (error) {
    return res.status(500).json({ error: "Failed to list transactions" });
  }
});

// ── GET /api/v1/transactions/:id - Get transaction details ───────────────────
transactionsRouter.get("/:id", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new TransactionRepository(req.accountId!);
    const transaction = await repo.findById(req.params.id);
    
    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }
    
    return res.json({ data: transaction });
  } catch (error) {
    return res.status(500).json({ error: "Failed to get transaction details" });
  }
});

// ── POST /api/v1/transactions - Create new transaction ───────────────────────
transactionsRouter.post("/", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new TransactionRepository(req.accountId!);
    const transaction = await repo.create(req.body);
    return res.status(201).json({ data: transaction });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create transaction" });
  }
});

// ── PUT /api/v1/transactions/:id - Update transaction ────────────────────────
transactionsRouter.put("/:id", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new TransactionRepository(req.accountId!);
    const transaction = await repo.update(req.params.id, req.body);
    
    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }
    
    return res.json({ data: transaction });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update transaction" });
  }
});

// ── DELETE /api/v1/transactions/:id - Soft delete transaction ────────────────
transactionsRouter.delete("/:id", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new TransactionRepository(req.accountId!);
    const deleted = await repo.softDelete(req.params.id);
    
    if (!deleted) {
      return res.status(404).json({ error: "Transaction not found" });
    }
    
    return res.json({ message: "Transaction deleted successfully" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete transaction" });
  }
});

// ── PATCH /api/v1/transactions/:id/status - Update transaction status ────────
transactionsRouter.patch("/:id/status", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new TransactionRepository(req.accountId!);
    const { status } = req.body;
    
    if (!status || !Transaction.Status[status as keyof typeof Transaction.Status]) {
      return res.status(400).json({ error: "Invalid transaction status" });
    }
    
    const transaction = await repo.updateStatus(req.params.id, status);
    
    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }
    
    return res.json({ data: transaction });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update transaction status" });
  }
});

// ── GET /api/v1/transactions/basis/:basis - Filter by accounting basis ───────
transactionsRouter.get("/basis/:basis", extractAccount, async (req: AuthRequest, res: Response) => {
  try {
    const repo = new TransactionRepository(req.accountId!);
    const transactions = await repo.findByBasis(req.params.basis as "accrual" | "cash");
    return res.json({ data: transactions });
  } catch (error) {
    return res.status(500).json({ error: "Failed to filter transactions by basis" });
  }
});