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
    section: { findUnique: vi.fn() },
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

// --------------- GET /api/organizations ---------------

describe("GET /api/organizations", () => {
  it("admin: returns all organizations (200)", async () => {
    mockPermission(true);
    const orgs = [
      {
        id: "o1",
        name: "Org1",
        section: { id: "s1", number: 1, name: null },
        _count: { members: 1 },
      },
    ];
    (prisma.organization.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(orgs);
    (prisma.organization.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const res = await request(app)
      .get("/api/organizations")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.organizations).toHaveLength(1);

    const call = (prisma.organization.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where).not.toHaveProperty("section");
    expect(call.where).not.toHaveProperty("members");
  });

  it("manager: scoped to sections where they are member (200)", async () => {
    mockPermission(true);
    (prisma.organization.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.organization.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await request(app)
      .get("/api/organizations")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(200);

    const call = (prisma.organization.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where).toHaveProperty("section");
    expect(call.where.section).toEqual({
      members: { some: { userId: "manager-id" } },
    });
  });

  it("accountant: scoped to sections where they are member (200)", async () => {
    mockPermission(true);
    (prisma.organization.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.organization.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await request(app)
      .get("/api/organizations")
      .set("Authorization", `Bearer ${accountantToken}`);

    expect(res.status).toBe(200);

    const call = (prisma.organization.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where).toHaveProperty("section");
    expect(call.where.section).toEqual({
      members: { some: { userId: "acc-id" } },
    });
  });

  it("client: scoped to organizations where they are member (200)", async () => {
    mockPermission(true);
    (prisma.organization.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.organization.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const res = await request(app)
      .get("/api/organizations")
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(200);

    const call = (prisma.organization.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where).toHaveProperty("members");
    expect(call.where.members).toEqual({
      some: { userId: "client-id" },
    });
  });
});

// --------------- GET /api/organizations/:id ---------------

describe("GET /api/organizations/:id", () => {
  it("admin: can view any organization with bankAccounts and contacts (200)", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
      section: null,
      members: [],
      bankAccounts: [{ id: "ba1", bankName: "Sber", login: "secret123" }],
      contacts: [{ id: "c1", contactPerson: "Ivan" }],
    });

    const res = await request(app)
      .get("/api/organizations/o1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.bankAccounts).toHaveLength(1);
    expect(res.body.bankAccounts[0].login).toBe("secret123");
    expect(res.body.contacts).toHaveLength(1);
  });

  it("client: returns 404 for organization they are not member of", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .get("/api/organizations/o-other")
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(404);
  });

  it("client: bankAccounts login field is stripped (DTO filtering)", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
      section: null,
      members: [],
      bankAccounts: [
        { id: "ba1", bankName: "Sber", accountNumber: "123", login: "secret", comment: null },
      ],
      contacts: [],
    });

    const res = await request(app)
      .get("/api/organizations/o1")
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.bankAccounts[0]).not.toHaveProperty("login");
    expect(res.body.bankAccounts[0].bankName).toBe("Sber");
  });
});

// --------------- POST /api/organizations ---------------

describe("POST /api/organizations", () => {
  it("creates organization with basic fields (201)", async () => {
    mockPermission(true);
    (prisma.organization.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o-new",
      name: "New Org",
      inn: null,
      form: null,
      status: "active",
      sectionId: null,
    });
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await request(app)
      .post("/api/organizations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "New Org" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("New Org");
  });

  it("creates organization with new fields (taxSystems, enum, decimal) (201)", async () => {
    mockPermission(true);
    (prisma.organization.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o-new",
      name: "Full Org",
      taxSystems: ["USN6", "OSNO"],
      serviceType: "FULL",
      monthlyPayment: "5000.00",
    });
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await request(app)
      .post("/api/organizations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Full Org",
        taxSystems: ["USN6", "OSNO"],
        serviceType: "FULL",
        monthlyPayment: "5000.00",
        employeeCount: 10,
        digitalSignature: "CLIENT",
      });

    expect(res.status).toBe(201);
  });

  it("returns 400 without name", async () => {
    mockPermission(true);

    const res = await request(app)
      .post("/api/organizations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 400 with invalid enum value", async () => {
    mockPermission(true);

    const res = await request(app)
      .post("/api/organizations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Test", serviceType: "INVALID_TYPE" });

    expect(res.status).toBe(400);
    expect(res.body.issues).toBeDefined();
  });

  it("returns 400 with invalid INN (wrong length)", async () => {
    mockPermission(true);

    const res = await request(app)
      .post("/api/organizations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Test", inn: "12345" });

    expect(res.status).toBe(400);
    expect(res.body.issues).toBeDefined();
  });

  it("returns 400 with invalid KPP (wrong length)", async () => {
    mockPermission(true);

    const res = await request(app)
      .post("/api/organizations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Test", kpp: "12345" });

    expect(res.status).toBe(400);
    expect(res.body.issues).toBeDefined();
  });

  it("returns 400 with invalid decimal field", async () => {
    mockPermission(true);

    const res = await request(app)
      .post("/api/organizations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Test", monthlyPayment: "not-a-number" });

    expect(res.status).toBe(400);
    expect(res.body.issues).toBeDefined();
  });
});

// --------------- PUT /api/organizations/:id ---------------

