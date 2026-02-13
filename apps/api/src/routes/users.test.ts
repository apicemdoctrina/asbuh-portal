import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import prisma from "../lib/prisma.js";
import { signAccessToken } from "../lib/tokens.js";

vi.mock("../lib/prisma.js", () => {
  const mockPrisma = {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    userRole: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    role: {
      findMany: vi.fn(),
    },
    refreshToken: {
      deleteMany: vi.fn(),
    },
    rolePermission: { count: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { default: mockPrisma };
});

const adminToken = signAccessToken({ userId: "admin-id", roles: ["admin"] });
const managerToken = signAccessToken({ userId: "manager-id", roles: ["manager"] });

function mockTargetUser(id: string, roles: string[], isActive = true) {
  (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
    id,
    email: "target@example.com",
    firstName: "Test",
    lastName: "User",
    isActive,
    userRoles: roles.map((r) => ({ role: { name: r } })),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── PUT /api/users/:id ───────────────────────────────────────

describe("PUT /api/users/:id", () => {
  it("403 for non-admin", async () => {
    const res = await request(app)
      .put("/api/users/some-id")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ firstName: "New" });

    expect(res.status).toBe(403);
  });

  it("400 when self-deactivating (isActive=false on self)", async () => {
    mockTargetUser("admin-id", ["admin"]);

    const res = await request(app)
      .put("/api/users/admin-id")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("себя");
  });

  it("403 when changing roles of another admin", async () => {
    mockTargetUser("other-admin-id", ["admin"]);

    const res = await request(app)
      .put("/api/users/other-admin-id")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ roleNames: ["manager"] });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("администратора");
  });

  it("400 when roleNames has more than one role", async () => {
    const res = await request(app)
      .put("/api/users/some-id")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ roleNames: ["manager", "accountant"] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("одну роль");
  });

  it("403 when changing isActive of another admin", async () => {
    mockTargetUser("other-admin-id", ["admin"]);

    const res = await request(app)
      .put("/api/users/other-admin-id")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("администратора");
  });

  it("400 when roleNames is empty array", async () => {
    const res = await request(app)
      .put("/api/users/some-id")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ roleNames: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("одну роль");
  });

  it("400 when roleNames contains invalid role", async () => {
    const res = await request(app)
      .put("/api/users/some-id")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ roleNames: ["client"] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Недопустимая роль");
  });

  it("409 when email is duplicate (P2002)", async () => {
    mockTargetUser("target-id", ["manager"]);

    const p2002 = new Error("Unique constraint failed");
    (p2002 as unknown as Record<string, string>).code = "P2002";
    (prisma.user.update as ReturnType<typeof vi.fn>).mockRejectedValue(p2002);

    const res = await request(app)
      .put("/api/users/target-id")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: "duplicate@example.com" });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("Email");
  });

  it("200 updates user and roles successfully", async () => {
    mockTargetUser("target-id", ["manager"]);

    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "target-id",
      email: "new@example.com",
      firstName: "New",
      lastName: "Name",
      isActive: true,
    });
    (prisma.userRole.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.role.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "r-acc", name: "accountant" },
    ]);
    (prisma.userRole.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    // Second findUnique call for final result
    (prisma.user.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        id: "target-id",
        email: "new@example.com",
        firstName: "New",
        lastName: "Name",
        isActive: true,
        userRoles: [{ role: { name: "manager" } }],
      })
      .mockResolvedValueOnce({
        id: "target-id",
        email: "new@example.com",
        firstName: "New",
        lastName: "Name",
        isActive: true,
        userRoles: [{ role: { name: "accountant" } }],
      });

    const res = await request(app)
      .put("/api/users/target-id")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        firstName: "New",
        lastName: "Name",
        email: "new@example.com",
        roleNames: ["accountant"],
      });

    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual(["accountant"]);
  });

  it("deactivation revokes refresh tokens", async () => {
    mockTargetUser("target-id", ["manager"]);

    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "target-id",
      isActive: false,
    });
    (prisma.refreshToken.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    // Second findUnique for result
    (prisma.user.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        id: "target-id",
        email: "target@example.com",
        firstName: "Test",
        lastName: "User",
        isActive: false,
        userRoles: [{ role: { name: "manager" } }],
      })
      .mockResolvedValueOnce({
        id: "target-id",
        email: "target@example.com",
        firstName: "Test",
        lastName: "User",
        isActive: false,
        userRoles: [{ role: { name: "manager" } }],
      });

    const res = await request(app)
      .put("/api/users/target-id")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "target-id" } });
  });

  it("404 when user not found", async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .put("/api/users/nonexistent")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ firstName: "X" });

    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/users/:id ────────────────────────────────────

describe("DELETE /api/users/:id", () => {
  it("403 for non-admin", async () => {
    const res = await request(app)
      .delete("/api/users/some-id")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(403);
  });

  it("400 when deleting yourself", async () => {
    const res = await request(app)
      .delete("/api/users/admin-id")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("себя");
  });

  it("403 when deleting another admin", async () => {
    mockTargetUser("other-admin-id", ["admin"]);

    const res = await request(app)
      .delete("/api/users/other-admin-id")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("администратора");
  });

  it("200 soft-deletes active user (deactivate)", async () => {
    mockTargetUser("target-id", ["manager"], true);

    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.refreshToken.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await request(app)
      .delete("/api/users/target-id")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("User deactivated");
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "target-id" },
      data: { isActive: false },
    });
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "target-id" } });
  });

  it("200 hard-deletes already deactivated user", async () => {
    mockTargetUser("target-id", ["manager"], false);

    (prisma.user.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await request(app)
      .delete("/api/users/target-id")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("User deleted");
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "target-id" } });
  });

  it("404 when user not found", async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .delete("/api/users/nonexistent")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});
