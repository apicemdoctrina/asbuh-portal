import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import prisma from "../lib/prisma.js";
import { signAccessToken } from "../lib/tokens.js";

vi.mock("../lib/prisma.js", () => {
  const mockPrisma = {
    organization: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    organizationMember: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    organizationBankAccount: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    organizationContact: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    organizationDocument: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    section: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    rolePermission: { count: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { default: mockPrisma };
});

// Mock fs.unlink to avoid actual file operations
vi.mock("node:fs/promises", () => ({
  default: { unlink: vi.fn().mockResolvedValue(undefined) },
  unlink: vi.fn().mockResolvedValue(undefined),
}));

// Mock upload middleware — use multer memoryStorage to parse multipart without disk writes
vi.mock("../lib/upload.js", async () => {
  const actualMulter = (await import("multer")).default;
  const memUpload = actualMulter({ storage: actualMulter.memoryStorage() });
  return {
    upload: memUpload,
    UPLOADS_DIR: "/tmp/test-uploads",
  };
});

const adminToken = signAccessToken({ userId: "admin-id", roles: ["admin"] });
const clientToken = signAccessToken({ userId: "client-id", roles: ["client"] });

function mockPermission(allowed: boolean) {
  (prisma.rolePermission.count as ReturnType<typeof vi.fn>).mockResolvedValue(allowed ? 1 : 0);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// --------------- POST /api/organizations/:id/documents ---------------

describe("POST /api/organizations/:id/documents", () => {
  it("upload 201: admin attaches file with type", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
    });
    (prisma.organizationDocument.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "doc1",
      organizationId: "o1",
      type: "CONTRACT",
      originalName: "contract.pdf",
      mimeType: "application/pdf",
      size: 1024,
      comment: null,
      uploadedById: "admin-id",
      createdAt: new Date().toISOString(),
      uploadedBy: { firstName: "Admin", lastName: "User" },
    });
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await request(app)
      .post("/api/organizations/o1/documents")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("type", "CONTRACT")
      .attach("file", Buffer.from("test content"), "contract.pdf");

    expect(res.status).toBe(201);
    expect(res.body.originalName).toBe("contract.pdf");
    expect(res.body).not.toHaveProperty("storagePath");
  });

  it("upload 400: POST without file", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
    });

    const res = await request(app)
      .post("/api/organizations/o1/documents")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("type", "CONTRACT");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("File is required");
  });

  it("upload 400: POST with invalid type", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
    });

    const res = await request(app)
      .post("/api/organizations/o1/documents")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("type", "INVALID_TYPE")
      .attach("file", Buffer.from("test content"), "test.pdf");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("upload 404: org not found for scoped user", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .post("/api/organizations/o-other/documents")
      .set("Authorization", `Bearer ${clientToken}`)
      .field("type", "CONTRACT")
      .attach("file", Buffer.from("test content"), "test.pdf");

    expect(res.status).toBe(404);
  });
});

// --------------- GET /api/organizations/:id/documents ---------------

describe("GET /api/organizations/:id/documents", () => {
  it("list 200: returns documents without storagePath", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
    });
    (prisma.organizationDocument.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "doc1",
        organizationId: "o1",
        type: "CONTRACT",
        originalName: "contract.pdf",
        mimeType: "application/pdf",
        size: 1024,
        comment: null,
        uploadedById: "admin-id",
        createdAt: new Date().toISOString(),
        uploadedBy: { firstName: "Admin", lastName: "User" },
      },
    ]);

    const res = await request(app)
      .get("/api/organizations/o1/documents")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).not.toHaveProperty("storagePath");
    expect(res.body[0].originalName).toBe("contract.pdf");
  });

  it("list 404: org not in scope", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .get("/api/organizations/o-other/documents")
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(404);
  });
});

// --------------- GET /api/organizations/:id/documents/:docId/download ---------------

describe("GET /api/organizations/:id/documents/:docId/download", () => {
  it("download 404: document not found", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
    });
    (prisma.organizationDocument.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .get("/api/organizations/o1/documents/doc-none/download")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Document not found");
  });

  it("download scoping: org not in scope returns 404", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .get("/api/organizations/o-other/documents/doc1/download")
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Organization not found");
  });
});

// --------------- DELETE /api/organizations/:id/documents/:docId ---------------

describe("DELETE /api/organizations/:id/documents/:docId", () => {
  it("delete 200: deletes document record", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
    });
    (prisma.organizationDocument.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "doc1",
      organizationId: "o1",
      storagePath: "abc.pdf",
      originalName: "contract.pdf",
    });
    (prisma.organizationDocument.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await request(app)
      .delete("/api/organizations/o1/documents/doc1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Document deleted");
  });

  it("delete 403: client without document:delete permission", async () => {
    mockPermission(false);

    const res = await request(app)
      .delete("/api/organizations/o1/documents/doc1")
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(403);
  });

  it("delete 404: document not found", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
    });
    (prisma.organizationDocument.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .delete("/api/organizations/o1/documents/doc-none")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Document not found");
  });

  it("delete ENOENT: file missing on disk still deletes DB record", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
    });
    (prisma.organizationDocument.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "doc1",
      organizationId: "o1",
      storagePath: "missing-file.pdf",
      originalName: "contract.pdf",
    });
    (prisma.organizationDocument.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    // fs.unlink mock already resolves, simulating "no error even if missing"

    const res = await request(app)
      .delete("/api/organizations/o1/documents/doc1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Document deleted");
    expect(prisma.organizationDocument.delete).toHaveBeenCalledWith({ where: { id: "doc1" } });
  });
});
