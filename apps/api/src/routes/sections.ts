import { Router } from "express";
import prisma from "../lib/prisma.js";
import { logAudit } from "../lib/audit.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import type { Prisma } from "@prisma/client";

const router = Router();

/** Build a Prisma `where` filter that enforces data-scoping rules. */
function getScopedWhere(userId: string, roles: string[]): Prisma.SectionWhereInput {
  if (roles.includes("admin")) return {};
  // manager / accountant — only sections where user is a member
  return { members: { some: { userId } } };
}

// GET /api/sections — list with search, pagination, sort
router.get("/", authenticate, requirePermission("section", "view"), async (req, res) => {
  try {
    const { search, page: pageQ, limit: limitQ } = req.query;
    const page = Math.max(1, Number(pageQ) || 1);
    const limit = Math.min(100, Math.max(1, Number(limitQ) || 50));
    const skip = (page - 1) * limit;

    const scope = getScopedWhere(req.user!.userId, req.user!.roles);

    const where: Prisma.SectionWhereInput = {
      ...scope,
      ...(search
        ? {
            OR: [
              { name: { contains: String(search), mode: "insensitive" } },
              ...(isNaN(Number(search)) ? [] : [{ number: Number(search) }]),
            ],
          }
        : {}),
    };

    const [sections, total] = await Promise.all([
      prisma.section.findMany({
        where,
        orderBy: { number: "asc" },
        skip,
        take: limit,
        include: {
          _count: { select: { members: true, organizations: true } },
        },
      }),
      prisma.section.count({ where }),
    ]);

    res.json({ sections, total, page, limit });
  } catch (err) {
    console.error("List sections error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/sections — create
router.post("/", authenticate, requirePermission("section", "create"), async (req, res) => {
  try {
    const { number, name } = req.body;
    if (number == null || typeof number !== "number") {
      res.status(400).json({ error: "number is required and must be a number" });
      return;
    }

    const section = await prisma.section.create({
      data: { number, name: name || null },
    });

    await logAudit({
      action: "section_created",
      userId: req.user!.userId,
      entity: "section",
      entityId: section.id,
      details: { number, name },
      ipAddress: req.ip,
    });

    res.status(201).json(section);
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      res.status(409).json({ error: "Section with this number already exists" });
      return;
    }
    console.error("Create section error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/sections/:id — details + members + organizations
router.get("/:id", authenticate, requirePermission("section", "view"), async (req, res) => {
  try {
    const scope = getScopedWhere(req.user!.userId, req.user!.roles);

    const section = await prisma.section.findFirst({
      where: { id: req.params.id, ...scope },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        },
        organizations: {
          where: { status: { not: "archived" } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, inn: true, status: true },
        },
      },
    });

    if (!section) {
      res.status(404).json({ error: "Section not found" });
      return;
    }

    res.json(section);
  } catch (err) {
    console.error("Get section error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/sections/:id — update
router.put("/:id", authenticate, requirePermission("section", "edit"), async (req, res) => {
  try {
    const { number, name } = req.body;

    const existing = await prisma.section.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) {
      res.status(404).json({ error: "Section not found" });
      return;
    }

    const data: { number?: number; name?: string | null } = {};
    if (number !== undefined) data.number = number;
    if (name !== undefined) data.name = name || null;

    const section = await prisma.section.update({
      where: { id: req.params.id },
      data,
    });

    await logAudit({
      action: "section_updated",
      userId: req.user!.userId,
      entity: "section",
      entityId: section.id,
      details: data,
      ipAddress: req.ip,
    });

    res.json(section);
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      res.status(409).json({ error: "Section with this number already exists" });
      return;
    }
    console.error("Update section error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/sections/:id — delete (only if no orgs attached)
router.delete("/:id", authenticate, requirePermission("section", "delete"), async (req, res) => {
  try {
    const section = await prisma.section.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { organizations: true } } },
    });

    if (!section) {
      res.status(404).json({ error: "Section not found" });
      return;
    }

    if (section._count.organizations > 0) {
      res.status(400).json({
        error: "Cannot delete section with attached organizations",
      });
      return;
    }

    await prisma.section.delete({ where: { id: req.params.id } });

    await logAudit({
      action: "section_deleted",
      userId: req.user!.userId,
      entity: "section",
      entityId: section.id,
      details: { number: section.number },
      ipAddress: req.ip,
    });

    res.json({ message: "Section deleted" });
  } catch (err) {
    console.error("Delete section error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/sections/:id/members — add member
router.post(
  "/:id/members",
  authenticate,
  requirePermission("section", "edit"),
  async (req, res) => {
    try {
      const { email, role } = req.body;

      if (!email || !role) {
        res.status(400).json({ error: "email and role are required" });
        return;
      }

      const validRoles = ["accountant", "auditor"];
      if (!validRoles.includes(role)) {
        res.status(400).json({
          error: `Invalid role. Must be one of: ${validRoles.join(", ")}`,
        });
        return;
      }

      const section = await prisma.section.findUnique({
        where: { id: req.params.id },
      });
      if (!section) {
        res.status(404).json({ error: "Section not found" });
        return;
      }

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const member = await prisma.sectionMember.create({
        data: { sectionId: section.id, userId: user.id, role },
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      });

      await logAudit({
        action: "section_member_added",
        userId: req.user!.userId,
        entity: "section",
        entityId: section.id,
        details: { memberId: user.id, email, role },
        ipAddress: req.ip,
      });

      res.status(201).json(member);
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        res.status(409).json({ error: "User is already a member of this section" });
        return;
      }
      console.error("Add section member error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// DELETE /api/sections/:id/members/:userId — remove member
router.delete(
  "/:id/members/:userId",
  authenticate,
  requirePermission("section", "edit"),
  async (req, res) => {
    try {
      const member = await prisma.sectionMember.findUnique({
        where: {
          sectionId_userId: {
            sectionId: req.params.id,
            userId: req.params.userId,
          },
        },
      });

      if (!member) {
        res.status(404).json({ error: "Member not found" });
        return;
      }

      await prisma.sectionMember.delete({ where: { id: member.id } });

      await logAudit({
        action: "section_member_removed",
        userId: req.user!.userId,
        entity: "section",
        entityId: req.params.id,
        details: { removedUserId: req.params.userId },
        ipAddress: req.ip,
      });

      res.json({ message: "Member removed" });
    } catch (err) {
      console.error("Remove section member error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
