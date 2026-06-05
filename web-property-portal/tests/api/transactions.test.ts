import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import request from "supertest";
import express from "express";

// Mock the repositories
jest.mock("../../src/repositories/TransactionRepository", () => {
  return {
    __esModule: true,
    TransactionRepository: class {
      constructor(private accountId: string) {}
      
      async findAll() {
        return [
          {
            id: "trans-001",
            type: "rent",
            amount: 2000,
            status: "completed",
            postedDate: new Date(),
          },
        ];
      }
      
      async findById(id: string) {
        if (id === "trans-001") {
          return { id, accountId: this.accountId };
        }
        return null;
      }
      
      async create(data: any) {
        return { id: "new-trans", ...data, accountId: this.accountId };
      }
      
      async update(id: string, data: any) {
        if (id === "trans-001") {
          return { id, ...data, accountId: this.accountId };
        }
        return null;
      }
      
      async softDelete(id: string) {
        if (id === "trans-001") {
          return { id, deletedAt: new Date(), accountId: this.accountId };
        }
        return null;
      }

      async updateStatus(id: string, status: any) {
        if (id === "trans-001") {
          return { id, status, accountId: this.accountId };
        }
        return null;
      }

      async findByBasis(basis: string) {
        return [
          { id: "accrual-trans", accountingBasis: basis, amount: 2000 },
        ];
      }
    },
  };
});

describe("Transactions API", () => {
  let app: express.Express;

  beforeEach(() => {
    const app = express();
    const { transactionsRouter } = require("../../src/api/v1/transactions");
    app.use("/api/v1", transactionsRouter);
  });

  describe("GET /api/v1/transactions", () => {
    it("should list all transactions for an account", async () => {
      const response = await request(app)
        .get("/api/v1/transactions")
        .set("x-account-id", "test-account-id");

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe("GET /api/v1/transactions/basis/:basis", () => {
    it("should filter transactions by accounting basis", async () => {
      const response = await request(app)
        .get("/api/v1/transactions/basis/accrual")
        .set("x-account-id", "test-account-id");

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe("POST /api/v1/transactions", () => {
    it("should create a new rent transaction", async () => {
      const response = await request(app)
        .post("/api/v1/transactions")
        .set("x-account-id", "test-account-id")
        .send({
          leaseId: "lease-001",
          type: "rent",
          amount: 2500,
          postedDate: new Date().toISOString().split("T")[0],
        });

      expect(response.status).toBe(201);
    });
  });
});