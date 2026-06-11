import prisma from "./prisma.js";

/**
 * Денежная логика долгов: ожидаемая сумма по истории цен + пересчёт debtAmount.
 * Используется роутом payments и cron'ом bank-auto-sync.
 */

/** Банковские долги считаются с 01.01.2025. */
export const DEBT_BASE_DATE = new Date(2025, 0, 1);
/** Ручные платежи (карта/наличные) — с 01.01.2026. */
export const MANUAL_BASE_DATE = new Date(2026, 0, 1);

export function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export interface OrgForExpected {
  monthlyPayment: unknown;
  serviceStartDate: Date | null;
  priceHistory: Array<{ price: unknown; effectiveFrom: Date }>;
}

/** Ожидаемая сумма оплат от org за период [baseDate, начало текущего месяца). */
export function calcExpected(org: OrgForExpected, baseDate = DEBT_BASE_DATE): number {
  const now = new Date();
  const currentMonth1st = new Date(now.getFullYear(), now.getMonth(), 1);
  const start =
    org.serviceStartDate && org.serviceStartDate > baseDate
      ? monthStart(org.serviceStartDate)
      : baseDate;
  if (start >= currentMonth1st) return 0;

  const history = org.priceHistory;
  if (!history || history.length === 0) {
    return Number(org.monthlyPayment ?? 0) * monthsBetween(start, currentMonth1st);
  }

  let total = 0;
  for (let i = 0; i < history.length; i++) {
    const iStart = monthStart(history[i].effectiveFrom);
    const iEnd =
      i + 1 < history.length ? monthStart(history[i + 1].effectiveFrom) : currentMonth1st;
    const from = iStart < start ? start : iStart;
    const to = iEnd > currentMonth1st ? currentMonth1st : iEnd;
    const months = monthsBetween(from, to);
    if (months > 0) total += Number(history[i].price) * months;
  }
  return total;
}

export const ORG_EXPECTED_SELECT = {
  id: true,
  monthlyPayment: true,
  serviceStartDate: true,
  clientGroupId: true,
  paymentDestination: true,
  priceHistory: {
    select: { price: true, effectiveFrom: true },
    orderBy: { effectiveFrom: "asc" as const },
  },
} as const;

/** Пересчитать debtAmount одной организации после изменения транзакции. */
export async function recalcOrgDebt(orgId: string): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: ORG_EXPECTED_SELECT,
  });
  if (!org) return;

  // Non-bank orgs should have zero debt (they are tracked separately)
  if (org.paymentDestination !== "BANK_TOCHKA") {
    await prisma.organization.update({
      where: { id: orgId },
      data: { debtAmount: 0 },
    });
    return;
  }

  // If org is in a group, calculate group-level debt (same logic as reconciliation)
  if (org.clientGroupId) {
    const groupOrgs = await prisma.organization.findMany({
      where: { clientGroupId: org.clientGroupId },
      select: ORG_EXPECTED_SELECT,
    });
    const bankMembers = groupOrgs.filter((o) => o.paymentDestination === "BANK_TOCHKA");
    const bankMemberIds = bankMembers.map((o) => o.id);
    const groupExpected = bankMembers.reduce((s, o) => s + calcExpected(o), 0);
    const groupAgg = await prisma.bankTransaction.aggregate({
      where: {
        organizationId: { in: bankMemberIds },
        matchStatus: { in: ["AUTO", "MANUAL"] },
        date: { gte: DEBT_BASE_DATE },
      },
      _sum: { amount: true },
    });
    const groupReceived = Number(groupAgg._sum.amount ?? 0);
    const groupDebt = Math.max(0, groupExpected - groupReceived);
    // Debt lives at group level: zero everyone, flagship (highest monthlyPayment)
    // carries the group debt. Atomic — no half-updated group on crash.
    const flagship =
      bankMembers.length > 0
        ? bankMembers.reduce((best, o) =>
            Number(o.monthlyPayment ?? 0) > Number(best.monthlyPayment ?? 0) ? o : best,
          )
        : null;
    await prisma.$transaction([
      prisma.organization.updateMany({
        where: { id: { in: groupOrgs.map((o) => o.id) } },
        data: { debtAmount: 0 },
      }),
      ...(flagship
        ? [
            prisma.organization.update({
              where: { id: flagship.id },
              data: { debtAmount: groupDebt },
            }),
          ]
        : []),
    ]);
  } else {
    const expected = calcExpected(org);
    const agg = await prisma.bankTransaction.aggregate({
      where: {
        organizationId: orgId,
        matchStatus: { in: ["AUTO", "MANUAL"] },
        date: { gte: DEBT_BASE_DATE },
      },
      _sum: { amount: true },
    });
    const received = Number(agg._sum.amount ?? 0);
    const debt = Math.max(0, expected - received);
    await prisma.organization.update({
      where: { id: orgId },
      data: { debtAmount: debt },
    });
  }
}
