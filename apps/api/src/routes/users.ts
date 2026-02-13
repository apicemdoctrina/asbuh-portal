import { Router } from "express";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
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

    const where: Prisma.UserWhereInput = {
      isActive: true,
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
        userRoles: { include: { role: { select: { name: true } } } },
      },
    });

    res.json(
      users.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
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

export default router;
