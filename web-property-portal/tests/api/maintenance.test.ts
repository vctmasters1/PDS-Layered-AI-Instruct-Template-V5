import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import request from "supertest";
import express from "express";

// Mock the repositories
jest.mock("../../src/repositories/MaintenanceRepository", () => {
  return {
    __esModule: true,
    MaintenanceRepository: class {
      constructor(private accountId: string) {}
      
      async findAll() {
        return [
          {
            id: "maint-001",
            title: "Leaky faucet in kitchen",
            category: "plumbing",
            status: "in_progress",
          },
        ];
      }
      
      async findById(id: string) {
        if (id === "maint-001") {
          return { id, title: "Leaky faucet", accountId: this.accountId };
        }
        return null;
      }
      
      async create(data: any) {
        return { id: "new-maint", ...data, accountId: this.accountId };
      }
      
      async update(id: string, data: any) {
        if (id === "maint-001") {
          return { id, ...data, accountId: this.accountId };
        }
        return null;
      }
      
      async softDelete(id: string) {
        if (id === "maint-001") {
          return { id, deletedAt: new Date(), accountId: this.accountId };
        }
        return null;
      }

      async updateStatus(id: string, status: any) {
        if (id === "maint-001") {
          return { id, status, accountId: this.accountId };
        }
        return null;
      }
    },
  };
});

describe("Maintenance API", () => {
  let app: express.Express;

  beforeEach(() => {
    const app = express();
    const { maintenanceRouter } = require("../../src/api/v1/maintenance");
    app.use("/api/v1", maintenanceRouter);
  });

  describe("GET /api/v1/maintenance", () => {
    it("should list all maintenance requests for an account", async () => {
      const response = await request(app)
        .get("/api/v1/maintenance")
        .set("x-account-id", "test-account-id");

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe("POST /api/v1/maintenance", () => {
    it("should create a new maintenance request", async () => {
      const response = await request(app)
        .post("/api/v1/maintenance")
        .set("x-account-id", "test-account-id")
        .send({
          propertyId: "prop-001",
          title: "Broken heater",
          description: "Heater is not working in apartment 3B",
          category: "heating",
          priority: "high",
        });

      expect(response.status).toBe(201);
    });
  });

  describe("PATCH /api/v1/maintenance/:id/status", () => {
    it("should update maintenance request status", async () => {
      const response = await request(app)
        .patch("/api/v1/maintenance/maint-001/status")
        .set("x-account-id", "test-account-id")
        .send({ status: "completed" });

      expect(response.status).toBe(200);
    });
  });
});