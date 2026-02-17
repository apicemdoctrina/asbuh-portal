import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

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

    const byStatus: Record<string, number> = {};
    for (const row of groupByResult) {
      byStatus[row.status] = row._count._all;
    }

    let idx = 4;
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
    });
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
