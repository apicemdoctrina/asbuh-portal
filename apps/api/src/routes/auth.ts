import { Router } from "express";
import prisma from "../lib/prisma.js";
import { comparePassword, hashPassword } from "../lib/password.js";
import { signAccessToken, generateRefreshToken, hashToken } from "../lib/tokens.js";
import { setRefreshCookie, clearRefreshCookie, getRefreshCookie } from "../lib/cookie.js";
import { logAudit } from "../lib/audit.js";
import { authLimiter } from "../middleware/rate-limit.js";
import { authenticate, requireRole, requirePermission } from "../middleware/auth.js";
import crypto from "node:crypto";

const router = Router();

const REFRESH_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// POST /api/auth/login
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (!user || !user.isActive) {
      await logAudit({ action: "login_failed", details: { email }, ipAddress: req.ip });
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      await logAudit({
        action: "login_failed",
        userId: user.id,
        details: { email },
        ipAddress: req.ip,
      });
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const roles = user.userRoles.map((ur) => ur.role.name);
    const accessToken = signAccessToken({ userId: user.id, roles });

    // Generate refresh token, store hash in DB
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

    await logAudit({ action: "login", userId: user.id, ipAddress: req.ip });

    res.json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/refresh
router.post("/refresh", async (req, res) => {
  try {
    const token = getRefreshCookie(req.cookies);
    if (!token) {
      res.status(401).json({ error: "No refresh token" });
      return;
    }

    const tokenHash = hashToken(token);
    const stored = await prisma.refreshToken.findFirst({
      where: { tokenHash },
      include: {
        user: {
          include: { userRoles: { include: { role: true } } },
        },
      },
    });

    if (!stored || stored.expiresAt < new Date()) {
      if (stored) {
        await prisma.refreshToken.delete({ where: { id: stored.id } });
      }
      clearRefreshCookie(res);
      res.status(401).json({ error: "Invalid or expired refresh token" });
      return;
    }

    // Rotation: delete old, create new
    await prisma.refreshToken.delete({ where: { id: stored.id } });

    const newRefreshToken = generateRefreshToken();
    const newJti = crypto.randomUUID();
    await prisma.refreshToken.create({
      data: {
        jti: newJti,
        tokenHash: hashToken(newRefreshToken),
        userId: stored.userId,
        expiresAt: new Date(Date.now() + REFRESH_EXPIRES_MS),
      },
    });

    const roles = stored.user.userRoles.map((ur) => ur.role.name);
    const accessToken = signAccessToken({ userId: stored.userId, roles });

    setRefreshCookie(res, newRefreshToken);

    res.json({ accessToken });
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/logout
router.post("/logout", authenticate, async (req, res) => {
  try {
    const token = getRefreshCookie(req.cookies);
    if (token) {
      const tokenHash = hashToken(token);
      await prisma.refreshToken.deleteMany({ where: { tokenHash } });
    }
    clearRefreshCookie(res);
    await logAudit({ action: "logout", userId: req.user!.userId, ipAddress: req.ip });
    res.json({ message: "ok" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/staff — admin-only: create staff user
router.post("/staff", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { email, password, firstName, lastName, roleNames } = req.body;
    if (!email || !password || !firstName || !lastName) {
      res.status(400).json({ error: "email, password, firstName, lastName are required" });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "User with this email already exists" });
      return;
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: { email, passwordHash, firstName, lastName },
    });

    // Assign roles
    const validRoles = Array.isArray(roleNames) ? roleNames : [];
    if (validRoles.length > 0) {
      const roles = await prisma.role.findMany({ where: { name: { in: validRoles } } });
      await prisma.userRole.createMany({
        data: roles.map((r) => ({ userId: user.id, roleId: r.id })),
      });
    }

    await logAudit({
      action: "user_created",
      userId: req.user!.userId,
      entity: "user",
      entityId: user.id,
      details: { email, roleNames: validRoles },
      ipAddress: req.ip,
    });

    res.status(201).json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    });
  } catch (err) {
    console.error("Staff create error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const INVITE_DEFAULT_HOURS = 72;

// POST /api/auth/invite — create invite token for client registration
router.post(
  "/invite",
  authenticate,
  requirePermission("organization", "edit"),
  async (req, res) => {
    try {
      const { organizationId, expiresInHours } = req.body;
      if (!organizationId) {
        res.status(400).json({ error: "organizationId is required" });
        return;
      }

      const org = await prisma.organization.findUnique({ where: { id: organizationId } });
      if (!org) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      const token = crypto.randomBytes(32).toString("hex");
      const hours = Number(expiresInHours) || INVITE_DEFAULT_HOURS;

      const invite = await prisma.inviteToken.create({
        data: {
          token,
          organizationId,
          createdById: req.user!.userId,
          expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000),
        },
      });

      await logAudit({
        action: "invite_created",
        userId: req.user!.userId,
        entity: "invite_token",
        entityId: invite.id,
        details: { organizationId },
        ipAddress: req.ip,
      });

      res.status(201).json({ token: invite.token, expiresAt: invite.expiresAt });
    } catch (err) {
      console.error("Invite create error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/auth/register — public: client self-registration via invite token
router.post("/register", authLimiter, async (req, res) => {
  try {
    const { email, password, firstName, lastName, inviteToken } = req.body;
    if (!email || !password || !firstName || !lastName || !inviteToken) {
      res.status(400).json({
        error: "email, password, firstName, lastName, inviteToken are required",
      });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const invite = await prisma.inviteToken.findUnique({ where: { token: inviteToken } });
    if (!invite) {
      res.status(400).json({ error: "Invalid invite token" });
      return;
    }
    if (invite.usedAt) {
      res.status(400).json({ error: "Invite token already used" });
      return;
    }
    if (invite.expiresAt < new Date()) {
      res.status(400).json({ error: "Invite token expired" });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "User with this email already exists" });
      return;
    }

    const passwordHash = await hashPassword(password);
    const clientRole = await prisma.role.findUnique({ where: { name: "client" } });
    if (!clientRole) {
      res.status(500).json({ error: "Client role not found, run seed first" });
      return;
    }

    const user = await prisma.user.create({
      data: { email, passwordHash, firstName, lastName },
    });

    // Assign client role + organization membership
    await prisma.userRole.create({ data: { userId: user.id, roleId: clientRole.id } });
    await prisma.organizationMember.create({
      data: { userId: user.id, organizationId: invite.organizationId, role: "client" },
    });

    // Mark invite as used
    await prisma.inviteToken.update({ where: { id: invite.id }, data: { usedAt: new Date() } });

    await logAudit({
      action: "client_registered",
      userId: user.id,
      entity: "user",
      entityId: user.id,
      details: { email, organizationId: invite.organizationId },
      ipAddress: req.ip,
    });

    res.status(201).json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
