import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import request from "supertest";
import express from "express";

// Mock the repositories
jest.mock("../../src/repositories/DocumentRepository", () => {
  return {
    __esModule: true,
    DocumentRepository: class {
      constructor(private accountId: string) {}
      
      async findAll() {
        return [
          {
            id: "doc-001",
            title: "Lease Agreement",
            category: "lease_agreement",
            s3Key: "accounts/test-account/docs/lease.pdf",
            s3Bucket: "pds-property-docs",
            contentType: "application/pdf",
            fileSizeBytes: 102400,
          },
        ];
      }
      
      async findById(id: string) {
        if (id === "doc-001") {
          return { 
            id, 
            accountId: this.accountId,
            s3Key: "accounts/test-account/docs/lease.pdf",
            s3Bucket: "pds-property-docs",
          };
        }
        return null;
      }
      
      async create(data: any) {
        return { id: "new-doc", ...data, accountId: this.accountId };
      }
      
      async update(id: string, data: any) {
        if (id === "doc-001") {
          return { id, ...data, accountId: this.accountId };
        }
        return null;
      }
      
      async softDelete(id: string) {
        if (id === "doc-001") {
          return { id, deletedAt: new Date(), accountId: this.accountId };
        }
        return null;
      }
    },
  };
});

describe("Documents API", () => {
  let app: express.Express;

  beforeEach(() => {
    const app = express();
    const { documentsRouter } = require("../../src/api/v1/documents");
    app.use("/api/v1", documentsRouter);
  });

  describe("GET /api/v1/documents", () => {
    it("should list all documents for an account", async () => {
      const response = await request(app)
        .get("/api/v1/documents")
        .set("x-account-id", "test-account-id");

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe("GET /api/v1/documents/:id/download", () => {
    it("should get download URL for a document", async () => {
      const response = await request(app)
        .get("/api/v1/documents/doc-001/download")
        .set("x-account-id", "test-account-id");

      expect(response.status).toBe(200);
      expect(response.body.downloadUrl).toBeDefined();
      expect(response.body.s3Key).toBe("accounts/test-account/docs/lease.pdf");
    });
  });

  describe("POST /api/v1/documents", () => {
    it("should create a new document record", async () => {
      const response = await request(app)
        .post("/api/v1/documents")
        .set("x-account-id", "test-account-id")
        .send({
          title: "New Document",
          category: "other",
          s3Key: "accounts/test-account/docs/new.pdf",
          s3Bucket: "pds-property-docs",
          contentType: "application/pdf",
          fileSizeBytes: 204800,
        });

      expect(response.status).toBe(201);
    });
  });
});