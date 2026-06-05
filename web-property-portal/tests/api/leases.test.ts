import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import request from "supertest";
import express from "express";

// Mock the repositories
jest.mock("../../src/repositories/LeaseRepository", () => {
  return {
    __esModule: true,
    LeaseRepository: class {
      constructor(private accountId: string) {}
      
      async findAll() {
        return [
          {
            id: "lease-001",
            propertyId: "prop-001",
            tenantId: "tenant-001",
            monthlyRent: 1500,
            status: "active",
          },
        ];
      }
      
      async findById(id: string) {
        if (id === "lease-001") {
          return { id, propertyId: "prop-001", tenantId: "tenant-001", accountId: this.accountId };
        }
        return null;
      }
      
      async create(data: any) {
        return { id: "new-lease", ...data, accountId: this.accountId };
      }
      
      async update(id: string, data: any) {
        if (id === "lease-001") {
          return { id, ...data, accountId: this.accountId };
        }
        return null;
      }
      
      async softDelete(id: string) {
        if (id === "lease-001") {
          return { id, deletedAt: new Date(), accountId: this.accountId };
        }
        return null;
      }

      async updateStatus(id: string, status: any) {
        if (id === "lease-001") {
          return { id, status, accountId: this.accountId };
        }
        return null;
      }
    },
  };
});

describe("Leases API", () => {
  let app: express.Express;

  beforeEach(() => {
    const app = express();
    const { leasesRouter } = require("../../src/api/v1/leases");
    app.use("/api/v1", leasesRouter);
  });

  describe("GET /api/v1/leases", () => {
    it("should list all leases for an account", async () => {
      const response = await request(app)
        .get("/api/v1/leases")
        .set("x-account-id", "test-account-id");

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe("POST /api/v1/leases", () => {
    it("should create a new lease", async () => {
      const response = await request(app)
        .post("/api/v1/leases")
        .set("x-account-id", "test-account-id")
        .send({
          propertyId: "prop-001",
          tenantId: "tenant-001",
          monthlyRent: 2000,
          startDate: "2024-06-01",
          status: "active",
        });

      expect(response.status).toBe(201);
    });
  });

  describe("PATCH /api/v1/leases/:id/status", () => {
    it("should update lease status", async () => {
      const response = await request(app)
        .patch("/api/v1/leases/lease-001/status")
        .set("x-account-id", "test-account-id")
        .send({ status: "expired" });

      expect(response.status).toBe(200);
    });
  });
});