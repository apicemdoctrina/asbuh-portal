import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../../app.js";
import prisma from "../../lib/prisma.js";
import { signAccessToken } from "../../lib/tokens.js";

vi.mock("../../lib/prisma.js", () => {
  const mockPrisma = {
    task: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    taskComment: { groupBy: vi.fn() },
    taskCommentRead: { findMany: vi.fn() },
    taskAssignee: { deleteMany: vi.fn(), createMany: vi.fn() },
    organization: { findMany: vi.fn() },
    user: {},
    rolePermission: { count: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { default: mockPrisma };
});

vi.mock("../../lib/notify.js", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  notifyWithTelegram: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/task-notifier.js", () => ({
  notifyAssigned: vi.fn().mockResolvedValue(undefined),
  startDeadlineReminder: vi.fn(),
  startEscalationNotifier: vi.fn(),
  startDailyNotifier: vi.fn(),
}));

const adminToken = signAccessToken({ userId: "admin-id", roles: ["admin"] });
const supervisorToken = signAccessToken({ userId: "supervisor-id", roles: ["supervisor"] });
const managerToken = signAccessToken({ userId: "manager-id", roles: ["manager"] });
const accountantToken = signAccessToken({ userId: "acc-id", roles: ["accountant"] });
const clientToken = signAccessToken({ userId: "client-id", roles: ["client"] });

const fn = (f: unknown) => f as ReturnType<typeof vi.fn>;

/** Ожидаемый taskScope для staff (manager/accountant): секции + личный fallback. */
function staffTaskScopeOR(userId: string) {
  return [
    { organization: { section: { members: { some: { userId } } } } },
    {
      AND: [
        { organizationId: null },
        { OR: [{ createdById: userId }, { assignees: { some: { userId } } }] },
      ],
    },
  ];
}

function mockHappyList(tasks: unknown[] = []) {
  fn(prisma.rolePermission.count).mockResolvedValue(1);
  fn(prisma.task.findMany).mockResolvedValue(tasks);
  fn(prisma.taskComment.groupBy).mockResolvedValue([]);
  fn(prisma.taskCommentRead.findMany).mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── GET /api/tasks: ролевой скоуп ──────────────────────────────────

describe("GET /api/tasks — ролевой скоуп", () => {
  it("admin: видит всё — where без OR-скоупа, только archivedAt: null", async () => {
    mockHappyList([{ id: "t1", title: "Сдать НДС" }]);

    const res = await request(app).get("/api/tasks").set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const where = fn(prisma.task.findMany).mock.calls[0][0].where;
    expect(where).not.toHaveProperty("OR");
    expect(where).not.toHaveProperty("organization");
    expect(where.archivedAt).toBeNull();
  });

  it("РЕГРЕССИЯ: supervisor видит как админ — where без скоуп-фильтра (не падает в client-скоуп)", async () => {
    mockHappyList([{ id: "t1", title: "Сдать НДС" }]);

    const res = await request(app)
      .get("/api/tasks")
      .set("Authorization", `Bearer ${supervisorToken}`);

    expect(res.status).toBe(200);
    // Исторический баг (tickets.ts): забытая ветка supervisor роняла его
    // в client-скоуп ({ OR: [createdById, assignees] }) и он не видел ничего.
    const where = fn(prisma.task.findMany).mock.calls[0][0].where;
    expect(where).not.toHaveProperty("OR");
    expect(where).not.toHaveProperty("createdById");
  });

  it("manager: секционный скоуп + личные задачи без организации (createdById/assignee fallback)", async () => {
    mockHappyList();

    const res = await request(app).get("/api/tasks").set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    const where = fn(prisma.task.findMany).mock.calls[0][0].where;
    expect(where.OR).toEqual(staffTaskScopeOR("manager-id"));
  });

  it("accountant: тот же секционный скоуп, что и manager", async () => {
    mockHappyList();

    const res = await request(app)
      .get("/api/tasks")
      .set("Authorization", `Bearer ${accountantToken}`);

    expect(res.status).toBe(200);
    const where = fn(prisma.task.findMany).mock.calls[0][0].where;
    expect(where.OR).toEqual(staffTaskScopeOR("acc-id"));
  });

  it("client: только созданные им или назначенные на него задачи", async () => {
    mockHappyList();

    const res = await request(app).get("/api/tasks").set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(200);
    const where = fn(prisma.task.findMany).mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { createdById: "client-id" },
      { assignees: { some: { userId: "client-id" } } },
    ]);
  });
});

// ── GET /api/tasks: архив и фильтр по организации ──────────────────

describe("GET /api/tasks — архив и organizationId", () => {
  it("archived=true для supervisor: отдаёт только архив (archivedAt not null)", async () => {
    mockHappyList();

    const res = await request(app)
      .get("/api/tasks?archived=true")
      .set("Authorization", `Bearer ${supervisorToken}`);

    expect(res.status).toBe(200);
    const where = fn(prisma.task.findMany).mock.calls[0][0].where;
    expect(where.archivedAt).toEqual({ not: null });
  });

  it("archived=true для manager игнорируется: архив только admin/supervisor", async () => {
    mockHappyList();

    const res = await request(app)
      .get("/api/tasks?archived=true")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    const where = fn(prisma.task.findMany).mock.calls[0][0].where;
    expect(where.archivedAt).toBeNull();
  });

  it("organizationId вне strict-скоупа manager → 403", async () => {
    fn(prisma.rolePermission.count).mockResolvedValue(1);
    // allOrgsAccessible: организация не найдена в скоупе пользователя
    fn(prisma.organization.findMany).mockResolvedValue([]);

    const res = await request(app)
      .get("/api/tasks?organizationId=alien-org")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(403);
    expect(prisma.task.findMany).not.toHaveBeenCalled();
    // Проверка организации идёт через orgStrictScope (секции manager-а)
    const orgWhere = fn(prisma.organization.findMany).mock.calls[0][0].where;
    expect(orgWhere).toEqual({
      id: { in: ["alien-org"] },
      section: { members: { some: { userId: "manager-id" } } },
    });
  });

  it("organizationId в скоупе manager: where.organizationId без OR-скоупа", async () => {
    mockHappyList();
    fn(prisma.organization.findMany).mockResolvedValue([{ id: "org-1" }]);

    const res = await request(app)
      .get("/api/tasks?organizationId=org-1")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    const where = fn(prisma.task.findMany).mock.calls[0][0].where;
    expect(where.organizationId).toBe("org-1");
    expect(where).not.toHaveProperty("OR");
  });
});
