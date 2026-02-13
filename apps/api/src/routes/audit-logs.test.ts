import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import prisma from "../lib/prisma.js";
import { signAccessToken } from "../lib/tokens.js";

vi.mock("../lib/prisma.js", () => {
  const mockPrisma = {
    auditLog: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    rolePermission: { count: vi.fn() },
    // Needed by other routers loaded in app.ts
    organization: {
      count: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    organizationDocument: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    section: { count: vi.fn(), findUnique: vi.fn() },
    user: { count: vi.fn(), findUnique: vi.fn() },
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
  };
  return { default: mockPrisma };
});

vi.mock("../lib/upload.js", async () => {
  const actualMulter = (await import("multer")).default;
  const memUpload = actualMulter({ storage: actualMulter.memoryStorage() });
  return {
    upload: memUpload,
    UPLOADS_DIR: "/tmp/test-uploads",
  };
});

const adminToken = signAccessToken({ userId: "admin-id", roles: ["admin"] });
const managerToken = signAccessToken({ userId: "manager-id", roles: ["manager"] });
const accountantToken = signAccessToken({ userId: "accountant-id", roles: ["accountant"] });
const clientToken = signAccessToken({ userId: "client-id", roles: ["client"] });

const sampleLogs = [
  {
    id: "log-1",
    userId: "user-1",
    action: "login",
    entity: "user",
    entityId: "user-1",
    details: { email: "test@example.com" },
    ipAddress: "127.0.0.1",
    createdAt: new Date("2026-01-15T10:00:00Z"),
    user: { id: "user-1", firstName: "John", lastName: "Doe" },
  },
  {
    id: "log-2",
    userId: "user-2",
    action: "org_updated",
    entity: "organization",
    entityId: "org-1",
    details: { name: "Org A" },
    ipAddress: "192.168.1.1",
    createdAt: new Date("2026-01-14T09:00:00Z"),
    user: { id: "user-2", firstName: "Jane", lastName: "Smith" },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/audit-logs", () => {
  it("200: returns list of audit logs", async () => {
    (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(sampleLogs);
    (prisma.auditLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);

    const res = await request(app)
      .get("/api/audit-logs")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(2);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(50);
    expect(res.body.data[0].user.firstName).toBe("John");
  });

  it("200: filters by entity", async () => {
    (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleLogs[1]]);
    (prisma.auditLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await request(app)
      .get("/api/audit-logs?entity=organization")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);

    const findManyCall = (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findManyCall.where.entity).toBe("organization");
  });

  it("200: filters by userId", async () => {
    (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleLogs[0]]);
    (prisma.auditLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await request(app)
      .get("/api/audit-logs?userId=user-1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const findManyCall = (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findManyCall.where.userId).toBe("user-1");
  });

  it("200: filters by date range (from/to)", async () => {
    (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleLogs[0]]);
    (prisma.auditLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await request(app)
      .get("/api/audit-logs?from=2026-01-15&to=2026-01-15")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const findManyCall = (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findManyCall.where.createdAt.gte).toEqual(new Date("2026-01-15T00:00:00.000Z"));
    expect(findManyCall.where.createdAt.lte).toEqual(new Date("2026-01-15T23:59:59.999Z"));
  });

  it("200: search by action/entityId/ip", async () => {
    (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleLogs[0]]);
    (prisma.auditLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await request(app)
      .get("/api/audit-logs?search=login")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const findManyCall = (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findManyCall.where.OR).toHaveLength(3);
    expect(findManyCall.where.OR[0]).toEqual({
      action: { contains: "login", mode: "insensitive" },
    });
  });

  it("200: pagination (page/limit)", async () => {
    (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleLogs[1]]);
    (prisma.auditLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);

    const res = await request(app)
      .get("/api/audit-logs?page=2&limit=1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(1);

    const findManyCall = (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findManyCall.skip).toBe(1);
    expect(findManyCall.take).toBe(1);
  });

  it("200: sanitizes sensitive keys in details", async () => {
    const logWithSensitive = {
      ...sampleLogs[0],
      details: {
        password: "secret123",
        login: "admin",
        tokenHash: "abc",
        nested: { refreshToken: "xyz", safe: "ok" },
        normalField: "visible",
      },
    };
    (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([logWithSensitive]);
    (prisma.auditLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await request(app)
      .get("/api/audit-logs")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const details = res.body.data[0].details;
    expect(details.password).toBe("***");
    expect(details.login).toBe("***");
    expect(details.tokenHash).toBe("***");
    expect(details.nested.refreshToken).toBe("***");
    expect(details.nested.safe).toBe("ok");
    expect(details.normalField).toBe("visible");
  });

  it("401: returns error without token", async () => {
    const res = await request(app).get("/api/audit-logs");
    expect(res.status).toBe(401);
  });

  it("403: manager cannot access audit logs", async () => {
    const res = await request(app)
      .get("/api/audit-logs")
      .set("Authorization", `Bearer ${managerToken}`);
    expect(res.status).toBe(403);
  });

  it("403: accountant cannot access audit logs", async () => {
    const res = await request(app)
      .get("/api/audit-logs")
      .set("Authorization", `Bearer ${accountantToken}`);
    expect(res.status).toBe(403);
  });

  it("403: client cannot access audit logs", async () => {
    const res = await request(app)
      .get("/api/audit-logs")
      .set("Authorization", `Bearer ${clientToken}`);
    expect(res.status).toBe(403);
  });
});
