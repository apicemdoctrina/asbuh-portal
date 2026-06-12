import { Router } from "express";
import prisma from "../../lib/prisma.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { isReportApplicable } from "../../lib/report-task-generator.js";
import { COMPLETENESS_TOTAL, calcOrgScore } from "./helpers.js";

const router = Router();

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
              sectionId: true,
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

      // ── Per-staff KPI: заполненность карточек и % сданной отчётности ───────
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const lastClosedMonth = currentMonth - 1; // 0..11
      const lastClosedQuarter = Math.floor((currentMonth - 1) / 3); // 0..3

      // Все активные орг с полями для completeness + applicability
      const allActiveOrgs = await prisma.organization.findMany({
        where: { status: { notIn: ["left", "closed", "ceased", "own"] } },
        select: {
          id: true,
          sectionId: true,
          form: true,
          taxSystems: true,
          employeeCount: true,
          inn: true,
          ogrn: true,
          legalAddress: true,
          digitalSignature: true,
          reportingChannel: true,
          serviceType: true,
          monthlyPayment: true,
          paymentDestination: true,
          checkingAccount: true,
          bik: true,
          correspondentAccount: true,
          requisitesBank: true,
          _count: { select: { contacts: true, members: true } },
        },
      });

      // Группировка орг по секции
      const orgsBySectionId: Record<string, typeof allActiveOrgs> = {};
      for (const o of allActiveOrgs) {
        if (!o.sectionId) continue;
        (orgsBySectionId[o.sectionId] ||= []).push(o);
      }

      // Active monthly/quarterly report types
      const reportTypesForMetric =
        lastClosedMonth > 0 || lastClosedQuarter > 0
          ? await prisma.reportType.findMany({
              where: { isActive: true, frequency: { in: ["MONTHLY", "QUARTERLY"] } },
              select: { id: true, code: true, frequency: true },
            })
          : [];

      // Все релевантные entries за currentYear (для всех орг — отфильтруем per-user)
      const allEntries = reportTypesForMetric.length
        ? await prisma.reportEntry.findMany({
            where: {
              year: currentYear,
              status: { in: ["SUBMITTED", "ACCEPTED", "NOT_APPLICABLE"] },
            },
            select: {
              organizationId: true,
              reportTypeId: true,
              period: true,
              status: true,
            },
          })
        : [];

      // Индекс entries: orgId → rtId → period → status
      const entriesByOrg: Record<string, Record<string, Record<number, string>>> = {};
      for (const e of allEntries) {
        ((entriesByOrg[e.organizationId] ||= {})[e.reportTypeId] ||= {})[e.period] = e.status;
      }

      function computePerUserMetrics(sectionIds: string[]) {
        // Дедупликация орг (на случай если юзер в нескольких секциях)
        const orgIds = new Set<string>();
        const userOrgs: typeof allActiveOrgs = [];
        for (const sid of sectionIds) {
          for (const o of orgsBySectionId[sid] || []) {
            if (!orgIds.has(o.id)) {
              orgIds.add(o.id);
              userOrgs.push(o);
            }
          }
        }
        if (userOrgs.length === 0) {
          return { avgCompleteness: null, reportingProgress: null };
        }

        // Completeness
        let totalScore = 0;
        for (const o of userOrgs) totalScore += calcOrgScore(o);
        const avgCompleteness = Math.round(
          (totalScore / (userOrgs.length * COMPLETENESS_TOTAL)) * 100,
        );

        // Reporting progress
        let reportingProgress: { submitted: number; total: number; percent: number } | null = null;
        if (reportTypesForMetric.length && (lastClosedMonth > 0 || lastClosedQuarter > 0)) {
          let total = 0;
          let submitted = 0;
          for (const org of userOrgs) {
            for (const rt of reportTypesForMetric) {
              const applicable = isReportApplicable(rt.code, {
                form: org.form,
                taxSystems: (org.taxSystems as string[]) ?? [],
                employeeCount: org.employeeCount,
              });
              if (!applicable) continue;
              const lastPeriod = rt.frequency === "MONTHLY" ? lastClosedMonth : lastClosedQuarter;
              for (let p = 1; p <= lastPeriod; p++) {
                const status = entriesByOrg[org.id]?.[rt.id]?.[p];
                if (status === "NOT_APPLICABLE") continue;
                total++;
                if (status === "SUBMITTED" || status === "ACCEPTED") submitted++;
              }
            }
          }
          const percent = total > 0 ? Math.round((submitted / total) * 100) : 100;
          reportingProgress = { submitted, total, percent };
        }

        return { avgCompleteness, reportingProgress };
      }

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

        const sectionIds = u.sectionMembers.map((sm) => sm.sectionId);
        const { avgCompleteness, reportingProgress } = computePerUserMetrics(sectionIds);

        return {
          userId: u.id,
          name: `${u.lastName} ${u.firstName}`,
          roles,
          orgCount,
          openTasks: open.length,
          overdueTasks: overdue.length,
          doneLast30d: doneLast30.length,
          avgCompletionDays,
          avgCompleteness,
          reportingProgress,
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