describe("PUT /api/organizations/:id", () => {
  it("updates organization with new fields (200)", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
    });
    (prisma.organization.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Updated",
      serviceType: "FULL",
    });
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await request(app)
      .put("/api/organizations/o1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Updated", serviceType: "FULL" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated");
  });

  it("null-clears a field via PUT (200)", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
      kpp: "123456789",
    });
    (prisma.organization.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
      kpp: null,
    });
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await request(app)
      .put("/api/organizations/o1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ kpp: null });

    expect(res.status).toBe(200);

    const updateCall = (prisma.organization.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data.kpp).toBeNull();
  });

  it("scoping: manager cannot update org outside their sections (404)", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .put("/api/organizations/o-other")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ name: "Hack" });

    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid enum on update", async () => {
    mockPermission(true);

    const res = await request(app)
      .put("/api/organizations/o1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ digitalSignature: "INVALID" });

    expect(res.status).toBe(400);
    expect(res.body.issues).toBeDefined();
  });
});

// --------------- DELETE /api/organizations/:id (archive) ---------------

describe("DELETE /api/organizations/:id (archive)", () => {
  it("archives organization (200)", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
      status: "active",
    });
    (prisma.organization.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
      status: "archived",
    });
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await request(app)
      .delete("/api/organizations/o1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Organization archived");
  });

  it("scoping: client cannot archive org they are not member of (404)", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .delete("/api/organizations/o-other")
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(404);
  });
});

// --------------- Nested: Bank Accounts ---------------

describe("POST /api/organizations/:id/bank-accounts", () => {
  it("creates bank account (201)", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
    });
    (prisma.organizationBankAccount.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "ba1",
      organizationId: "o1",
      bankName: "Sberbank",
      accountNumber: "40702810",
      login: null,
      comment: null,
    });
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await request(app)
      .post("/api/organizations/o1/bank-accounts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ bankName: "Sberbank", accountNumber: "40702810" });

    expect(res.status).toBe(201);
    expect(res.body.bankName).toBe("Sberbank");
  });

  it("returns 400 without bankName", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
    });

    const res = await request(app)
      .post("/api/organizations/o1/bank-accounts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 404 for org not in scope", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .post("/api/organizations/o-other/bank-accounts")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ bankName: "Test" });

    expect(res.status).toBe(404);
  });
});

describe("PUT /api/organizations/:id/bank-accounts/:accountId", () => {
  it("updates bank account (200)", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
    });
    (prisma.organizationBankAccount.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "ba1",
      organizationId: "o1",
      bankName: "Old",
    });
    (prisma.organizationBankAccount.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "ba1",
      organizationId: "o1",
      bankName: "New Bank",
    });
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await request(app)
      .put("/api/organizations/o1/bank-accounts/ba1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ bankName: "New Bank" });

    expect(res.status).toBe(200);
    expect(res.body.bankName).toBe("New Bank");
  });

  it("returns 404 for bank account from different org (IDOR protection)", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
    });
    (prisma.organizationBankAccount.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .put("/api/organizations/o1/bank-accounts/ba-other")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ bankName: "Hack" });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/organizations/:id/bank-accounts/:accountId", () => {
  it("deletes bank account (200)", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
    });
    (prisma.organizationBankAccount.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "ba1",
      organizationId: "o1",
    });
    (prisma.organizationBankAccount.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await request(app)
      .delete("/api/organizations/o1/bank-accounts/ba1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Bank account deleted");
  });

  it("returns 404 for non-existent bank account", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
    });
    (prisma.organizationBankAccount.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .delete("/api/organizations/o1/bank-accounts/ba-none")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

// --------------- Nested: Contacts ---------------

describe("POST /api/organizations/:id/contacts", () => {
  it("creates contact (201)", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
    });
    (prisma.organizationContact.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "c1",
      organizationId: "o1",
      contactPerson: "Ivan Petrov",
      phone: "+79001234567",
      email: null,
      telegram: null,
      comment: null,
    });
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await request(app)
      .post("/api/organizations/o1/contacts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ contactPerson: "Ivan Petrov", phone: "+79001234567" });

    expect(res.status).toBe(201);
    expect(res.body.contactPerson).toBe("Ivan Petrov");
  });

  it("returns 400 without contactPerson", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
    });

    const res = await request(app)
      .post("/api/organizations/o1/contacts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ phone: "+79001234567" });

    expect(res.status).toBe(400);
  });

  it("returns 404 for org not in scope", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .post("/api/organizations/o-other/contacts")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ contactPerson: "Test" });

    expect(res.status).toBe(404);
  });
});

describe("PUT /api/organizations/:id/contacts/:contactId", () => {
  it("updates contact (200)", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
    });
    (prisma.organizationContact.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "c1",
      organizationId: "o1",
      contactPerson: "Old",
    });
    (prisma.organizationContact.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "c1",
      organizationId: "o1",
      contactPerson: "New Person",
    });
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await request(app)
      .put("/api/organizations/o1/contacts/c1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ contactPerson: "New Person" });

    expect(res.status).toBe(200);
    expect(res.body.contactPerson).toBe("New Person");
  });

  it("returns 404 for contact from different org (IDOR protection)", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
    });
    (prisma.organizationContact.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .put("/api/organizations/o1/contacts/c-other")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ contactPerson: "Hack" });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/organizations/:id/contacts/:contactId", () => {
  it("deletes contact (200)", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
    });
    (prisma.organizationContact.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "c1",
      organizationId: "o1",
    });
    (prisma.organizationContact.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await request(app)
      .delete("/api/organizations/o1/contacts/c1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Contact deleted");
  });

  it("returns 404 for non-existent contact", async () => {
    mockPermission(true);
    (prisma.organization.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "o1",
      name: "Org1",
    });
    (prisma.organizationContact.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .delete("/api/organizations/o1/contacts/c-none")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});
