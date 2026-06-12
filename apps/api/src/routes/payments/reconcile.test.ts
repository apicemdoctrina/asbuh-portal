import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../../app.js";
import prisma from "../../lib/prisma.js";
import { signAccessToken } from "../../lib/tokens.js";

// app.ts и lib/debt.ts резолвят тот же модуль prisma — мок по specifier'у
// из этой директории перехватывает все импорты (включая recalcOrgDebt)
vi.mock("../../lib/prisma.js", () => {
  const mockPrisma = {
    user: { update: vi.fn() },
    organization: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    bankTransaction: {
      groupBy: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { default: mockPrisma };
});

const adminToken = signAccessToken({ userId: "admin-id", roles: ["admin"] });
const managerToken = signAccessToken({ userId: "manager-id", roles: ["manager"] });

const mockFn = (f: unknown) => f as ReturnType<typeof vi.fn>;

/** Дата `n` месяцев назад (середина месяца) — calcExpected нормализует к 1-му числу. */
function monthsAgo(n: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - n, 15);
}

/** Организация в форме select'а reconcile: `monthsBack` месяцев обслуживания, без истории цен. */
function payingOrg(
  id: string,
  name: string,
  monthly: number,
  monthsBack: number,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    name,
    monthlyPayment: monthly,
    serviceStartDate: monthsAgo(monthsBack),
    clientGroupId: null,
    clientGroup: null,
    sectionId: null,
    section: null,
    paymentNote: null,
    paymentDestination: "BANK_TOCHKA",
    priceHistory: [],
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFn(prisma.$transaction).mockResolvedValue([]);
  mockFn(prisma.auditLog.create).mockResolvedValue({});
});

// ── POST /api/payments/reconcile ─────────────────────────────

describe("POST /api/payments/reconcile", () => {
  it("403 для не-admin/supervisor (manager)", async () => {
    const res = await request(app)
      .post("/api/payments/reconcile")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(403);
    expect(prisma.organization.findMany).not.toHaveBeenCalled();
  });

  it("одиночные орги: expected/received/debt и запись debtAmount через $transaction", async () => {
    mockFn(prisma.organization.findMany).mockResolvedValueOnce([
      payingOrg("org-1", "Org One", 1000, 4), // expected 4000
      payingOrg("org-2", "Org Two", 500, 2), // expected 1000
    ]);
    mockFn(prisma.bankTransaction.groupBy).mockResolvedValueOnce([
      { organizationId: "org-1", _sum: { amount: 1500 } },
    ]);

    const res = await request(app)
      .post("/api/payments/reconcile")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.orgCount).toBe(2);
    expect(res.body.totalExpected).toBe(5000);
    expect(res.body.totalReceived).toBe(1500);
    expect(res.body.totalDebt).toBe(3500);
    expect(res.body.debtorCount).toBe(2);

    const r1 = res.body.results.find((r: { orgId: string }) => r.orgId === "org-1");
    expect(r1).toMatchObject({ expected: 4000, received: 1500, debt: 2500, groupId: null });
    const r2 = res.body.results.find((r: { orgId: string }) => r.orgId === "org-2");
    expect(r2).toMatchObject({ expected: 1000, received: 0, debt: 1000 });

    // запись долгов — атомарно, одной транзакцией
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { debtAmount: 2500 },
    });
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-2" },
      data: { debtAmount: 1000 },
    });
    // зануление debtAmount для орг, которые больше не платят через банк
    expect(prisma.organization.updateMany).toHaveBeenCalledWith({
      where: { paymentDestination: { not: "BANK_TOCHKA" }, debtAmount: { gt: 0 } },
      data: { debtAmount: 0 },
    });
  });

  it("групповые орги: groupDebt по bank-членам, флагман получает долг, остальные 0", async () => {
    const group = { id: "grp-1", name: "Группа" };
    const gA = payingOrg("g-a", "Group A", 2000, 2, { clientGroupId: "grp-1", clientGroup: group });
    const gB = payingOrg("g-b", "Group B", 1000, 2, { clientGroupId: "grp-1", clientGroup: group });
    // CARD-член с максимальным платежом — не в расчёте и не флагман
    const gC = payingOrg("g-c", "Group C", 9000, 2, {
      clientGroupId: "grp-1",
      clientGroup: group,
      paymentDestination: "CARD",
      status: "active",
    });
    mockFn(prisma.organization.findMany)
      .mockResolvedValueOnce([gA, gB]) // платящие банковские орги
      .mockResolvedValueOnce([gA, gB, gC]); // все члены группы
    mockFn(prisma.bankTransaction.groupBy).mockResolvedValueOnce([
      { organizationId: "g-a", _sum: { amount: 1000 } },
      { organizationId: "g-b", _sum: { amount: 500 } },
    ]);

    const res = await request(app)
      .post("/api/payments/reconcile")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // в полученное считаются только bank-члены группы
    const groupByWhere = mockFn(prisma.bankTransaction.groupBy).mock.calls[0][0].where;
    expect(groupByWhere.organizationId).toEqual({ in: ["g-a", "g-b"] });

    // groupExpected = 2×2000 + 2×1000 = 6000 (CARD не считается), received 1500 → долг 4500
    expect(res.body.orgCount).toBe(3);
    for (const r of res.body.results) {
      expect(r.debt).toBe(0); // долг живёт на уровне группы
      expect(r.groupDebt).toBe(4500);
    }
    const rC = res.body.results.find((r: { orgId: string }) => r.orgId === "g-c");
    expect(rC.expected).toBe(0);

    // тоталы: групповой долг считается один раз на группу
    expect(res.body.totalExpected).toBe(6000);
    expect(res.body.totalReceived).toBe(1500);
    expect(res.body.totalDebt).toBe(4500);
    expect(res.body.debtorCount).toBe(1);

    // флагман g-a (наибольший monthlyPayment) получает долг, остальные занулены
    expect(prisma.organization.update).toHaveBeenCalledTimes(1);
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "g-a" },
      data: { debtAmount: 4500 },
    });
    expect(prisma.organization.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["g-b", "g-c"] } },
      data: { debtAmount: 0 },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("микс одиночных и групповых: тоталы складываются, группа один раз", async () => {
    const group = { id: "grp-1", name: "Группа" };
    const single = payingOrg("solo", "Solo", 1000, 2); // expected 2000, received 0
    const gA = payingOrg("g-a", "Group A", 2000, 2, { clientGroupId: "grp-1", clientGroup: group });
    const gB = payingOrg("g-b", "Group B", 1000, 2, { clientGroupId: "grp-1", clientGroup: group });
    mockFn(prisma.organization.findMany)
      .mockResolvedValueOnce([single, gA, gB])
      .mockResolvedValueOnce([gA, gB]);
    mockFn(prisma.bankTransaction.groupBy).mockResolvedValueOnce([
      { organizationId: "g-a", _sum: { amount: 1500 } },
    ]);

    const res = await request(app)
      .post("/api/payments/reconcile")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.orgCount).toBe(3);
    // группа: expected 6000, received 1500 → 4500; соло: 2000 → итого 6500
    expect(res.body.totalExpected).toBe(8000);
    expect(res.body.totalReceived).toBe(1500);
    expect(res.body.totalDebt).toBe(6500);
    expect(res.body.debtorCount).toBe(2);
  });
});

