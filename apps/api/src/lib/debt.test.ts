import { describe, it, expect, vi, beforeEach } from "vitest";

// debt.ts тянет prisma на верхнем уровне — мокаем; calcExpected/monthsBetween —
// чистая логика, recalcOrgDebt дёргает organization/bankTransaction/$transaction
vi.mock("./prisma.js", () => ({
  default: {
    organization: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    bankTransaction: { aggregate: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const { calcExpected, monthsBetween, recalcOrgDebt } = await import("./debt.js");
const prisma = (await import("./prisma.js")).default;

const mockFn = (f: unknown) => f as ReturnType<typeof vi.fn>;

/** Дата `n` месяцев назад, середина месяца — проверяет нормализацию к 1-му числу. */
function monthsAgo(n: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - n, 15);
}

const DEBT_BASE_DATE = new Date(2025, 0, 1);

describe("monthsBetween", () => {
  it("считает целые месяцы между началами месяцев", () => {
    expect(monthsBetween(new Date(2025, 0, 1), new Date(2025, 3, 1))).toBe(3);
    expect(monthsBetween(new Date(2025, 10, 1), new Date(2026, 1, 1))).toBe(3);
    expect(monthsBetween(new Date(2025, 5, 1), new Date(2025, 5, 1))).toBe(0);
  });
});

describe("calcExpected", () => {
  it("без истории цен: monthlyPayment × месяцы от старта обслуживания", () => {
    const org = {
      monthlyPayment: 1000,
      serviceStartDate: monthsAgo(3),
      priceHistory: [],
    };
    expect(calcExpected(org)).toBe(3000);
  });

  it("старт в текущем месяце → ожидание 0", () => {
    const org = {
      monthlyPayment: 1000,
      serviceStartDate: monthsAgo(0),
      priceHistory: [],
    };
    expect(calcExpected(org)).toBe(0);
  });

  it("serviceStartDate раньше baseDate → отсчёт от baseDate", () => {
    const org = {
      monthlyPayment: 500,
      serviceStartDate: new Date(2020, 0, 1),
      priceHistory: [],
    };
    const now = new Date();
    const months = monthsBetween(DEBT_BASE_DATE, new Date(now.getFullYear(), now.getMonth(), 1));
    expect(calcExpected(org)).toBe(500 * months);
  });

  it("история цен: сегменты по периодам действия цены", () => {
    const org = {
      monthlyPayment: 999, // должен игнорироваться при наличии истории
      serviceStartDate: monthsAgo(4),
      priceHistory: [
        { price: 100, effectiveFrom: monthsAgo(4) },
        { price: 200, effectiveFrom: monthsAgo(2) },
      ],
    };
    // 2 месяца по 100 + 2 месяца по 200
    expect(calcExpected(org)).toBe(100 * 2 + 200 * 2);
  });

  it("история, начавшаяся раньше старта обслуживания, клипается по старту", () => {
    const org = {
      monthlyPayment: null,
      serviceStartDate: monthsAgo(3),
      priceHistory: [{ price: 100, effectiveFrom: monthsAgo(6) }],
    };
    expect(calcExpected(org)).toBe(100 * 3);
  });

  it("кастомный baseDate (ручные платежи) сдвигает начало отсчёта", () => {
    const customBase = new Date(monthsAgo(2).getFullYear(), monthsAgo(2).getMonth(), 1);
    const org = {
      monthlyPayment: 700,
      serviceStartDate: monthsAgo(10),
      priceHistory: [],
    };
    expect(calcExpected(org, customBase)).toBe(700 * 2);
  });

  it("monthlyPayment null без истории → 0", () => {
    const org = {
      monthlyPayment: null,
      serviceStartDate: monthsAgo(5),
      priceHistory: [],
    };
    expect(calcExpected(org)).toBe(0);
  });
});

// ── recalcOrgDebt ────────────────────────────────────────────

/** Организация в форме ORG_EXPECTED_SELECT: 3 месяца обслуживания, без истории цен. */
function selectedOrg(id: string, monthly: number | null, extra: Record<string, unknown> = {}) {
  return {
    id,
    monthlyPayment: monthly,
    serviceStartDate: monthsAgo(3),
    clientGroupId: null,
    paymentDestination: "BANK_TOCHKA",
    priceHistory: [],
    ...extra,
  };
}

describe("recalcOrgDebt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("орга не найдена → выходит молча, ничего не пишет", async () => {
    mockFn(prisma.organization.findUnique).mockResolvedValue(null);

    await expect(recalcOrgDebt("missing")).resolves.toBeUndefined();

    expect(prisma.organization.update).not.toHaveBeenCalled();
    expect(prisma.organization.updateMany).not.toHaveBeenCalled();
    expect(prisma.bankTransaction.aggregate).not.toHaveBeenCalled();
  });

  it("не-BANK_TOCHKA орга → debtAmount 0 без расчёта транзакций", async () => {
    mockFn(prisma.organization.findUnique).mockResolvedValue(
      selectedOrg("org-card", 1000, { paymentDestination: "CARD" }),
    );

    await recalcOrgDebt("org-card");

    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-card" },
      data: { debtAmount: 0 },
    });
    expect(prisma.bankTransaction.aggregate).not.toHaveBeenCalled();
  });

  it("без группы: долг = expected − received", async () => {
    mockFn(prisma.organization.findUnique).mockResolvedValue(selectedOrg("org-1", 1000));
    mockFn(prisma.bankTransaction.aggregate).mockResolvedValue({ _sum: { amount: 2500 } });

    await recalcOrgDebt("org-1");

    // expected = 3 × 1000 = 3000, received 2500 → долг 500
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { debtAmount: 500 },
    });
    // в received входят только AUTO/MANUAL с DEBT_BASE_DATE
    const aggWhere = mockFn(prisma.bankTransaction.aggregate).mock.calls[0][0].where;
    expect(aggWhere.organizationId).toBe("org-1");
    expect(aggWhere.matchStatus).toEqual({ in: ["AUTO", "MANUAL"] });
    expect(aggWhere.date).toEqual({ gte: DEBT_BASE_DATE });
  });

  it("без группы: переплата → долг 0, не отрицательный", async () => {
    mockFn(prisma.organization.findUnique).mockResolvedValue(selectedOrg("org-1", 1000));
    mockFn(prisma.bankTransaction.aggregate).mockResolvedValue({ _sum: { amount: 99999 } });

    await recalcOrgDebt("org-1");

    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { debtAmount: 0 },
    });
  });

  it("без группы: monthlyPayment null → долг 0 без падения", async () => {
    mockFn(prisma.organization.findUnique).mockResolvedValue(selectedOrg("org-1", null));
    mockFn(prisma.bankTransaction.aggregate).mockResolvedValue({ _sum: { amount: null } });

    await expect(recalcOrgDebt("org-1")).resolves.toBeUndefined();

    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { debtAmount: 0 },
    });
  });

  it("группа: долг на флагмана, остальные 0; CARD-члены не участвуют в расчёте", async () => {
    mockFn(prisma.organization.findUnique).mockResolvedValue(
      selectedOrg("org-a", 1000, { clientGroupId: "grp-1" }),
    );
    mockFn(prisma.organization.findMany).mockResolvedValue([
      selectedOrg("org-a", 1000, { clientGroupId: "grp-1" }),
      selectedOrg("org-b", 2000, { clientGroupId: "grp-1" }),
      // CARD-орг с максимальным платежом — не флагман и не в expected
      selectedOrg("org-c", 9000, { clientGroupId: "grp-1", paymentDestination: "CARD" }),
    ]);
    mockFn(prisma.bankTransaction.aggregate).mockResolvedValue({ _sum: { amount: 4000 } });

    await recalcOrgDebt("org-a");

    // received агрегируется только по банковским членам группы
    const aggWhere = mockFn(prisma.bankTransaction.aggregate).mock.calls[0][0].where;
    expect(aggWhere.organizationId).toEqual({ in: ["org-a", "org-b"] });

    // зануление всех членов группы (включая CARD)
    expect(prisma.organization.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["org-a", "org-b", "org-c"] } },
      data: { debtAmount: 0 },
    });
    // groupExpected = 3×1000 + 3×2000 = 9000, received 4000 → долг 5000
    // флагман — org-b (наибольший monthlyPayment среди банковских)
    expect(prisma.organization.update).toHaveBeenCalledTimes(1);
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-b" },
      data: { debtAmount: 5000 },
    });
    // атомарно — одной транзакцией
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("группа: переплата → у флагмана долг 0", async () => {
    mockFn(prisma.organization.findUnique).mockResolvedValue(
      selectedOrg("org-a", 1000, { clientGroupId: "grp-1" }),
    );
    mockFn(prisma.organization.findMany).mockResolvedValue([
      selectedOrg("org-a", 1000, { clientGroupId: "grp-1" }),
      selectedOrg("org-b", 2000, { clientGroupId: "grp-1" }),
    ]);
    mockFn(prisma.bankTransaction.aggregate).mockResolvedValue({ _sum: { amount: 100000 } });

    await recalcOrgDebt("org-a");

    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-b" },
      data: { debtAmount: 0 },
    });
  });

  it("РЕГРЕССИЯ: архивная орга с max платежом не флагман — как в /payments/reconcile", async () => {
    mockFn(prisma.organization.findUnique).mockResolvedValue(
      selectedOrg("org-a", 1000, { clientGroupId: "grp-1", status: "active" }),
    );
    mockFn(prisma.organization.findMany).mockResolvedValue([
      selectedOrg("org-a", 1000, { clientGroupId: "grp-1", status: "active" }),
      // архивная банковская орга с наибольшим платежом — участвует в expected,
      // но долг на неё вешать нельзя
      selectedOrg("org-x", 9000, { clientGroupId: "grp-1", status: "archived" }),
    ]);
    mockFn(prisma.bankTransaction.aggregate).mockResolvedValue({ _sum: { amount: 0 } });

    await recalcOrgDebt("org-a");

    expect(prisma.organization.update).toHaveBeenCalledTimes(1);
    expect(mockFn(prisma.organization.update).mock.calls[0][0].where).toEqual({ id: "org-a" });
  });

  it("группа без активных платящих банковских орг → все занулены, долг никому не пишется", async () => {
    mockFn(prisma.organization.findUnique).mockResolvedValue(
      selectedOrg("org-a", 1000, { clientGroupId: "grp-1", status: "archived" }),
    );
    mockFn(prisma.organization.findMany).mockResolvedValue([
      selectedOrg("org-a", 1000, { clientGroupId: "grp-1", status: "archived" }),
      selectedOrg("org-b", null, { clientGroupId: "grp-1", status: "active" }),
    ]);
    mockFn(prisma.bankTransaction.aggregate).mockResolvedValue({ _sum: { amount: 0 } });

    await recalcOrgDebt("org-a");

    expect(prisma.organization.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["org-a", "org-b"] } },
      data: { debtAmount: 0 },
    });
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });
});
