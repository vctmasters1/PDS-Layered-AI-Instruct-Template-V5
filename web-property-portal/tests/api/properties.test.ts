import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import request from "supertest";
import express from "express";

// Mock the repositories
jest.mock("../../src/repositories/PropertyRepository", () => {
  return {
    __esModule: true,
    PropertyRepository: class {
      constructor(private accountId: string) {}
      
      async findAll() {
        return [
          {
            id: "prop-001",
            name: "Test Property",
            addressStreet: "123 Main St",
            addressCity: "Test City",
            addressState: "TS",
            addressZipCode: "12345",
          },
        ];
      }
      
      async findById(id: string) {
        if (id === "prop-001") {
          return {
            id,
            name: "Test Property",
            accountId: "test-account-id",
          };
        }
        return null;
      }
      
      async create(data: any) {
        return { id: "new-prop", ...data, accountId: "test-account-id" };
      }
      
      async update(id: string, data: any) {
        if (id === "prop-001") {
          return { id, ...data, accountId: "test-account-id" };
        }
        return null;
      }
      
      async softDelete(id: string) {
        if (id === "prop-001") {
          return { id, deletedAt: new Date(), accountId: "test-account-id" };
        }
        return null;
      }
    },
  };
});

describe("Properties API", () => {
  let app: express.Express;

  beforeEach(() => {
    const app = express();
    // Import and mount the properties router
    const { propertiesRouter } = require("../../src/api/v1/properties");
    app.use("/api/v1", propertiesRouter);
  });

  describe("GET /api/v1/properties", () => {
    it("should list all properties for an account", async () => {
      const response = await request(app)
        .get("/api/v1/properties")
        .set("x-account-id", "test-account-id");

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it("should return 401 if account ID is missing", async () => {
      const response = await request(app).get("/api/v1/properties");
      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/v1/properties/:id", () => {
    it("should get property by ID", async () => {
      const response = await request(app)
        .get("/api/v1/properties/prop-001")
        .set("x-account-id", "test-account-id");

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe("prop-001");
    });

    it("should return 404 if property not found", async () => {
      const response = await request(app)
        .get("/api/v1/properties/nonexistent")
        .set("x-account-id", "test-account-id");

      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/v1/properties", () => {
    it("should create a new property", async () => {
      const response = await request(app)
        .post("/api/v1/properties")
        .set("x-account-id", "test-account-id")
        .send({
          name: "New Property",
          addressStreet: "456 Oak Ave",
          addressCity: "Test City",
          addressState: "TS",
          addressZipCode: "12345",
        });

      expect(response.status).toBe(201);
      expect(response.body.data.name).toBe("New Property");
    });
  });

  describe("PUT /api/v1/properties/:id", () => {
    it("should update a property", async () => {
      const response = await request(app)
        .put("/api/v1/properties/prop-001")
        .set("x-account-id", "test-account-id")
        .send({ name: "Updated Property Name" });

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe("Updated Property Name");
    });
  });

  describe("DELETE /api/v1/properties/:id", () => {
    it("should soft delete a property", async () => {
      const response = await request(app)
        .delete("/api/v1/properties/prop-001")
        .set("x-account-id", "test-account-id");

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Property deleted successfully");
    });
  });
});