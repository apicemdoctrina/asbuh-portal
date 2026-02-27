import { Router } from "express";
import prisma from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const router = Router();

// GET /api/management/dashboard
router.get("/dashboard", authenticate, requireRole("admin"), async (_req, res) => {
  try {
    // --- Revenue (exclude left/closed/not_paying/ceased) ---
    const revenueOrgs = await prisma.organization.findMany({
      where: { status: { notIn: ["left", "closed", "not_paying", "ceased"] } },
      select: { id: true, name: true, form: true, monthlyPayment: true },
    });

    const revenueTotal = revenueOrgs.reduce((sum, o) => sum + Number(o.monthlyPayment ?? 0), 0);
    const orgsWithPayment = revenueOrgs.filter(
      (o) => o.monthlyPayment && Number(o.monthlyPayment) > 0,
    );
    const avgCheck =
      orgsWithPayment.length > 0
        ? orgsWithPayment.reduce((sum, o) => sum + Number(o.monthlyPayment ?? 0), 0) /
          orgsWithPayment.length
        : 0;

    // --- Debt (all orgs, including not_paying) ---
    const allOrgs = await prisma.organization.findMany({
      where: { status: { notIn: ["left", "closed", "ceased"] } },
      select: { id: true, name: true, debtAmount: true },
    });

    const debtTotal = allOrgs.reduce((sum, o) => sum + Number(o.debtAmount ?? 0), 0);
    const topDebtors = [...allOrgs]
      .filter((o) => Number(o.debtAmount ?? 0) > 0)
      .sort((a, b) => Number(b.debtAmount ?? 0) - Number(a.debtAmount ?? 0))
      .slice(0, 5)
      .map((o) => ({ id: o.id, name: o.name, debtAmount: Number(o.debtAmount ?? 0) }));

    // byOrgForm
    const formMap: Record<string, { count: number; revenue: number }> = {};
    for (const org of revenueOrgs) {
      const form = org.form ?? "OTHER";
      if (!formMap[form]) formMap[form] = { count: 0, revenue: 0 };
      formMap[form].count++;
      formMap[form].revenue += Number(org.monthlyPayment ?? 0);
    }
    const byOrgForm = Object.entries(formMap).map(([form, d]) => ({ form, ...d }));

    // --- Payroll (active staff, non-client roles) ---
    const staffUsers = await prisma.user.findMany({
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
    });

    const payrollTotal = staffUsers.reduce((sum, u) => sum + Number(u.salary ?? 0), 0);
    const staffCount = staffUsers.length;

    // Staff by role (each user counted once per role they hold)
    const roleMap: Record<string, { count: number; payroll: number }> = {};
    for (const u of staffUsers) {
      const seenRoles = new Set<string>();
      for (const ur of u.userRoles) {
        const roleName = ur.role.name;
        if (roleName === "client" || seenRoles.has(roleName)) continue;
        seenRoles.add(roleName);
        if (!roleMap[roleName]) roleMap[roleName] = { count: 0, payroll: 0 };
        roleMap[roleName].count++;
        roleMap[roleName].payroll += Number(u.salary ?? 0);
      }
    }
    const staffByRole = Object.entries(roleMap).map(([role, d]) => ({ role, ...d }));

    // --- Expenses ---
    const [recurringAgg, oneTimeAgg, incomeAgg] = await Promise.all([
      prisma.expense.aggregate({ where: { type: "RECURRING" }, _sum: { amount: true } }),
      prisma.expense.aggregate({ where: { type: "ONE_TIME" }, _sum: { amount: true } }),
      prisma.income.aggregate({ _sum: { amount: true } }),
    ]);
    const recurringTotal = Number(recurringAgg._sum.amount ?? 0);
    const oneTimeTotal = Number(oneTimeAgg._sum.amount ?? 0);
    const incomeTotal = Number(incomeAgg._sum.amount ?? 0);

    // --- Profit ---
    const gross = revenueTotal - payrollTotal - recurringTotal;
    const margin = revenueTotal > 0 ? (gross / revenueTotal) * 100 : 0;

    res.json({
      revenue: {
        total: revenueTotal,
        avgCheck,
        orgCount: activeOrgs.length,
        orgsWithPayment: orgsWithPayment.length,
      },
      payroll: { total: payrollTotal, staffCount },
      expenses: { recurringTotal, oneTimeTotal },
      incomes: { total: incomeTotal },
      profit: { gross, margin },
      debt: { total: debtTotal, topDebtors },
      byOrgForm,
      staff: { byRole: staffByRole },
    });
  } catch (err) {
    console.error("Management dashboard error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/management/snapshots/capture — upsert snapshot for current month
router.post("/snapshots/capture", authenticate, requireRole("admin"), async (_req, res) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const activeOrgs = await prisma.organization.findMany({
      where: { status: { notIn: ["left", "closed", "not_paying", "ceased"] } },
      select: { monthlyPayment: true },
    });

    const orgsWithPayment = activeOrgs.filter(
      (o) => o.monthlyPayment && Number(o.monthlyPayment) > 0,
    );
    const totalRevenue = activeOrgs.reduce((sum, o) => sum + Number(o.monthlyPayment ?? 0), 0);
    const avgCheck = orgsWithPayment.length > 0 ? totalRevenue / orgsWithPayment.length : 0;

    const snapshot = await prisma.revenueSnapshot.upsert({
      where: { year_month: { year, month } },
      update: {
        totalRevenue: totalRevenue.toFixed(2),
        orgCount: activeOrgs.length,
        avgCheck: avgCheck.toFixed(2),
      },
      create: {
        year,
        month,
        totalRevenue: totalRevenue.toFixed(2),
        orgCount: activeOrgs.length,
        avgCheck: avgCheck.toFixed(2),
      },
    });

    res.json(snapshot);
  } catch (err) {
    console.error("Snapshot capture error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/management/snapshots — last 12 snapshots in chronological order
router.get("/snapshots", authenticate, requireRole("admin"), async (_req, res) => {
  try {
    const snapshots = await prisma.revenueSnapshot.findMany({
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 12,
    });
    res.json(snapshots.reverse());
  } catch (err) {
    console.error("Snapshots error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

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

// ─── Income CRUD ─────────────────────────────────────────────────────────────

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
