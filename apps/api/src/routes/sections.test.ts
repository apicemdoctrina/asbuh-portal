import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import prisma from "../lib/prisma.js";
import { signAccessToken } from "../lib/tokens.js";

vi.mock("../lib/prisma.js", () => {
  const mockPrisma = {
    section: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    sectionMember: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    rolePermission: { count: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { default: mockPrisma };
});

const adminToken = signAccessToken({ userId: "admin-id", roles: ["admin"] });
const managerToken = signAccessToken({ userId: "manager-id", roles: ["manager"] });
const accountantToken = signAccessToken({ userId: "acc-id", roles: ["accountant"] });
const clientToken = signAccessToken({ userId: "client-id", roles: ["client"] });

function mockPermission(allowed: boolean) {
  (prisma.rolePermission.count as ReturnType<typeof vi.fn>).mockResolvedValue(allowed ? 1 : 0);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/sections", () => {
  it("admin: returns all sections (200)", async () => {
    mockPermission(true);
    const sections = [
      { id: "s1", number: 1, name: "Section 1", _count: { members: 2, organizations: 3 } },
    ];
    (prisma.section.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(sections);
    (prisma.section.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await request(app)
      .get("/api/sections")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.sections).toHaveLength(1);
    expect(res.body.total).toBe(1);

    // Admin should see all — no SectionMember filter in where
    const findManyCall = (prisma.section.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findManyCall.where).not.toHaveProperty("members");
  });

  it("manager: returns only scoped sections (200)", async () => {
    mockPermission(true);
    (prisma.section.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.section.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await request(app)
      .get("/api/sections")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(200);

    // Manager should have SectionMember filter
    const findManyCall = (prisma.section.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findManyCall.where).toHaveProperty("members");
    expect(findManyCall.where.members).toEqual({ some: { userId: "manager-id" } });
  });

  it("accountant: returns only scoped sections (200)", async () => {
    mockPermission(true);
    (prisma.section.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.section.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await request(app)
      .get("/api/sections")
      .set("Authorization", `Bearer ${accountantToken}`);

    expect(res.status).toBe(200);

    const findManyCall = (prisma.section.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findManyCall.where).toHaveProperty("members");
    expect(findManyCall.where.members).toEqual({ some: { userId: "acc-id" } });
  });

  it("client: returns 403 (no section:view permission)", async () => {
    mockPermission(false);

    const res = await request(app)
      .get("/api/sections")
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(403);
  });
});

describe("GET /api/sections/:id", () => {
  it("admin: can view any section (200)", async () => {
    mockPermission(true);
    (prisma.section.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s1",
      number: 1,
      name: "Section 1",
      members: [],
      organizations: [],
    });

    const res = await request(app)
      .get("/api/sections/s1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    // Admin: no member scoping in where
    const call = (prisma.section.findFirst as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where).not.toHaveProperty("members");
  });

  it("manager: returns 404 for section they are not member of", async () => {
    mockPermission(true);
    (prisma.section.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .get("/api/sections/s-other")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(404);
  });
});

describe("POST /api/sections", () => {
  it("admin: can create (201)", async () => {
    mockPermission(true);
    (prisma.section.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s-new",
      number: 5,
      name: null,
    });
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await request(app)
      .post("/api/sections")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ number: 5 });

    expect(res.status).toBe(201);
    expect(res.body.number).toBe(5);
  });

  it("manager: returns 403 (no section:create permission)", async () => {
    mockPermission(false);

    const res = await request(app)
      .post("/api/sections")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ number: 5 });

    expect(res.status).toBe(403);
  });
});

describe("PUT /api/sections/:id", () => {
  it("admin: can update (200)", async () => {
    mockPermission(true);
    (prisma.section.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s1",
      number: 1,
    });
    (prisma.section.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s1",
      number: 2,
      name: "Updated",
    });
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await request(app)
      .put("/api/sections/s1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ number: 2, name: "Updated" });

    expect(res.status).toBe(200);
  });

  it("manager: returns 403 (no section:edit permission)", async () => {
    mockPermission(false);

    const res = await request(app)
      .put("/api/sections/s1")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ name: "Updated" });

    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/sections/:id", () => {
  it("admin: can delete (200)", async () => {
    mockPermission(true);
    (prisma.section.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s1",
      number: 1,
      _count: { organizations: 0 },
    });
    (prisma.section.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await request(app)
      .delete("/api/sections/s1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });

  it("admin: cannot delete section with organizations (400)", async () => {
    mockPermission(true);
    (prisma.section.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "s1",
      number: 1,
      _count: { organizations: 3 },
    });

    const res = await request(app)
      .delete("/api/sections/s1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("organizations");
  });

  it("manager: returns 403 (no section:delete permission)", async () => {
    mockPermission(false);

    const res = await request(app)
      .delete("/api/sections/s1")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(403);
  });
});
