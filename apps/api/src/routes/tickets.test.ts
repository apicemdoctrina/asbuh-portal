import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import prisma from "../lib/prisma.js";
import { createNotification } from "../lib/notify.js";
import { signAccessToken } from "../lib/tokens.js";

vi.mock("../lib/prisma.js", () => {
  const mockPrisma = {
    ticket: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    ticketMessage: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    ticketAttachment: { findFirst: vi.fn() },
    organization: { findUnique: vi.fn() },
    organizationMember: { findFirst: vi.fn(), findMany: vi.fn() },
    userRole: { findMany: vi.fn() },
    user: {},
    rolePermission: { count: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { default: mockPrisma };
});

vi.mock("../lib/notify.js", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  notifyWithTelegram: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/client-email.js", () => ({
  getClientUserIdsForOrg: vi.fn().mockResolvedValue([]),
  sendDocRequestEmail: vi.fn().mockResolvedValue(undefined),
  sendTicketReplyEmail: vi.fn().mockResolvedValue(undefined),
  sendTicketClosedEmail: vi.fn().mockResolvedValue(undefined),
  buildWeeklyDigestForClient: vi.fn().mockResolvedValue(null),
  sendWeeklyDigestEmail: vi.fn().mockResolvedValue(false),
}));

const adminToken = signAccessToken({ userId: "admin-id", roles: ["admin"] });
const supervisorToken = signAccessToken({ userId: "supervisor-id", roles: ["supervisor"] });
const managerToken = signAccessToken({ userId: "manager-id", roles: ["manager"] });
const clientToken = signAccessToken({ userId: "client-id", roles: ["client"] });

const fn = (f: unknown) => f as ReturnType<typeof vi.fn>;

function mockPermission(allowed = true) {
  fn(prisma.rolePermission.count).mockResolvedValue(allowed ? 1 : 0);
}

function mockTicketList(tickets: unknown[] = []) {
  fn(prisma.ticket.findMany).mockResolvedValue(tickets);
  fn(prisma.ticket.count).mockResolvedValue(tickets.length);
}

const baseTicket = {
  id: "t1",
  number: 7,
  subject: "Вопрос по НДС",
  status: "NEW",
  organizationId: "org-1",
  createdById: "client-id",
  assignedToId: "manager-id",
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── GET /api/tickets: ролевой скоуп ────────────────────────────────

describe("GET /api/tickets — ролевой скоуп", () => {
  it("admin: where без скоуп-фильтра по организации (видит всё)", async () => {
    mockPermission();
    mockTicketList([baseTicket]);

    const res = await request(app).get("/api/tickets").set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.tickets).toHaveLength(1);
    const where = fn(prisma.ticket.findMany).mock.calls[0][0].where;
    expect(where).not.toHaveProperty("organization");
  });

  it("РЕГРЕССИЯ: supervisor видит как админ — в findMany НЕ уходит client-фильтр", async () => {
    mockPermission();
    mockTicketList([baseTicket]);

    const res = await request(app)
      .get("/api/tickets")
      .set("Authorization", `Bearer ${supervisorToken}`);

    expect(res.status).toBe(200);
    // Исторический баг: забытая ветка supervisor роняла его в client-скоуп
    // ({ organization: { members: ... } }) и он не видел ничего.
    const where = fn(prisma.ticket.findMany).mock.calls[0][0].where;
    expect(where).not.toHaveProperty("organization");
    const countWhere = fn(prisma.ticket.count).mock.calls[0][0].where;
    expect(countWhere).not.toHaveProperty("organization");
  });

  it("client: where фильтрует по своему membership с ролью client", async () => {
    mockPermission();
    mockTicketList();

    const res = await request(app)
      .get("/api/tickets")
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(200);
    const where = fn(prisma.ticket.findMany).mock.calls[0][0].where;
    expect(where.organization).toEqual({
      members: { some: { userId: "client-id", role: "client" } },
    });
  });

  it("manager: where фильтрует по организациям своих участков", async () => {
    mockPermission();
    mockTicketList();

    const res = await request(app)
      .get("/api/tickets")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    const where = fn(prisma.ticket.findMany).mock.calls[0][0].where;
    expect(where.organization).toEqual({
      section: { members: { some: { userId: "manager-id" } } },
    });
  });

  it("query-фильтры (status) накладываются ПОВЕРХ скоупа, не заменяя его", async () => {
    mockPermission();
    mockTicketList();

    const res = await request(app)
      .get("/api/tickets?status=NEW,IN_PROGRESS")
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(200);
    const where = fn(prisma.ticket.findMany).mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ["NEW", "IN_PROGRESS"] });
    expect(where.organization).toEqual({
      members: { some: { userId: "client-id", role: "client" } },
    });
  });
});

// ── GET /api/tickets/:id: доступ к чужому тикету ──────────────────

