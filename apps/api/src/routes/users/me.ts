import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import prisma from "../../lib/prisma.js";
import { logAudit } from "../../lib/audit.js";
import { authenticate } from "../../middleware/auth.js";
import { upload, UPLOADS_DIR } from "../../lib/upload.js";
import { hashPassword, comparePassword } from "../../lib/password.js";
import { signAccessToken, generateRefreshToken, hashToken } from "../../lib/tokens.js";
import { setRefreshCookie } from "../../lib/cookie.js";
import { updateProfileSchema, changePasswordSchema } from "../../lib/validators.js";
import { isPrismaUniqueError } from "../../lib/route-helpers.js";

const router = Router();

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
      avatarUrl: user.avatarPath ? `/uploads/${user.avatarPath}` : null,
      phone: user.phone,
      birthDate: user.birthDate,
      lastSeenAt: user.lastSeenAt,
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

// PUT /api/users/me — update own profile
router.put("/me", authenticate, async (req, res) => {
  try {
    const { currentPassword, ...parsed } = updateProfileSchema.parse(req.body);

    // Смена email — только с подтверждением паролем: угнанный access-токен
    // не должен позволять перевесить аккаунт на чужой адрес (перехват reset-ссылок)
    if (parsed.email !== undefined) {
      const me = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { email: true, passwordHash: true },
      });
      if (me && parsed.email !== me.email) {
        if (!currentPassword) {
          res.status(400).json({ error: "Для смены email укажите текущий пароль" });
          return;
        }
        const valid = await comparePassword(currentPassword, me.passwordHash);
        if (!valid) {
          res.status(403).json({ error: "Неверный текущий пароль" });
          return;
        }
      }
    }

    try {
      const updated = await prisma.user.update({
        where: { id: req.user!.userId },
        data: parsed,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          avatarPath: true,
          phone: true,
          birthDate: true,
        },
      });

      await logAudit({
        action: "profile_updated",
        userId: req.user!.userId,
        entity: "user",
        entityId: req.user!.userId,
        details: parsed,
        ipAddress: req.ip,
      });

      res.json({
        id: updated.id,
        email: updated.email,
        firstName: updated.firstName,
        lastName: updated.lastName,
        avatarUrl: updated.avatarPath ? `/uploads/${updated.avatarPath}` : null,
        phone: updated.phone,
        birthDate: updated.birthDate,
      });
    } catch (err: unknown) {
      if (isPrismaUniqueError(err)) {
        res.status(409).json({ error: "Email уже используется" });
        return;
      }
      throw err;
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ZodError") {
      const zodErr = err as { issues?: unknown[] };
      res.status(400).json({ error: "Некорректные данные", details: zodErr.issues });
      return;
    }
    console.error("Update profile error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/users/me/avatar — upload avatar
router.post("/me/avatar", authenticate, upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Файл не загружен" });
      return;
    }

    // Only allow images for avatars
    if (!req.file.mimetype.startsWith("image/")) {
      fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: "Допустимы только изображения" });
      return;
    }

    // Delete old avatar file if exists
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { avatarPath: true },
    });
    if (user?.avatarPath) {
      const oldPath = path.join(UPLOADS_DIR, user.avatarPath);
      fs.unlink(oldPath, () => {});
    }

    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { avatarPath: req.file.filename },
    });

    await logAudit({
      action: "avatar_updated",
      userId: req.user!.userId,
      entity: "user",
      entityId: req.user!.userId,
      ipAddress: req.ip,
    });

    res.json({ avatarUrl: `/uploads/${req.file.filename}` });
  } catch (err) {
    console.error("Upload avatar error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const REFRESH_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000;

// PATCH /api/users/me/password — change own password
router.patch("/me/password", authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: { userRoles: { include: { role: { select: { name: true } } } } },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const valid = await comparePassword(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Неверный текущий пароль" });
      return;
    }

    const newHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { passwordHash: newHash },
    });

    // Revoke all refresh tokens
    await prisma.refreshToken.deleteMany({ where: { userId: req.user!.userId } });

    // Issue new session
    const roles = user.userRoles.map((ur) => ur.role.name);
    const accessToken = signAccessToken({ userId: user.id, roles });
    const refreshToken = generateRefreshToken();
    const jti = crypto.randomUUID();
    await prisma.refreshToken.create({
      data: {
        jti,
        tokenHash: hashToken(refreshToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + REFRESH_EXPIRES_MS),
      },
    });
    setRefreshCookie(res, refreshToken);

    await logAudit({
      action: "password_changed",
      userId: req.user!.userId,
      entity: "user",
      entityId: req.user!.userId,
      ipAddress: req.ip,
    });

    res.json({ accessToken });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ZodError") {
      const zodErr = err as { issues?: unknown[] };
      res.status(400).json({ error: "Некорректные данные", details: zodErr.issues });
      return;
    }
    console.error("Change password error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
