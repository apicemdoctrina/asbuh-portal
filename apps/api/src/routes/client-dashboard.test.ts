import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import prisma from "../lib/prisma.js";
import { signAccessToken } from "../lib/tokens.js";

vi.mock("../lib/prisma.js", () => {
  const mockPrisma = {
    organizationMember: { findMany: vi.fn() },
    organization: { findMany: vi.fn() },
    ticket: { findMany: vi.fn(), count: vi.fn() },
    paymentPeriod: { findMany: vi.fn() },
    task: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    user: { update: vi.fn() },
    rolePermission: { count: vi.fn() },
  };
  return { default: mockPrisma };
});

const clientToken = signAccessToken({ userId: "client-id", roles: ["client"] });
const adminToken = signAccessToken({ userId: "admin-id", roles: ["admin"] });

const m = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

beforeEach(() => {
  for (const model of Object.values(m)) {
    for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  // user.update is fire-and-forget with optional chaining — default to resolved
  m.user.update.mockResolvedValue({});
});

function setupOrgs(
  orgs: Array<{
    id: string;
    name: string;
    debtAmount?: number;
    clientGroupId?: string | null;
    clientGroup?: { id: string; name: string } | null;
  }>,
) {
  m.organizationMember.findMany.mockResolvedValue(orgs.map((o) => ({ organizationId: o.id })));
  m.organization.findMany.mockResolvedValue(
    orgs.map((o) => ({
      id: o.id,
      name: o.name,
      debtAmount: o.debtAmount ?? 0,
      clientGroupId: o.clientGroupId ?? null,
      clientGroup: o.clientGroup ?? null,
    })),
  );
}

function defaultPerOrgEmpty() {
  m.ticket.findMany.mockResolvedValue([]);
  m.ticket.count.mockResolvedValue(0);
  m.paymentPeriod.findMany.mockResolvedValue([]);
  m.task.findFirst.mockResolvedValue(null);
  m.task.findMany.mockResolvedValue([]);
  m.task.count.mockResolvedValue(0);
}

describe("GET /api/client/dashboard", () => {
  it("403 for non-client", async () => {
    const res = await request(app)
      .get("/api/client/dashboard")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it("ok status when no actions and no overdue tasks", async () => {
    setupOrgs([{ id: "o1", name: "ООО Ромашка" }]);
    defaultPerOrgEmpty();

    const res = await request(app)
      .get("/api/client/dashboard")
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.organizations).toHaveLength(1);
    expect(res.body.organizations[0].status).toBe("ok");
    expect(res.body.organizations[0].actions).toEqual([]);
    expect(res.body.group).toBeNull();
  });

  it("action_required when there is a WAITING_CLIENT ticket", async () => {
    setupOrgs([{ id: "o1", name: "ООО Ромашка" }]);
    defaultPerOrgEmpty();
    // ticket.findMany is called twice per org:
    //   1st: NEW | WAITING_CLIENT  (action tickets)
    //   2nd: CLOSED | REOPENED     (recent feed tickets)
    m.ticket.findMany.mockImplementation((args: { where: { status: { in: string[] } } }) => {
      if (args.where.status.in.includes("WAITING_CLIENT")) {
        return Promise.resolve([
          { id: "t1", number: 42, subject: "Вопрос", type: "QUESTION", status: "WAITING_CLIENT" },
        ]);
      }
      return Promise.resolve([]);
    });

    const res = await request(app)
      .get("/api/client/dashboard")
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.organizations[0].status).toBe("action_required");
    expect(res.body.organizations[0].actions).toContainEqual(
      expect.objectContaining({ type: "ticket_waiting", link: "/tickets/t1" }),
    );
  });

  it("overdue when there is a PaymentPeriod(OVERDUE)", async () => {
    setupOrgs([{ id: "o1", name: "ООО Ромашка" }]);
    defaultPerOrgEmpty();
    m.paymentPeriod.findMany.mockResolvedValue([
      { id: "p1", year: 2026, month: 4, debtAmount: 12000, status: "OVERDUE" },
    ]);

    const res = await request(app)
      .get("/api/client/dashboard")
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.organizations[0].status).toBe("overdue");
    expect(res.body.organizations[0].actions).toContainEqual(
      expect.objectContaining({ type: "payment_overdue", link: "/my-payments" }),
    );
  });

  it("multi-org aggregates as overdue when one org is overdue", async () => {
    setupOrgs([
      { id: "o1", name: "А", clientGroupId: "g1", clientGroup: { id: "g1", name: "Группа" } },
      { id: "o2", name: "Б", clientGroupId: "g1", clientGroup: { id: "g1", name: "Группа" } },
    ]);
    defaultPerOrgEmpty();
    m.paymentPeriod.findMany.mockImplementation((args: { where: { organizationId: string } }) =>
      Promise.resolve(
        args.where.organizationId === "o2"
          ? [{ id: "p", year: 2026, month: 4, debtAmount: 5000, status: "OVERDUE" }]
          : [],
      ),
    );

    const res = await request(app)
      .get("/api/client/dashboard")
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.organizations).toHaveLength(2);
    expect(res.body.group).not.toBeNull();
    expect(res.body.group.aggregateStatus).toBe("overdue");
  });

  it("empty when client has no organization memberships", async () => {
    m.organizationMember.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get("/api/client/dashboard")
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ organizations: [], group: null });
  });
});
