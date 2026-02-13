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
    workContact: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
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
const accountantToken = signAccessToken({ userId: "acc-id", roles: ["accountant"] });

function mockPermissionByEntity(map: Record<string, boolean>) {
  (prisma.rolePermission.count as ReturnType<typeof vi.fn>).mockImplementation(
    (args: { where: { permission: { entity: string; action: string } } }) => {
      const key = `${args.where.permission.entity}:${args.where.permission.action}`;
      return Promise.resolve(map[key] ? 1 : 0);
    },
  );
}

const sampleContact = {
  id: "c1",
  name: "Иванов Иван",
  position: "Директор",
  phone: "+7 999 123-45-67",
  comment: "Основной контакт",
  createdById: "admin-id",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  createdBy: { id: "admin-id", firstName: "Admin", lastName: "ASBUH" },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/work-contacts", () => {
  it("200: returns list of contacts", async () => {
    mockPermissionByEntity({ "work_contact:view": true });
    (prisma.workContact.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleContact]);
    (prisma.workContact.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await request(app)
      .get("/api/work-contacts")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("Иванов Иван");
    expect(res.body.total).toBe(1);
  });

  it("200: filters by search query (name/position)", async () => {
    mockPermissionByEntity({ "work_contact:view": true });
    (prisma.workContact.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([sampleContact]);
    (prisma.workContact.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await request(app)
      .get("/api/work-contacts?search=Иванов")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    const findManyCall = (prisma.workContact.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findManyCall.where.OR).toEqual([
      { name: { contains: "Иванов", mode: "insensitive" } },
      { position: { contains: "Иванов", mode: "insensitive" } },
    ]);
  });

  it("401: returns error without token", async () => {
    const res = await request(app).get("/api/work-contacts");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/work-contacts", () => {
  it("201: creates a contact", async () => {
    mockPermissionByEntity({ "work_contact:create": true });
    const newContact = { ...sampleContact, id: "c-new" };
    (prisma.workContact.create as ReturnType<typeof vi.fn>).mockResolvedValue(newContact);

    const res = await request(app)
      .post("/api/work-contacts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Иванов Иван", position: "Директор", phone: "+7 999 123-45-67" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Иванов Иван");
  });

  it("400: fails without name (zod validation)", async () => {
    mockPermissionByEntity({ "work_contact:create": true });

    const res = await request(app)
      .post("/api/work-contacts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ position: "Директор" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });
});

describe("PUT /api/work-contacts/:id", () => {
  it("200: updates a contact", async () => {
    mockPermissionByEntity({ "work_contact:edit": true });
    (prisma.workContact.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleContact);
    const updated = { ...sampleContact, name: "Петров Петр" };
    (prisma.workContact.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

    const res = await request(app)
      .put("/api/work-contacts/c1")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ name: "Петров Петр" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Петров Петр");
  });

  it("404: returns error for non-existent id", async () => {
    mockPermissionByEntity({ "work_contact:edit": true });
    (prisma.workContact.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .put("/api/work-contacts/non-existent")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Test" });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/work-contacts/:id", () => {
  it("200: admin can delete", async () => {
    mockPermissionByEntity({ "work_contact:delete": true });
    (prisma.workContact.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sampleContact);
    (prisma.workContact.delete as ReturnType<typeof vi.fn>).mockResolvedValue(sampleContact);

    const res = await request(app)
      .delete("/api/work-contacts/c1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("403: manager cannot delete (no work_contact:delete permission)", async () => {
    mockPermissionByEntity({ "work_contact:delete": false });

    const res = await request(app)
      .delete("/api/work-contacts/c1")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(403);
  });

  it("403: accountant cannot delete (no work_contact:delete permission)", async () => {
    mockPermissionByEntity({ "work_contact:delete": false });

    const res = await request(app)
      .delete("/api/work-contacts/c1")
      .set("Authorization", `Bearer ${accountantToken}`);

    expect(res.status).toBe(403);
  });
});
