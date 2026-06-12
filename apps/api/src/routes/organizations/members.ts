import { Router } from "express";
import prisma from "../../lib/prisma.js";
import { logAudit } from "../../lib/audit.js";
import { notifyWithTelegram } from "../../lib/notify.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { isPrismaUniqueError } from "../../lib/route-helpers.js";
import { orgStrictScope } from "../../lib/scoping.js";

const router = Router();

const getScopedWhere = orgStrictScope;

// ВАЖНО: bulk-роуты должны быть объявлены раньше POST /:id/members,
// иначе POST /bulk/members перехватится как :id="bulk".

// POST /api/organizations/bulk/members — list unique members of given orgs (for removal picker)
router.post("/bulk/members", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { organizationIds } = req.body as { organizationIds?: string[] };
    if (!Array.isArray(organizationIds) || organizationIds.length === 0) {
      res.status(400).json({ error: "organizationIds (non-empty array) is required" });
      return;
    }
    const users = await prisma.user.findMany({
      where: { organizationMembers: { some: { organizationId: { in: organizationIds } } } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    res.json(users);
  } catch (err) {
    console.error("Bulk members error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/organizations/bulk/non-members — users not yet assigned to any of the given orgs
router.post("/bulk/non-members", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { organizationIds } = req.body as { organizationIds?: string[] };
    if (!Array.isArray(organizationIds) || organizationIds.length === 0) {
      res.status(400).json({ error: "organizationIds (non-empty array) is required" });
      return;
    }
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        NOT: { organizationMembers: { some: { organizationId: { in: organizationIds } } } },
      },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: { lastName: "asc" },
    });
    res.json(users);
  } catch (err) {
    console.error("Bulk non-members error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/organizations/bulk/assign — assign a user as responsible to multiple orgs
router.post("/bulk/assign", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { organizationIds, userId } = req.body as {
      organizationIds?: string[];
      userId?: string;
    };
    if (!Array.isArray(organizationIds) || organizationIds.length === 0 || !userId) {
      res.status(400).json({ error: "organizationIds (non-empty array) and userId are required" });
      return;
    }
    const result = await prisma.organizationMember.createMany({
      data: organizationIds.map((orgId) => ({
        organizationId: orgId,
        userId,
        role: "responsible",
      })),
      skipDuplicates: true,
    });
    await logAudit({
      action: "org_bulk_assign",
      userId: req.user!.userId,
      entity: "organization",
      details: { organizationIds, targetUserId: userId },
      ipAddress: req.ip,
    });

    if (result.count > 0) {
      const orgs = await prisma.organization.findMany({
        where: { id: { in: organizationIds } },
        select: { name: true },
      });
      const names = orgs.map((o) => `«${o.name}»`).join(", ");
      const bodyText =
        result.count > 1
          ? `Вы назначены ответственным за ${result.count} организации: ${names}`
          : `Вы назначены ответственным за организацию ${names}`;
      const tgText =
        result.count > 1
          ? `👤 <b>Вы назначены ответственным</b>\n\nОрганизации (${result.count}):\n${orgs.map((o) => `• «${o.name}»`).join("\n")}`
          : `👤 <b>Вы назначены ответственным</b>\n\nОрганизация: ${names}`;
      notifyWithTelegram(
        userId,
        "org_member_assigned",
        "Назначены ответственным",
        bodyText,
        undefined,
        tgText,
      ).catch(console.error);
    }

    res.json({ assigned: result.count });
  } catch (err) {
    console.error("Bulk assign error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/organizations/bulk/remove — remove a user from multiple orgs
router.post("/bulk/remove", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { organizationIds, userId } = req.body as {
      organizationIds?: string[];
      userId?: string;
    };
    if (!Array.isArray(organizationIds) || organizationIds.length === 0 || !userId) {
      res.status(400).json({ error: "organizationIds (non-empty array) and userId are required" });
      return;
    }
    const orgsToRemove = await prisma.organization.findMany({
      where: { id: { in: organizationIds } },
      select: { name: true },
    });
    const result = await prisma.organizationMember.deleteMany({
      where: { organizationId: { in: organizationIds }, userId },
    });
    await logAudit({
      action: "org_bulk_remove",
      userId: req.user!.userId,
      entity: "organization",
      details: { organizationIds, targetUserId: userId },
      ipAddress: req.ip,
    });

    if (result.count > 0) {
      const names = orgsToRemove.map((o) => `«${o.name}»`).join(", ");
      const bodyText =
        result.count > 1
          ? `Вы сняты с ответственности за ${result.count} организации: ${names}`
          : `Вы сняты с ответственности за организацию ${names}`;
      const tgText =
        result.count > 1
          ? `❌ <b>Вы сняты с ответственности</b>\n\nОрганизации (${result.count}):\n${orgsToRemove.map((o) => `• «${o.name}»`).join("\n")}`
          : `❌ <b>Вы сняты с ответственности</b>\n\nОрганизация: ${names}`;
      notifyWithTelegram(
        userId,
        "org_member_removed",
        "Сняты с организации",
        bodyText,
        undefined,
        tgText,
      ).catch(console.error);
    }

    res.json({ removed: result.count });
  } catch (err) {
    console.error("Bulk remove error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/organizations/:id/members — add member (admin only)
router.post("/:id/members", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: "email is required" });
      return;
    }

    const scope = getScopedWhere(req.user!.userId, req.user!.roles);
    const organization = await prisma.organization.findFirst({
      where: { id: req.params.id, ...scope },
    });
    if (!organization) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { userRoles: { include: { role: { select: { name: true } } } } },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const memberRole = user.userRoles[0]?.role.name ?? "client";

    const member = await prisma.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: memberRole,
      },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    await logAudit({
      action: "organization_member_added",
      userId: req.user!.userId,
      entity: "organization",
      entityId: organization.id,
      details: { memberId: user.id, email, role: memberRole },
      ipAddress: req.ip,
    });

    notifyWithTelegram(
      user.id,
      "org_member_assigned",
      "Назначены ответственным",
      `Вы назначены ответственным за организацию «${organization.name}»`,
      `/organizations/${organization.id}`,
      `👤 <b>Вы назначены ответственным</b>\n\nОрганизация: «${organization.name}»`,
    ).catch(console.error);

    res.status(201).json(member);
  } catch (err: unknown) {
    if (isPrismaUniqueError(err)) {
      res.status(409).json({ error: "User is already a member of this organization" });
      return;
    }
    console.error("Add organization member error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/organizations/:id/members/:userId — remove member (admin only)
router.delete("/:id/members/:userId", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const scope = getScopedWhere(req.user!.userId, req.user!.roles);
    const organization = await prisma.organization.findFirst({
      where: { id: req.params.id, ...scope },
    });
    if (!organization) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    const member = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          organizationId: req.params.id,
          userId: req.params.userId,
        },
      },
    });

    if (!member) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    await prisma.organizationMember.delete({ where: { id: member.id } });

    await logAudit({
      action: "organization_member_removed",
      userId: req.user!.userId,
      entity: "organization",
      entityId: req.params.id,
      details: { removedUserId: req.params.userId },
      ipAddress: req.ip,
    });

    notifyWithTelegram(
      req.params.userId,
      "org_member_removed",
      "Сняты с организации",
      `Вы сняты с ответственности за организацию «${organization.name}»`,
      `/organizations/${organization.id}`,
      `❌ <b>Вы сняты с ответственности</b>\n\nОрганизация: «${organization.name}»`,
    ).catch(console.error);

    res.json({ message: "Member removed" });
  } catch (err) {
    console.error("Remove organization member error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