describe("GET /api/tickets/:id", () => {
  it("404 для чужого тикета (вне скоупа findFirst возвращает null)", async () => {
    mockPermission();
    fn(prisma.ticket.findFirst).mockResolvedValue(null);

    const res = await request(app)
      .get("/api/tickets/alien-ticket")
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(404);
    const where = fn(prisma.ticket.findFirst).mock.calls[0][0].where;
    expect(where.id).toBe("alien-ticket");
    expect(where.organization).toEqual({
      members: { some: { userId: "client-id", role: "client" } },
    });
  });

  it("200 для тикета в скоупе; клиенту не отдаются internal-сообщения", async () => {
    mockPermission();
    fn(prisma.ticket.findFirst).mockResolvedValue(baseTicket);
    fn(prisma.ticketMessage.findMany).mockResolvedValue([]);

    const res = await request(app)
      .get("/api/tickets/t1")
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ticket.id).toBe("t1");
    const msgWhere = fn(prisma.ticketMessage.findMany).mock.calls[0][0].where;
    expect(msgWhere.isInternal).toBe(false);
  });

  it("staff (manager) видит и internal-сообщения (фильтр isInternal не ставится)", async () => {
    mockPermission();
    fn(prisma.ticket.findFirst).mockResolvedValue(baseTicket);
    fn(prisma.ticketMessage.findMany).mockResolvedValue([]);

    const res = await request(app)
      .get("/api/tickets/t1")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    const msgWhere = fn(prisma.ticketMessage.findMany).mock.calls[0][0].where;
    expect(msgWhere).not.toHaveProperty("isInternal");
  });
});

// ── PATCH /api/tickets/:id ─────────────────────────────────────────

describe("PATCH /api/tickets/:id", () => {
  it("404 при попытке менять тикет вне скоупа", async () => {
    mockPermission();
    fn(prisma.ticket.findFirst).mockResolvedValue(null);

    const res = await request(app)
      .patch("/api/tickets/alien-ticket")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ status: "IN_PROGRESS" });

    expect(res.status).toBe(404);
    expect(prisma.ticket.update).not.toHaveBeenCalled();
    const where = fn(prisma.ticket.findFirst).mock.calls[0][0].where;
    expect(where.organization).toEqual({
      section: { members: { some: { userId: "manager-id" } } },
    });
  });

  it("200 смена статуса (happy path) + уведомление автору тикета", async () => {
    mockPermission();
    fn(prisma.ticket.findFirst).mockResolvedValue(baseTicket);
    fn(prisma.ticket.update).mockResolvedValue({ ...baseTicket, status: "IN_PROGRESS" });

    const res = await request(app)
      .patch("/api/tickets/t1")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ status: "IN_PROGRESS" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("IN_PROGRESS");
    expect(prisma.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t1" },
        data: { status: "IN_PROGRESS" },
      }),
    );
    // Автор (client-id) != актор (manager-id) → in-app уведомление о смене статуса
    expect(createNotification).toHaveBeenCalledWith(
      "client-id",
      "ticket_status",
      expect.any(String),
      expect.stringContaining("IN_PROGRESS"),
      "/tickets/t1",
    );
  });

  it("закрытие тикета проставляет closedAt", async () => {
    mockPermission();
    fn(prisma.ticket.findFirst).mockResolvedValue({ ...baseTicket, status: "IN_PROGRESS" });
    fn(prisma.ticket.update).mockResolvedValue({ ...baseTicket, status: "CLOSED" });
    fn(prisma.ticketMessage.findFirst).mockResolvedValue(null);

    const res = await request(app)
      .patch("/api/tickets/t1")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ status: "CLOSED" });

    expect(res.status).toBe(200);
    const data = fn(prisma.ticket.update).mock.calls[0][0].data;
    expect(data.status).toBe("CLOSED");
    expect(data.closedAt).toBeInstanceOf(Date);
  });

  it("400 при пустом теле (нет полей для обновления)", async () => {
    mockPermission();
    fn(prisma.ticket.findFirst).mockResolvedValue(baseTicket);

    const res = await request(app)
      .patch("/api/tickets/t1")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

// ── POST /api/tickets/:id/messages ────────────────────────────────

describe("POST /api/tickets/:id/messages", () => {
  it("404 при ответе в чужой тикет (вне скоупа)", async () => {
    fn(prisma.ticket.findFirst).mockResolvedValue(null);

    const res = await request(app)
      .post("/api/tickets/alien-ticket/messages")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ body: "Здравствуйте" });

    expect(res.status).toBe(404);
    expect(prisma.ticketMessage.create).not.toHaveBeenCalled();
  });

  it("403 клиенту на internal-сообщение", async () => {
    const res = await request(app)
      .post("/api/tickets/t1/messages")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ body: "Секретно", isInternal: true });

    expect(res.status).toBe(403);
  });

  it("201 ответ staff: сообщение создано, статус авто-переходит в WAITING_CLIENT", async () => {
    fn(prisma.ticket.findFirst).mockResolvedValue({ ...baseTicket, status: "IN_PROGRESS" });
    fn(prisma.ticketMessage.create).mockResolvedValue({
      id: "m1",
      body: "Ответ",
      isInternal: false,
      ticketId: "t1",
      authorId: "manager-id",
      author: { id: "manager-id", firstName: "Иван", lastName: "Иванов", avatarPath: null },
      attachments: [],
    });
    fn(prisma.ticket.update).mockResolvedValue({});

    const res = await request(app)
      .post("/api/tickets/t1/messages")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ body: "Ответ" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("m1");
    const updateData = fn(prisma.ticket.update).mock.calls[0][0].data;
    expect(updateData.status).toBe("WAITING_CLIENT");
  });
});

// ── DELETE /api/tickets/:id ────────────────────────────────────────

describe("DELETE /api/tickets/:id", () => {
  it("403 для manager (hard-delete только admin)", async () => {
    const res = await request(app)
      .delete("/api/tickets/t1")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(403);
    expect(prisma.ticket.delete).not.toHaveBeenCalled();
  });
});
