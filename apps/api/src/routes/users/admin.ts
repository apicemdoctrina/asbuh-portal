import { Router } from "express";
import prisma from "../../lib/prisma.js";
import { logAudit } from "../../lib/audit.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { hashPassword } from "../../lib/password.js";
import { notifyWithTelegram } from "../../lib/notify.js";
import { isPrismaUniqueError } from "../../lib/route-helpers.js";
import type { Prisma } from "@prisma/client";

const router = Router();

// GET /api/users/:id — view user profile (admin only)
router.get("/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        userRoles: {
          include: { role: { select: { name: true } } },
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

    res.json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarPath ? `/uploads/${user.avatarPath}` : null,
      phone: user.phone,
      birthDate: user.birthDate,
      salary: user.salary !== null ? Number(user.salary) : null,
      tax: user.tax !== null ? Number(user.tax) : null,
      lastSeenAt: user.lastSeenAt,
      isActive: user.isActive,
      createdAt: user.createdAt,
      roles: user.userRoles.map((ur) => ur.role.name),
      organizations: user.organizationMembers.map((om) => ({
        id: om.organization.id,
        name: om.organization.name,
        inn: om.organization.inn,
        role: om.role,
      })),
    });
  } catch (err) {
    console.error("Get user error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/users/:id/password — admin sets password for any user
router.patch("/:id/password", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      res.status(400).json({ error: "Пароль должен быть не менее 8 символов" });
      return;
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id }, data: { passwordHash } });

    // Invalidate all existing refresh tokens for this user
    await prisma.refreshToken.deleteMany({ where: { userId: id } });

    await logAudit({
      action: "admin_password_reset",
      userId: req.user!.userId,
      entity: "user",
      entityId: id,
      details: { targetEmail: target.email },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Admin set password error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/users/:id/compensation — set salary & tax (admin or supervisor)
router.patch(
  "/:id/compensation",
  authenticate,
  requireRole("admin", "supervisor"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { salary, tax } = req.body ?? {};

      function parseAmount(v: unknown): number | null | "invalid" {
        if (v === null || v === undefined || v === "") return null;
        const n = typeof v === "number" ? v : Number(v);
        if (!Number.isFinite(n) || n < 0) return "invalid";
        return n;
      }

      const salaryParsed = parseAmount(salary);
      const taxParsed = parseAmount(tax);
      if (salaryParsed === "invalid" || taxParsed === "invalid") {
        res.status(400).json({ error: "Некорректные суммы" });
        return;
      }

      const target = await prisma.user.findUnique({ where: { id } });
      if (!target) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      await prisma.user.update({
        where: { id },
        data: { salary: salaryParsed, tax: taxParsed },
      });

      await logAudit({
        action: "user_compensation_updated",
        userId: req.user!.userId,
        entity: "user",
        entityId: id,
        details: { salary: salaryParsed, tax: taxParsed },
        ipAddress: req.ip,
      });

      res.json({ ok: true, salary: salaryParsed, tax: taxParsed });
    } catch (err) {
      console.error("Update compensation error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

const ALLOWED_ROLES = ["admin", "manager", "accountant", "supervisor"];
const ACCOUNTANT_TYPES = ["REPORTING", "PRIMARY", "UNIVERSAL"] as const;

// PUT /api/users/:id — edit user (admin only)
router.put("/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, roleNames, isActive, salary, tax, accountantType } =
      req.body;

    if (accountantType !== undefined && accountantType !== null) {
      if (!ACCOUNTANT_TYPES.includes(accountantType)) {
        res.status(400).json({ error: "Недопустимый тип бухгалтера" });
        return;
      }
    }

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

    // Admin is a singleton: cannot promote another user to admin if one already exists
    if (roleNames !== undefined && roleNames[0] === "admin" && !targetIsAdmin) {
      const existingAdmin = await prisma.user.findFirst({
        where: {
          id: { not: id },
          userRoles: { some: { role: { name: "admin" } } },
        },
        select: { id: true },
      });
      if (existingAdmin) {
        res.status(409).json({ error: "Администратор может быть только один" });
        return;
      }
    }

    // Update user fields
    const data: Prisma.UserUpdateInput = {};
    if (firstName !== undefined) data.firstName = firstName;
    if (lastName !== undefined) data.lastName = lastName;
    if (email !== undefined) data.email = email;
    if (isActive !== undefined) data.isActive = isActive;
    if (salary !== undefined) data.salary = salary === null ? null : Number(salary);
    if (tax !== undefined) data.tax = tax === null ? null : Number(tax);
    if (accountantType !== undefined) data.accountantType = accountantType;

    try {
      await prisma.user.update({ where: { id }, data });
    } catch (err: unknown) {
      if (isPrismaUniqueError(err)) {
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

    // If deactivated, revoke refresh tokens and notify
    if (isActive === false) {
      await prisma.refreshToken.deleteMany({ where: { userId: id } });
      notifyWithTelegram(
        id,
        "account_deactivated",
        "Ваш аккаунт деактивирован",
        "Ваш аккаунт был деактивирован администратором.",
        undefined,
        "⛔ Ваш аккаунт был деактивирован администратором.",
      ).catch(console.error);
    }

    await logAudit({
      action: "user_updated",
      userId: req.user!.userId,
      entity: "user",
      entityId: id,
      details: { firstName, lastName, email, roleNames, isActive, salary, tax },
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

      notifyWithTelegram(
        id,
        "account_deactivated",
        "Ваш аккаунт деактивирован",
        "Ваш аккаунт был деактивирован администратором.",
        undefined,
        "⛔ Ваш аккаунт был деактивирован администратором.",
      ).catch(console.error);

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
