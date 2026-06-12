import { Router } from "express";
import prisma from "../../lib/prisma.js";
import { authenticate } from "../../middleware/auth.js";
import type { Prisma } from "@prisma/client";

const router = Router();

// GET /api/users — list staff (for member pickers)
router.get("/", authenticate, async (req, res) => {
  try {
    // Allow if user has user:view, section:edit, or organization:edit permission
    const permCount = await prisma.rolePermission.count({
      where: {
        role: { userRoles: { some: { userId: req.user!.userId } } },
        permission: {
          OR: [
            { entity: "user", action: "view" },
            { entity: "section", action: "edit" },
            { entity: "organization", action: "edit" },
          ],
        },
      },
    });
    if (permCount === 0) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { search, role, excludeRole } = req.query;

    const isAdmin = req.user!.roles?.includes("admin");

    const where: Prisma.UserWhereInput = {
      // Admin sees all users; others only see active
      ...(!isAdmin ? { isActive: true } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: String(search), mode: "insensitive" } },
              { firstName: { contains: String(search), mode: "insensitive" } },
              { lastName: { contains: String(search), mode: "insensitive" } },
            ],
          }
        : {}),
      ...(role ? { userRoles: { some: { role: { name: String(role) } } } } : {}),
      ...(excludeRole ? { userRoles: { none: { role: { name: String(excludeRole) } } } } : {}),
    };

    const includeOrgs = role === "client";

    if (includeOrgs) {
      const users = await prisma.user.findMany({
        where,
        take: 50,
        orderBy: { lastName: "asc" },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isActive: true,
          lastSeenAt: true,
          createdAt: true,
          telegramBinding: { select: { id: true } },
          userRoles: { include: { role: { select: { name: true } } } },
          organizationMembers: {
            select: {
              role: true,
              organization: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                  debtAmount: true,
                  monthlyPayment: true,
                },
              },
            },
          },
        },
      });

      // Batch-fetch open ticket counts grouped by organization
      const orgIds = users.flatMap((u) => u.organizationMembers.map((om) => om.organization.id));
      const openByOrg = new Map<string, number>();
      if (orgIds.length > 0) {
        const grouped = await prisma.ticket.groupBy({
          by: ["organizationId"],
          where: {
            organizationId: { in: orgIds },
            status: { notIn: ["CLOSED"] },
          },
          _count: { _all: true },
        });
        for (const g of grouped) openByOrg.set(g.organizationId, g._count._all);
      }

      res.json(
        users.map((u) => {
          const orgs = u.organizationMembers.map((om) => ({
            id: om.organization.id,
            name: om.organization.name,
            role: om.role,
            status: om.organization.status,
            debtAmount: Number(om.organization.debtAmount ?? 0),
            monthlyPayment: Number(om.organization.monthlyPayment ?? 0),
            openTickets: openByOrg.get(om.organization.id) ?? 0,
          }));
          return {
            id: u.id,
            email: u.email,
            firstName: u.firstName,
            lastName: u.lastName,
            isActive: u.isActive,
            lastSeenAt: u.lastSeenAt,
            createdAt: u.createdAt,
            telegramConnected: !!u.telegramBinding,
            roles: u.userRoles.map((ur) => ur.role.name),
            organizations: orgs,
            totalDebt: orgs.reduce((s, o) => s + (o.debtAmount > 0 ? o.debtAmount : 0), 0),
            totalMonthlyPayment: orgs.reduce((s, o) => s + o.monthlyPayment, 0),
            openTickets: orgs.reduce((s, o) => s + o.openTickets, 0),
          };
        }),
      );
    } else {
      const canSeeCompensation = isAdmin || req.user!.roles?.includes("supervisor") === true;

      const users = await prisma.user.findMany({
        where,
        take: 50,
        orderBy: { lastName: "asc" },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isActive: true,
          lastSeenAt: true,
          salary: true,
          tax: true,
          accountantType: true,
          userRoles: { include: { role: { select: { name: true } } } },
          sectionMembers: {
            select: {
              expiresAt: true,
              section: { select: { id: true, number: true, name: true, animal: true } },
            },
          },
        },
      });

      res.json(
        users.map((u) => ({
          id: u.id,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          isActive: u.isActive,
          lastSeenAt: u.lastSeenAt,
          accountantType: u.accountantType,
          roles: u.userRoles.map((ur) => ur.role.name),
          sections: u.sectionMembers.map((sm) => ({
            ...sm.section,
            expiresAt: sm.expiresAt,
          })),
          ...(canSeeCompensation
            ? {
                salary: u.salary !== null ? Number(u.salary) : null,
                tax: u.tax !== null ? Number(u.tax) : null,
              }
            : {}),
        })),
      );
    }
  } catch (err) {
    console.error("List users error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
