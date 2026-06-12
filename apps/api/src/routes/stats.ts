import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { isReportApplicable } from "../lib/report-task-generator.js";
import { orgStrictScope, sectionScope } from "../lib/scoping.js";

const COMPLETENESS_TOTAL = 17;

type OrgCompletenessRow = {
  inn: string | null;
  form: string | null;
  ogrn: string | null;
  sectionId: string | null;
  taxSystems: string[];
  legalAddress: string | null;
  digitalSignature: string | null;
  reportingChannel: string | null;
  serviceType: string | null;
  monthlyPayment: Prisma.Decimal | null;
  paymentDestination: string | null;
  checkingAccount: string | null;
  bik: string | null;
  correspondentAccount: string | null;
  requisitesBank: string | null;
  _count: { contacts: number; members: number };
};

function calcOrgScore(org: OrgCompletenessRow): number {
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

const router = Router();

// Scope-логика централизована в lib/scoping.ts: локальная копия не имела ветки
// supervisor, и он проваливался в client-scope (документированный pitfall)
const getOrgWhere = orgStrictScope;

/** Check if user has a specific permission via their roles. */
async function hasPermission(userId: string, entity: string, action: string): Promise<boolean> {
  const count = await prisma.rolePermission.count({
    where: {
      role: { userRoles: { some: { userId } } },
      permission: { entity, action },
    },
  });
  return count > 0;
}

// GET /api/stats — aggregated dashboard statistics, scoped by role
router.get("/", authenticate, async (req, res) => {
  try {
    const { userId, roles } = req.user!;
    const orgWhere = getOrgWhere(userId, roles);

    // Exclude archived statuses from dashboard counts
    const ARCHIVED_STATUSES = ["left", "closed", "not_paying", "ceased", "own", "blacklisted"];
    const activeOrgWhere: Prisma.OrganizationWhereInput = {
      ...orgWhere,
      status: { notIn: ARCHIVED_STATUSES },
    };

    const canViewSections = await hasPermission(userId, "section", "view");
    const canViewUsers = await hasPermission(userId, "user", "view");
    const isAdmin = roles.includes("admin");

    // Build parallel queries
    const queries: Promise<unknown>[] = [
      // 0: org count (active only)
      prisma.organization.count({ where: activeOrgWhere }),
      // 1: org groupBy status (active only)
      prisma.organization.groupBy({
        by: ["status"],
        _count: { _all: true },
        where: activeOrgWhere,
      }),
      // 2: documents count (active orgs only)
      prisma.organizationDocument.count({ where: { organization: activeOrgWhere } }),
      // 3: recent organizations (active only)
      prisma.organization.findMany({
        where: activeOrgWhere,
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          section: { select: { id: true, number: true, name: true, animal: true } },
        },
      }),
      // 4: completeness fields for active orgs only
      prisma.organization.findMany({
        where: activeOrgWhere,
        select: {
          inn: true,
          form: true,
          ogrn: true,
          sectionId: true,
          taxSystems: true,
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
      }),
    ];

    // 4: sections count (only if user can view sections)
    if (canViewSections) {
      // sectionScope: admin/supervisor — все участки, staff — свои
      queries.push(prisma.section.count({ where: sectionScope(userId, roles) }));
    }

    // 5: staff count (only if admin)
    // 6: monthly revenue aggregate (only if admin)
    if (isAdmin) {
      queries.push(
        prisma.user.count({
          where: {
            isActive: true,
            userRoles: { some: { role: { name: { not: "client" } } } },
          },
        }),
      );
      queries.push(
        prisma.organization.aggregate({
          _sum: { monthlyPayment: true },
          where: activeOrgWhere,
        }),
      );
    }

    // 6: clients count (if user can view users)
    if (canViewUsers) {
      queries.push(
        prisma.user.count({
          where: {
            isActive: true,
            userRoles: { some: { role: { name: "client" } } },
          },
        }),
      );
    }

    const results = await Promise.all(queries);

    // Task traffic-light — parallel, after main queries
    const canViewTasks = await hasPermission(userId, "task", "view");
    let taskStats: { red: number; yellow: number; green: number; total: number } | null = null;
    if (canViewTasks) {
      const now = new Date();
      const in2days = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

      const myTasksFilter: Prisma.TaskWhereInput = {
        OR: [{ createdById: userId }, { assignees: { some: { userId } } }],
      };

      const notDone: Prisma.TaskWhereInput = {
        ...myTasksFilter,
        status: { notIn: ["DONE", "CANCELLED"] },
      };

      const [red, yellow, total] = await Promise.all([
        prisma.task.count({ where: { ...notDone, dueDate: { lt: now } } }),
        prisma.task.count({ where: { ...notDone, dueDate: { gte: now, lte: in2days } } }),
        prisma.task.count({ where: notDone }),
      ]);

      taskStats = { red, yellow, green: total - red - yellow, total };
    }

    // ─── Reporting progress: % сданной отчётности за прошедшие периоды текущего года ───
    // Считаются только закрытые месяцы (для MONTHLY) и закрытые кварталы (для QUARTERLY).
    // Yearly периоды текущего года не считаются (год ещё не закрыт).
    // «Сдано» = SUBMITTED или ACCEPTED. NOT_APPLICABLE исключается из знаменателя.
    // Видимость: только для сотрудников. Скоуп организаций соответствует роли (admin/supervisor — все, manager/accountant — свои участки).
    const isStaff = roles.some((r) => ["admin", "supervisor", "manager", "accountant"].includes(r));
    let reportingProgress: { submitted: number; total: number; percent: number } | null = null;
    if (isStaff) {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const lastClosedMonth = currentMonth - 1; // 0..11
      const lastClosedQuarter = Math.floor((currentMonth - 1) / 3); // 0..3

      if (lastClosedMonth > 0 || lastClosedQuarter > 0) {
        const scopedOrgs = await prisma.organization.findMany({
          where: { ...activeOrgWhere, status: { in: ["active", "new"] } },
          select: {
            id: true,
            form: true,
            taxSystems: true,
            employeeCount: true,
          },
        });

        const reportTypes = await prisma.reportType.findMany({
          where: {
            isActive: true,
            frequency: { in: ["MONTHLY", "QUARTERLY"] },
          },
          select: { id: true, code: true, frequency: true },
        });

        // Построить множество (orgId, rtId, period) которые ДОЛЖНЫ быть сданы.
        const requiredSet = new Set<string>();
        for (const org of scopedOrgs) {
          for (const rt of reportTypes) {
            const applicable = isReportApplicable(rt.code, {
              form: org.form,
              taxSystems: (org.taxSystems as string[]) ?? [],
              employeeCount: org.employeeCount,
            });
            if (!applicable) continue;
            const lastPeriod = rt.frequency === "MONTHLY" ? lastClosedMonth : lastClosedQuarter;
            for (let p = 1; p <= lastPeriod; p++) {
              requiredSet.add(`${org.id}_${rt.id}_${p}`);
            }
          }
        }

        let total = requiredSet.size;

        if (total > 0) {
          // Одним запросом тянем все entries за текущий год по нашим оргам и типам
          const entries = await prisma.reportEntry.findMany({
            where: {
              organizationId: { in: scopedOrgs.map((o) => o.id) },
              reportTypeId: { in: reportTypes.map((rt) => rt.id) },
              year: currentYear,
              status: { in: ["SUBMITTED", "ACCEPTED", "NOT_APPLICABLE"] },
            },
            select: {
              organizationId: true,
              reportTypeId: true,
              period: true,
              status: true,
            },
          });

          let submitted = 0;
          for (const e of entries) {
            const key = `${e.organizationId}_${e.reportTypeId}_${e.period}`;
            if (!requiredSet.has(key)) continue;
            if (e.status === "NOT_APPLICABLE") {
              total--; // исключаем из знаменателя
              requiredSet.delete(key);
            } else {
              submitted++;
            }
          }

          const percent = total > 0 ? Math.round((submitted / total) * 100) : 100;
          reportingProgress = { submitted, total, percent };
        } else {
          reportingProgress = { submitted: 0, total: 0, percent: 100 };
        }
      }
    }

    const orgTotal = results[0] as number;
    const groupByResult = results[1] as { status: string; _count: { _all: number } }[];
    const documentsCount = results[2] as number;
    const recentOrganizations = results[3];
    const completenessOrgs = results[4] as OrgCompletenessRow[];

    const byStatus: Record<string, number> = {};
    for (const row of groupByResult) {
      byStatus[row.status] = row._count._all;
    }

    let avgCompleteness: number | null = null;
    let completedOrganizations = 0;
    if (completenessOrgs.length > 0) {
      let totalScore = 0;
      for (const org of completenessOrgs) {
        const score = calcOrgScore(org);
        totalScore += score;
        if (score === COMPLETENESS_TOTAL) completedOrganizations++;
      }
      avgCompleteness = Math.round(
        (totalScore / (completenessOrgs.length * COMPLETENESS_TOTAL)) * 100,
      );
    }

    let idx = 5;
    const sectionsCount = canViewSections ? (results[idx++] as number) : null;
    let usersCount: number | null = null;
    let monthlyRevenue: number | null = null;
    if (isAdmin) {
      usersCount = results[idx++] as number;
      const revenueAgg = results[idx++] as { _sum: { monthlyPayment: unknown } };
      const raw = revenueAgg._sum.monthlyPayment;
      monthlyRevenue = raw != null ? Math.round(Number(raw)) : 0;
    }
    const clientsCount = canViewUsers ? (results[idx] as number) : null;

    res.json({
      organizations: { total: orgTotal, byStatus },
      sections: sectionsCount,
      users: usersCount,
      clients: clientsCount,
      documents: documentsCount,
      recentOrganizations,
      avgCompleteness,
      completedOrganizations,
      monthlyRevenue,
      tasks: taskStats,
      reportingProgress,
    });
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
