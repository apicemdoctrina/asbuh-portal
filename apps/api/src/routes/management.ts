import { Router } from "express";
import prisma from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const router = Router();

const EXCLUDED_FROM_REVENUE = ["left", "closed", "not_paying", "ceased", "own"] as const;
const EXCLUDED_FROM_DEBT = ["left", "closed", "ceased", "own"] as const;

// ─── Shared metric computation ────────────────────────────────────────────────

async function computeCurrentMetrics() {
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
      select: { form: true, monthlyPayment: true },
    }),
    prisma.organization.findMany({
      where: { status: { notIn: [...EXCLUDED_FROM_DEBT] } },
      select: { id: true, name: true, debtAmount: true },
    }),
    prisma.user.findMany({
      where: {
        isActive: true,
        userRoles: {
          some: { role: { name: { in: ["admin", "manager", "accountant"] } } },
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
    staff: { byRole: staffByRole },
    clients: { active: clientsActiveCount, new: clientsNewCount },
  };
}

async function saveSnapshot(metrics: Awaited<ReturnType<typeof computeCurrentMetrics>>) {
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

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/management/dashboard
router.get("/dashboard", authenticate, requireRole("admin"), async (_req, res) => {
  try {
    const metrics = await computeCurrentMetrics();
    res.json(metrics);
    // Auto-capture snapshot in background (fire-and-forget)
    saveSnapshot(metrics).catch((err) => console.error("Auto-snapshot error:", err));
  } catch (err) {
    console.error("Management dashboard error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/management/snapshots/capture — manual refresh
router.post("/snapshots/capture", authenticate, requireRole("admin"), async (_req, res) => {
  try {
    const metrics = await computeCurrentMetrics();
    const snapshot = await saveSnapshot(metrics);
    res.json(snapshot);
  } catch (err) {
    console.error("Snapshot capture error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/management/snapshots — last 24 months chronological
router.get("/snapshots", authenticate, requireRole("admin"), async (_req, res) => {
  try {
    const snapshots = await prisma.revenueSnapshot.findMany({
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 24,
    });
    res.json(snapshots.reverse());
  } catch (err) {
    console.error("Snapshots error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Expenses CRUD ────────────────────────────────────────────────────────────

// GET /api/management/expenses
router.get("/expenses", authenticate, requireRole("admin"), async (_req, res) => {
  try {
    const expenses = await prisma.expense.findMany({
      orderBy: [{ type: "asc" }, { createdAt: "asc" }],
    });
    res.json(expenses);
  } catch (err) {
    console.error("Expenses list error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/management/expenses
router.post("/expenses", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { name, amount, type, date, description } = req.body;
    if (!name || amount == null || !type) {
      res.status(400).json({ error: "name, amount, type are required" });
      return;
    }
    if (!["RECURRING", "ONE_TIME"].includes(type)) {
      res.status(400).json({ error: "Invalid type" });
      return;
    }
    const expense = await prisma.expense.create({
      data: {
        name: String(name),
        amount: String(amount),
        type,
        date: date ? new Date(date) : null,
        description: description ? String(description) : null,
      },
    });
    res.status(201).json(expense);
  } catch (err) {
    console.error("Create expense error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/management/expenses/:id
router.put("/expenses/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, amount, type, date, description } = req.body;

    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (type !== undefined && !["RECURRING", "ONE_TIME"].includes(type)) {
      res.status(400).json({ error: "Invalid type" });
      return;
    }
    const expense = await prisma.expense.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: String(name) }),
        ...(amount !== undefined && { amount: String(amount) }),
        ...(type !== undefined && { type }),
        ...(date !== undefined && { date: date ? new Date(date) : null }),
        ...(description !== undefined && {
          description: description ? String(description) : null,
        }),
      },
    });
    res.json(expense);
  } catch (err) {
    console.error("Update expense error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/management/expenses/:id
router.delete("/expenses/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.expense.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    console.error("Delete expense error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Income CRUD ──────────────────────────────────────────────────────────────

// GET /api/management/incomes
router.get("/incomes", authenticate, requireRole("admin"), async (_req, res) => {
  try {
    const incomes = await prisma.income.findMany({
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    res.json(incomes);
  } catch (err) {
    console.error("Incomes list error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/management/incomes
router.post("/incomes", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { name, amount, date, description } = req.body;
    if (!name || amount == null) {
      res.status(400).json({ error: "name and amount are required" });
      return;
    }
    const income = await prisma.income.create({
      data: {
        name: String(name),
        amount: String(amount),
        date: date ? new Date(date) : null,
        description: description ? String(description) : null,
      },
    });
    res.status(201).json(income);
  } catch (err) {
    console.error("Create income error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/management/incomes/:id
router.put("/incomes/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, amount, date, description } = req.body;

    const existing = await prisma.income.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const income = await prisma.income.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: String(name) }),
        ...(amount !== undefined && { amount: String(amount) }),
        ...(date !== undefined && { date: date ? new Date(date) : null }),
        ...(description !== undefined && {
          description: description ? String(description) : null,
        }),
      },
    });
    res.json(income);
  } catch (err) {
    console.error("Update income error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/management/incomes/:id
router.delete("/incomes/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.income.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    console.error("Delete income error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
