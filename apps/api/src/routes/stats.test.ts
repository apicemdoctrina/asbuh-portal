import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import prisma from "../lib/prisma.js";
import { signAccessToken } from "../lib/tokens.js";

vi.mock("../lib/prisma.js", () => {
  const mockPrisma = {
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
    section: {
      count: vi.fn(),
      findUnique: vi.fn(),
    },
    user: {
      count: vi.fn(),
      findUnique: vi.fn(),
    },
    rolePermission: { count: vi.fn() },
    auditLog: { create: vi.fn() },
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

// Mock upload to prevent multer import issues from organizations router
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
const clientToken = signAccessToken({ userId: "client-id", roles: ["client"] });

/** Mock permission check to return different results based on entity/action. */
function mockPermissionByEntity(map: Record<string, boolean>) {
  (prisma.rolePermission.count as ReturnType<typeof vi.fn>).mockImplementation(
    (args: { where: { permission: { entity: string; action: string } } }) => {
      const key = `${args.where.permission.entity}:${args.where.permission.action}`;
      return Promise.resolve(map[key] ? 1 : 0);
    },
  );
}

const recentOrgs = [
  {
    id: "org1",
    name: "Test Org",
    inn: "1234567890",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    section: { id: "s1", number: 1, name: "Section 1" },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/stats", () => {
  it("401: returns error without token", async () => {
    const res = await request(app).get("/api/stats");
    expect(res.status).toBe(401);
  });

  it("200: admin sees all fields (orgs, sections, users, documents)", async () => {
    // Admin has all permissions
    mockPermissionByEntity({ "section:view": true });

    (prisma.organization.count as ReturnType<typeof vi.fn>).mockResolvedValue(42);
    (prisma.organization.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([
      { status: "active", _count: { _all: 35 } },
      { status: "new", _count: { _all: 7 } },
    ]);
    (prisma.organizationDocument.count as ReturnType<typeof vi.fn>).mockResolvedValue(120);
    (prisma.organization.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(recentOrgs) // recent orgs
      .mockResolvedValueOnce([]); // completeness data
    (prisma.section.count as ReturnType<typeof vi.fn>).mockResolvedValue(8);
    (prisma.user.count as ReturnType<typeof vi.fn>).mockResolvedValue(15);

    const res = await request(app).get("/api/stats").set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.organizations.total).toBe(42);
    expect(res.body.organizations.byStatus).toEqual({ active: 35, new: 7 });
    expect(res.body.sections).toBe(8);
    expect(res.body.users).toBe(15);
    expect(res.body.documents).toBe(120);
    expect(res.body.recentOrganizations).toHaveLength(1);
    expect(res.body.recentOrganizations[0].name).toBe("Test Org");
  });

  it("200: manager sees scoped orgs + sections, users = null", async () => {
    // Manager has section:view but is not admin
    mockPermissionByEntity({ "section:view": true });

    (prisma.organization.count as ReturnType<typeof vi.fn>).mockResolvedValue(10);
    (prisma.organization.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([
      { status: "active", _count: { _all: 10 } },
    ]);
    (prisma.organizationDocument.count as ReturnType<typeof vi.fn>).mockResolvedValue(25);
    (prisma.organization.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(recentOrgs) // recent orgs
      .mockResolvedValueOnce([]); // completeness data
    (prisma.section.count as ReturnType<typeof vi.fn>).mockResolvedValue(3);

    const res = await request(app).get("/api/stats").set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.organizations.total).toBe(10);
    expect(res.body.sections).toBe(3);
    expect(res.body.users).toBeNull();
    expect(res.body.documents).toBe(25);
  });

  it("200: client sees scoped orgs, sections = null, users = null", async () => {
    // Client has no section:view permission
    mockPermissionByEntity({ "section:view": false });

    (prisma.organization.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    (prisma.organization.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([
      { status: "active", _count: { _all: 2 } },
    ]);
    (prisma.organizationDocument.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);
    (prisma.organization.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(recentOrgs) // recent orgs
      .mockResolvedValueOnce([]); // completeness data

    const res = await request(app).get("/api/stats").set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.organizations.total).toBe(2);
    expect(res.body.sections).toBeNull();
    expect(res.body.users).toBeNull();
    expect(res.body.documents).toBe(5);
  });

  it("200: byStatus is an object, not an array", async () => {
    mockPermissionByEntity({ "section:view": false });

    (prisma.organization.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);
    (prisma.organization.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([
      { status: "active", _count: { _all: 3 } },
      { status: "new", _count: { _all: 2 } },
    ]);
    (prisma.organizationDocument.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.organization.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await request(app).get("/api/stats").set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(200);
    const byStatus = res.body.organizations.byStatus;
    expect(byStatus).not.toBeInstanceOf(Array);
    expect(typeof byStatus).toBe("object");
    expect(byStatus.active).toBe(3);
    expect(byStatus.new).toBe(2);
  });
});
