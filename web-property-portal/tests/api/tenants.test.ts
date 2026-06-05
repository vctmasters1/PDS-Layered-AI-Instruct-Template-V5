import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import request from "supertest";
import express from "express";

// Mock the repositories
jest.mock("../../src/repositories/TenantRepository", () => {
  return {
    __esModule: true,
    TenantRepository: class {
      constructor(private accountId: string) {}
      
      async findAll() {
        return [
          {
            id: "tenant-001",
            firstName: "John",
            lastName: "Doe",
            email: "john.doe@example.com",
            status: "active",
          },
        ];
      }
      
      async findById(id: string) {
        if (id === "tenant-001") {
          return { id, firstName: "John", lastName: "Doe", accountId: this.accountId };
        }
        return null;
      }
      
      async create(data: any) {
        return { id: "new-tenant", ...data, accountId: this.accountId };
      }
      
      async update(id: string, data: any) {
        if (id === "tenant-001") {
          return { id, ...data, accountId: this.accountId };
        }
        return null;
      }
      
      async softDelete(id: string) {
        if (id === "tenant-001") {
          return { id, deletedAt: new Date(), accountId: this.accountId };
        }
        return null;
      }
    },
  };
});

describe("Tenants API", () => {
  let app: express.Express;

  beforeEach(() => {
    const app = express();
    const { tenantsRouter } = require("../../src/api/v1/tenants");
    app.use("/api/v1", tenantsRouter);
  });

  describe("GET /api/v1/tenants", () => {
    it("should list all tenants for an account", async () => {
      const response = await request(app)
        .get("/api/v1/tenants")
        .set("x-account-id", "test-account-id");

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe("GET /api/v1/tenants/:id", () => {
    it("should get tenant by ID", async () => {
      const response = await request(app)
        .get("/api/v1/tenants/tenant-001")
        .set("x-account-id", "test-account-id");

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe("tenant-001");
    });
  });

  describe("POST /api/v1/tenants", () => {
    it("should create a new tenant", async () => {
      const response = await request(app)
        .post("/api/v1/tenants")
        .set("x-account-id", "test-account-id")
        .send({
          firstName: "Jane",
          lastName: "Smith",
          email: "jane.smith@example.com",
          phone: "555-1234",
        });

      expect(response.status).toBe(201);
    });
  });
});