// ── POST /api/payments/write-off ─────────────────────────────

describe("POST /api/payments/write-off", () => {
  it("400 без organizationId и groupId", async () => {
    const res = await request(app)
      .post("/api/payments/write-off")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it("404 если организация не найдена", async () => {
    mockFn(prisma.organization.findUnique).mockResolvedValue(null);

    const res = await request(app)
      .post("/api/payments/write-off")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ organizationId: "missing" });

    expect(res.status).toBe(404);
  });

  it("долг (diff > 0): создаёт положительную корректировку и пересчитывает долг", async () => {
    // expected 2000, received 500 → diff 1500
    mockFn(prisma.organization.findUnique).mockResolvedValue(payingOrg("org-1", "Org", 1000, 2));
    mockFn(prisma.bankTransaction.aggregate).mockResolvedValue({ _sum: { amount: 500 } });
    mockFn(prisma.bankTransaction.create).mockResolvedValue({ id: "tx-1" });
    mockFn(prisma.organization.update).mockResolvedValue({});

    const res = await request(app)
      .post("/api/payments/write-off")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ organizationId: "org-1" });

    expect(res.status).toBe(200);
    expect(res.body.correction).toBe(1500);

    const createArg = mockFn(prisma.bankTransaction.create).mock.calls[0][0];
    expect(createArg.data.organizationId).toBe("org-1");
    expect(createArg.data.isManual).toBe(true);
    expect(createArg.data.matchStatus).toBe("MANUAL");
    expect(createArg.data.payerName).toContain("списание долга");
    expect(Number(createArg.data.amount)).toBe(1500);

    // recalcOrgDebt вызван после корректировки (агрегат-мок всё ещё отдаёт 500)
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { debtAmount: 1500 },
    });
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("переплата (diff < 0): создаёт отрицательную корректировку", async () => {
    // expected 2000, received 5000 → diff -3000
    mockFn(prisma.organization.findUnique).mockResolvedValue(payingOrg("org-1", "Org", 1000, 2));
    mockFn(prisma.bankTransaction.aggregate).mockResolvedValue({ _sum: { amount: 5000 } });
    mockFn(prisma.bankTransaction.create).mockResolvedValue({ id: "tx-1" });
    mockFn(prisma.organization.update).mockResolvedValue({});

    const res = await request(app)
      .post("/api/payments/write-off")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ organizationId: "org-1" });

    expect(res.status).toBe(200);
    expect(res.body.correction).toBe(-3000);

    const createArg = mockFn(prisma.bankTransaction.create).mock.calls[0][0];
    expect(Number(createArg.data.amount)).toBe(-3000);
    expect(createArg.data.payerName).toContain("переплаты");

    // после переплаты долг занулён, не отрицательный
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { debtAmount: 0 },
    });
  });

  it("нулевой баланс: транзакция не создаётся", async () => {
    // expected 2000 = received 2000
    mockFn(prisma.organization.findUnique).mockResolvedValue(payingOrg("org-1", "Org", 1000, 2));
    mockFn(prisma.bankTransaction.aggregate).mockResolvedValue({ _sum: { amount: 2000 } });

    const res = await request(app)
      .post("/api/payments/write-off")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ organizationId: "org-1" });

    expect(res.status).toBe(200);
    expect(res.body.correction).toBe(0);
    expect(prisma.bankTransaction.create).not.toHaveBeenCalled();
  });
});
