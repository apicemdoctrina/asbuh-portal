import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

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

/** Build a Prisma `where` filter that enforces data-scoping rules. */
function getOrgWhere(userId: string, roles: string[]): Prisma.OrganizationWhereInput {
  if (roles.includes("admin")) return {};
  if (roles.includes("manager") || roles.includes("accountant")) {
    return { section: { members: { some: { userId } } } };
  }
  return { members: { some: { userId } } };
}

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

    const canViewSections = await hasPermission(userId, "section", "view");
    const canViewUsers = await hasPermission(userId, "user", "view");
    const isAdmin = roles.includes("admin");

    // Build parallel queries
    const queries: Promise<unknown>[] = [
      // 0: org count
      prisma.organization.count({ where: orgWhere }),
      // 1: org groupBy status
      prisma.organization.groupBy({
        by: ["status"],
        _count: { _all: true },
        where: orgWhere,
      }),
      // 2: documents count
      prisma.organizationDocument.count({ where: { organization: orgWhere } }),
      // 3: recent organizations
      prisma.organization.findMany({
        where: orgWhere,
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          section: { select: { id: true, number: true, name: true } },
        },
      }),
      // 4: completeness fields for all scoped orgs
      prisma.organization.findMany({
        where: orgWhere,
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
      const sectionWhere: Prisma.SectionWhereInput = isAdmin
        ? {}
        : { members: { some: { userId } } };
      queries.push(prisma.section.count({ where: sectionWhere }));
    }

    // 5: staff count (only if admin)
    if (isAdmin) {
      queries.push(
        prisma.user.count({
          where: {
            isActive: true,
            userRoles: { some: { role: { name: { not: "client" } } } },
          },
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
    const usersCount = isAdmin ? (results[idx++] as number) : null;
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
    });
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
