import { Router } from "express";
import prisma from "../lib/prisma.js";
import { logAudit } from "../lib/audit.js";
import { authenticate, requireRole } from "../middleware/auth.js";
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

    const { search, role } = req.query;

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
    };

    const users = await prisma.user.findMany({
      where,
      take: 20,
      orderBy: { lastName: "asc" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        userRoles: { include: { role: { select: { name: true } } } },
      },
    });

    res.json(
      users.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        isActive: u.isActive,
        roles: u.userRoles.map((ur) => ur.role.name),
      })),
    );
  } catch (err) {
    console.error("List users error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/users/me — current user profile with roles, permissions, organizations
router.get("/me", authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
        organizationMembers: {
          include: { organization: { select: { id: true, name: true, inn: true } } },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const roles = user.userRoles.map((ur) => ur.role.name);

    // Collect unique permissions from all roles
    const permSet = new Set<string>();
    const permissions: Array<{ entity: string; action: string }> = [];
    for (const ur of user.userRoles) {
      for (const rp of ur.role.rolePermissions) {
        const key = `${rp.permission.entity}:${rp.permission.action}`;
        if (!permSet.has(key)) {
          permSet.add(key);
          permissions.push({ entity: rp.permission.entity, action: rp.permission.action });
        }
      }
    }

    const organizations = user.organizationMembers.map((om) => ({
      id: om.organization.id,
      name: om.organization.name,
      inn: om.organization.inn,
      role: om.role,
    }));

    res.json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      roles,
      permissions,
      organizations,
    });
  } catch (err) {
    console.error("Get me error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const ALLOWED_ROLES = ["admin", "manager", "accountant"];

// PUT /api/users/:id — edit user (admin only)
router.put("/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, roleNames, isActive } = req.body;

    // Validate roleNames if provided — exactly one role
    if (roleNames !== undefined) {
      if (!Array.isArray(roleNames) || roleNames.length !== 1) {
        res.status(400).json({ error: "Необходимо выбрать ровно одну роль" });
        return;
      }
      if (!ALLOWED_ROLES.includes(roleNames[0])) {
        res.status(400).json({ error: "Недопустимая роль" });
        return;
      }
    }

    // Fetch target user with roles
    const target = await prisma.user.findUnique({
      where: { id },
      include: { userRoles: { include: { role: { select: { name: true } } } } },
    });
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const targetRoles = target.userRoles.map((ur) => ur.role.name);
    const targetIsAdmin = targetRoles.includes("admin");

    // Cannot deactivate yourself
    if (isActive === false && req.user!.userId === id) {
      res.status(400).json({ error: "Нельзя деактивировать самого себя" });
      return;
    }

    // Cannot change roles/isActive for another admin
    if (targetIsAdmin && req.user!.userId !== id) {
      if (roleNames !== undefined || isActive !== undefined) {
        res.status(403).json({ error: "Нельзя менять роли/статус администратора" });
        return;
      }
    }

    // Update user fields
    const data: Prisma.UserUpdateInput = {};
    if (firstName !== undefined) data.firstName = firstName;
    if (lastName !== undefined) data.lastName = lastName;
    if (email !== undefined) data.email = email;
    if (isActive !== undefined) data.isActive = isActive;

    try {
      await prisma.user.update({ where: { id }, data });
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        res.status(409).json({ error: "Email уже используется" });
        return;
      }
      throw err;
    }

    // Update roles if provided
    if (roleNames !== undefined) {
      await prisma.userRole.deleteMany({ where: { userId: id } });

      const roles = await prisma.role.findMany({
        where: { name: { in: roleNames } },
      });
      await prisma.userRole.createMany({
        data: roles.map((r) => ({ userId: id, roleId: r.id })),
      });
    }

    // If deactivated, revoke refresh tokens
    if (isActive === false) {
      await prisma.refreshToken.deleteMany({ where: { userId: id } });
    }

    await logAudit({
      action: "user_updated",
      userId: req.user!.userId,
      entity: "user",
      entityId: id,
      details: { firstName, lastName, email, roleNames, isActive },
      ipAddress: req.ip,
    });

    // Return updated user with roles
    const result = await prisma.user.findUnique({
      where: { id },
      include: { userRoles: { include: { role: { select: { name: true } } } } },
    });

    res.json({
      id: result!.id,
      email: result!.email,
      firstName: result!.firstName,
      lastName: result!.lastName,
      isActive: result!.isActive,
      roles: result!.userRoles.map((ur) => ur.role.name),
    });
  } catch (err) {
    console.error("Update user error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/users/:id — deactivate or hard-delete user (admin only)
// Active user → soft delete (deactivate)
// Already deactivated → hard delete (permanent removal)
router.delete("/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;

    // Cannot delete yourself
    if (req.user!.userId === id) {
      res.status(400).json({ error: "Нельзя удалить самого себя" });
      return;
    }

    const target = await prisma.user.findUnique({
      where: { id },
      include: { userRoles: { include: { role: { select: { name: true } } } } },
    });
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Cannot delete another admin
    if (target.userRoles.some((ur) => ur.role.name === "admin")) {
      res.status(403).json({ error: "Нельзя удалить администратора" });
      return;
    }

    if (target.isActive) {
      // Soft delete
      await prisma.user.update({ where: { id }, data: { isActive: false } });
      await prisma.refreshToken.deleteMany({ where: { userId: id } });

      await logAudit({
        action: "user_deactivated",
        userId: req.user!.userId,
        entity: "user",
        entityId: id,
        ipAddress: req.ip,
      });

      res.json({ message: "User deactivated" });
    } else {
      // Hard delete — cascade removes related records
      await prisma.user.delete({ where: { id } });

      await logAudit({
        action: "user_deleted",
        userId: req.user!.userId,
        entity: "user",
        entityId: id,
        details: { email: target.email },
        ipAddress: req.ip,
      });

      res.json({ message: "User deleted" });
    }
  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
