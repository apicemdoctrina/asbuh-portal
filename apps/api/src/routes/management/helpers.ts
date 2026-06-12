import prisma from "../../lib/prisma.js";

// 17 полей карточки — синхронизировано со stats.ts
export const COMPLETENESS_TOTAL = 17;
export type OrgCompletenessFields = {
  inn: string | null;
  form: string | null;
  ogrn: string | null;
  sectionId: string | null;
  taxSystems: string[];
  legalAddress: string | null;
  digitalSignature: string | null;
  reportingChannel: string | null;
  serviceType: string | null;
  monthlyPayment: unknown;
  paymentDestination: string | null;
  checkingAccount: string | null;
  bik: string | null;
  correspondentAccount: string | null;
  requisitesBank: string | null;
  _count: { contacts: number; members: number };
};
export function calcOrgScore(org: OrgCompletenessFields): number {
  return [
    !!org.inn,
    !!org.form,
    !!org.ogrn,
    !!org.sectionId,
    org.taxSystems.length > 0,
    !!org.legalAddress,
    !!org.digitalSignature,
    !!org.reportingChannel,
    !!org.serviceType,
    org.monthlyPayment != null,
    !!org.paymentDestination,
    !!org.checkingAccount,
    !!org.bik,
    !!org.correspondentAccount,
    !!org.requisitesBank,
    org._count.contacts > 0,
    org._count.members > 0,
  ].filter(Boolean).length;
}

export const EXCLUDED_FROM_REVENUE = [
  "left",
  "closed",
  "not_paying",
  "ceased",
  "own",
  "blacklisted",
  "archived",
] as const;
export const EXCLUDED_FROM_DEBT = ["left", "closed", "ceased", "own"] as const;

// ─── Shared metric computation ────────────────────────────────────────────────

