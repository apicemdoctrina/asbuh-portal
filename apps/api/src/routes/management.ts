import { Router } from "express";
import prisma from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const router = Router();

const EXCLUDED_FROM_REVENUE = [
  "left",
  "closed",
  "not_paying",
  "ceased",
  "own",
  "blacklisted",
  "archived",
] as const;
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
router.get("/dashboard", authenticate, requireRole("admin", "supervisor"), async (_req, res) => {
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
router.post(
  "/snapshots/capture",
  authenticate,
  requireRole("admin", "supervisor"),
  async (_req, res) => {
    try {
      const metrics = await computeCurrentMetrics();
      const snapshot = await saveSnapshot(metrics);
      res.json(snapshot);
    } catch (err) {
      console.error("Snapshot capture error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /api/management/snapshots — last 24 months chronological
router.get("/snapshots", authenticate, requireRole("admin", "supervisor"), async (_req, res) => {
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
router.get("/expenses", authenticate, requireRole("admin", "supervisor"), async (_req, res) => {
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
router.post("/expenses", authenticate, requireRole("admin", "supervisor"), async (req, res) => {
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
router.put("/expenses/:id", authenticate, requireRole("admin", "supervisor"), async (req, res) => {
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
router.delete(
  "/expenses/:id",
  authenticate,
  requireRole("admin", "supervisor"),
  async (req, res) => {
    try {
      const { id } = req.params;
      await prisma.expense.delete({ where: { id } });
      res.status(204).send();
    } catch (err) {
      console.error("Delete expense error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ─── Income CRUD ──────────────────────────────────────────────────────────────

// GET /api/management/incomes
router.get("/incomes", authenticate, requireRole("admin", "supervisor"), async (_req, res) => {
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
router.post("/incomes", authenticate, requireRole("admin", "supervisor"), async (req, res) => {
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
router.put("/incomes/:id", authenticate, requireRole("admin", "supervisor"), async (req, res) => {
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
router.delete(
  "/incomes/:id",
  authenticate,
  requireRole("admin", "supervisor"),
  async (req, res) => {
    try {
      const { id } = req.params;
      await prisma.income.delete({ where: { id } });
      res.status(204).send();
    } catch (err) {
      console.error("Delete income error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ─── Analytics ───────────────────────────────────────────────────────────────

// GET /api/management/analytics — workload, section profitability, bottlenecks
router.get(
  "/analytics",
  authenticate,
  requireRole("admin", "supervisor", "manager"),
  async (req, res) => {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // ── 1. Staff workload ──────────────────────────────────────────────────
      const staffUsers = await prisma.user.findMany({
        where: {
          isActive: true,
          userRoles: {
            some: { role: { name: { in: ["admin", "supervisor", "manager", "accountant"] } } },
          },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          userRoles: { include: { role: { select: { name: true } } } },
          sectionMembers: {
            select: {
              section: {
                select: {
                  _count: {
                    select: {
                      organizations: {
                        where: { status: { notIn: ["left", "closed", "ceased", "own"] } },
                      },
                    },
                  },
                },
              },
            },
          },
          taskAssignees: {
            select: {
              task: {
                select: {
                  id: true,
                  status: true,
                  dueDate: true,
                  updatedAt: true,
                  createdAt: true,
                  category: true,
                },
              },
            },
          },
        },
      });

      const workload = staffUsers.map((u) => {
        const tasks = u.taskAssignees.map((a) => a.task);
        const open = tasks.filter((t) => t.status !== "DONE" && t.status !== "CANCELLED");
        const overdue = open.filter((t) => t.dueDate && new Date(t.dueDate) < now);
        const doneLast30 = tasks.filter(
          (t) => t.status === "DONE" && new Date(t.updatedAt) >= thirtyDaysAgo,
        );

        // Average completion time (days) for done tasks
        let avgCompletionDays: number | null = null;
        if (doneLast30.length > 0) {
          const totalDays = doneLast30.reduce((sum, t) => {
            const created = new Date(t.createdAt).getTime();
            const finished = new Date(t.updatedAt).getTime();
            return sum + (finished - created) / (1000 * 60 * 60 * 24);
          }, 0);
          avgCompletionDays = Math.round((totalDays / doneLast30.length) * 10) / 10;
        }

        const roles = u.userRoles.map((ur) => ur.role.name).filter((r) => r !== "client");

        const orgCount = u.sectionMembers.reduce(
          (sum, sm) => sum + sm.section._count.organizations,
          0,
        );

        return {
          userId: u.id,
          name: `${u.lastName} ${u.firstName}`,
          roles,
          orgCount,
          openTasks: open.length,
          overdueTasks: overdue.length,
          doneLast30d: doneLast30.length,
          avgCompletionDays,
        };
      });

      // ── 2. Section profitability ───────────────────────────────────────────
      const sections = await prisma.section.findMany({
        select: {
          id: true,
          number: true,
          name: true,
          organizations: {
            where: { status: { notIn: ["left", "closed", "ceased", "own"] } },
            select: { monthlyPayment: true },
          },
          members: {
            select: {
              role: true,
              userId: true,
              user: { select: { salary: true } },
            },
          },
        },
      });

      // Count how many sections each user belongs to (for salary splitting)
      const userSectionCount: Record<string, number> = {};
      for (const s of sections) {
        for (const m of s.members) {
          userSectionCount[m.userId] = (userSectionCount[m.userId] || 0) + 1;
        }
      }

      const sectionProfitability = sections.map((s) => {
        const revenue = s.organizations.reduce((sum, o) => sum + Number(o.monthlyPayment ?? 0), 0);
        // Split salary proportionally: if user is in N sections, count 1/N here
        const payroll = s.members.reduce(
          (sum, m) => sum + Number(m.user.salary ?? 0) / (userSectionCount[m.userId] || 1),
          0,
        );
        const margin = revenue > 0 ? ((revenue - payroll) / revenue) * 100 : 0;

        return {
          sectionId: s.id,
          number: s.number,
          name: s.name,
          orgCount: s.organizations.length,
          revenue: Math.round(revenue),
          payroll: Math.round(payroll),
          profit: Math.round(revenue - payroll),
          margin: Math.round(margin * 10) / 10,
        };
      });

      // ── 3. Bottlenecks ────────────────────────────────────────────────────
      // All tasks that are overdue (not done, past due date)
      const overdueTasks = await prisma.task.findMany({
        where: {
          status: { notIn: ["DONE", "CANCELLED"] },
          dueDate: { lt: now },
        },
        select: {
          id: true,
          category: true,
          organizationId: true,
          organization: {
            select: {
              sectionId: true,
              section: { select: { number: true, name: true } },
            },
          },
        },
      });

      // By category
      const byCategoryMap: Record<string, number> = {};
      for (const t of overdueTasks) {
        byCategoryMap[t.category] = (byCategoryMap[t.category] || 0) + 1;
      }
      const byCategory = Object.entries(byCategoryMap)
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);

      // By section
      const bySectionMap: Record<string, { number: number; name: string | null; count: number }> =
        {};
      for (const t of overdueTasks) {
        const sec = t.organization?.section;
        if (!sec) continue;
        const sid = t.organization!.sectionId!;
        if (!bySectionMap[sid])
          bySectionMap[sid] = { number: sec.number, name: sec.name, count: 0 };
        bySectionMap[sid].count++;
      }
      const bySection = Object.entries(bySectionMap)
        .map(([sectionId, d]) => ({ sectionId, ...d }))
        .sort((a, b) => b.count - a.count);

      // Done tasks in last 90 days — average completion time
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const recentDone = await prisma.task.findMany({
        where: {
          status: "DONE",
          updatedAt: { gte: ninetyDaysAgo },
        },
        select: { createdAt: true, updatedAt: true, category: true },
      });

      let avgCompletionOverall: number | null = null;
      if (recentDone.length > 0) {
        const totalDays = recentDone.reduce((sum, t) => {
          return sum + (t.updatedAt.getTime() - t.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        }, 0);
        avgCompletionOverall = Math.round((totalDays / recentDone.length) * 10) / 10;
      }

      // Avg completion by category
      const catTimeMap: Record<string, { totalDays: number; count: number }> = {};
      for (const t of recentDone) {
        const days = (t.updatedAt.getTime() - t.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (!catTimeMap[t.category]) catTimeMap[t.category] = { totalDays: 0, count: 0 };
        catTimeMap[t.category].totalDays += days;
        catTimeMap[t.category].count++;
      }
      const avgByCategory = Object.entries(catTimeMap)
        .map(([category, d]) => ({
          category,
          avgDays: Math.round((d.totalDays / d.count) * 10) / 10,
          count: d.count,
        }))
        .sort((a, b) => b.avgDays - a.avgDays);

      const isAdmin = req.user!.roles.includes("admin");

      res.json({
        workload: workload.sort((a, b) => b.openTasks - a.openTasks),
        ...(isAdmin && {
          sectionProfitability: sectionProfitability.sort((a, b) => b.revenue - a.revenue),
        }),
        bottlenecks: {
          totalOverdue: overdueTasks.length,
          byCategory,
          bySection,
          avgCompletionDays: avgCompletionOverall,
          avgByCategory,
        },
      });
    } catch (err) {
      console.error("Analytics error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