export async function computeCurrentMetrics() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  const [
    revenueOrgs,
    debtOrgs,
    staffUsers,
    recurringAgg,
    oneTimeAgg,
    incomeAgg,
    clientsActiveCount,
    clientsNewCount,
  ] = await Promise.all([
    prisma.organization.findMany({
      where: { status: { notIn: [...EXCLUDED_FROM_REVENUE] } },
      select: { form: true, monthlyPayment: true, paymentDestination: true },
    }),
    prisma.organization.findMany({
      where: { status: { notIn: [...EXCLUDED_FROM_DEBT] } },
      select: { id: true, name: true, debtAmount: true },
    }),
    prisma.user.findMany({
      where: {
        isActive: true,
        userRoles: {
          some: { role: { name: { in: ["admin", "supervisor", "manager", "accountant"] } } },
        },
      },
      select: {
        id: true,
        salary: true,
        userRoles: { include: { role: { select: { name: true } } } },
      },
    }),
    prisma.expense.aggregate({ where: { type: "RECURRING" }, _sum: { amount: true } }),
    prisma.expense.aggregate({ where: { type: "ONE_TIME" }, _sum: { amount: true } }),
    prisma.income.aggregate({ _sum: { amount: true } }),
    prisma.organization.count({ where: { status: { in: ["active", "new"] } } }),
    prisma.organization.count({
      where: {
        createdAt: { gte: monthStart, lt: monthEnd },
        status: { notIn: [...EXCLUDED_FROM_REVENUE] },
      },
    }),
  ]);

  // Revenue
  const revenueTotal = revenueOrgs.reduce((s, o) => s + Number(o.monthlyPayment ?? 0), 0);
  const orgsWithPaymentList = revenueOrgs.filter((o) => Number(o.monthlyPayment ?? 0) > 0);
  const avgCheck = orgsWithPaymentList.length > 0 ? revenueTotal / orgsWithPaymentList.length : 0;

  // Debt
  const debtTotal = debtOrgs.reduce((s, o) => s + Number(o.debtAmount ?? 0), 0);
  const topDebtors = [...debtOrgs]
    .filter((o) => Number(o.debtAmount ?? 0) > 0)
    .sort((a, b) => Number(b.debtAmount ?? 0) - Number(a.debtAmount ?? 0))
    .slice(0, 5)
    .map((o) => ({ id: o.id, name: o.name, debtAmount: Number(o.debtAmount ?? 0) }));

  // Payroll
  const payrollTotal = staffUsers.reduce((s, u) => s + Number(u.salary ?? 0), 0);
  const staffCount = staffUsers.length;

  // Staff by role
  const roleMap: Record<string, { count: number; payroll: number }> = {};
  for (const u of staffUsers) {
    const seen = new Set<string>();
    for (const ur of u.userRoles) {
      const rn = ur.role.name;
      if (rn === "client" || seen.has(rn)) continue;
      seen.add(rn);
      if (!roleMap[rn]) roleMap[rn] = { count: 0, payroll: 0 };
      roleMap[rn].count++;
      roleMap[rn].payroll += Number(u.salary ?? 0);
    }
  }
  const staffByRole = Object.entries(roleMap).map(([role, d]) => ({ role, ...d }));

  // Expenses & Income
  const recurringTotal = Number(recurringAgg._sum.amount ?? 0);
  const oneTimeTotal = Number(oneTimeAgg._sum.amount ?? 0);
  const incomeTotal = Number(incomeAgg._sum.amount ?? 0);

  // Profit
  const gross = revenueTotal - payrollTotal - recurringTotal;
  const margin = revenueTotal > 0 ? (gross / revenueTotal) * 100 : 0;

  // byOrgForm
  const formMap: Record<string, { count: number; revenue: number }> = {};
  for (const org of revenueOrgs) {
    const form = org.form ?? "OTHER";
    if (!formMap[form]) formMap[form] = { count: 0, revenue: 0 };
    formMap[form].count++;
    formMap[form].revenue += Number(org.monthlyPayment ?? 0);
  }
  const byOrgForm = Object.entries(formMap).map(([form, d]) => ({ form, ...d }));

  // byPaymentDest — only orgs with payment and known destination
  const destMap: Record<string, { count: number; revenue: number }> = {};
  for (const org of revenueOrgs) {
    if (!org.paymentDestination || Number(org.monthlyPayment ?? 0) <= 0) continue;
    const dest = org.paymentDestination;
    if (!destMap[dest]) destMap[dest] = { count: 0, revenue: 0 };
    destMap[dest].count++;
    destMap[dest].revenue += Number(org.monthlyPayment ?? 0);
  }
  const byPaymentDest = Object.entries(destMap).map(([destination, d]) => ({
    destination,
    ...d,
  }));

  return {
    year,
    month,
    revenue: {
      total: revenueTotal,
      avgCheck,
      orgCount: revenueOrgs.length,
      orgsWithPayment: orgsWithPaymentList.length,
    },
    payroll: { total: payrollTotal, staffCount },
    expenses: { recurringTotal, oneTimeTotal },
    incomes: { total: incomeTotal },
    profit: { gross, margin },
    debt: { total: debtTotal, topDebtors },
    byOrgForm,
    byPaymentDest,
    staff: { byRole: staffByRole },
    clients: { active: clientsActiveCount, new: clientsNewCount },
  };
}

export async function saveSnapshot(metrics: Awaited<ReturnType<typeof computeCurrentMetrics>>) {
  const { year, month, revenue, payroll, expenses, incomes, profit, debt, clients } = metrics;
  const data = {
    totalRevenue: revenue.total.toFixed(2),
    orgCount: revenue.orgCount,
    orgsWithPayment: revenue.orgsWithPayment,
    avgCheck: revenue.avgCheck.toFixed(2),
    payrollTotal: payroll.total.toFixed(2),
    staffCount: payroll.staffCount,
    recurringExpenses: expenses.recurringTotal.toFixed(2),
    oneTimeExpenses: expenses.oneTimeTotal.toFixed(2),
    incomeTotal: incomes.total.toFixed(2),
    grossProfit: profit.gross.toFixed(2),
    margin: profit.margin.toFixed(4),
    debtTotal: debt.total.toFixed(2),
    clientsActive: clients.active,
    clientsNew: clients.new,
  };
  return prisma.revenueSnapshot.upsert({
    where: { year_month: { year, month } },
    update: data,
    create: { year, month, ...data },
  });
}
