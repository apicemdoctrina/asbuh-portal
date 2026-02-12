import { Router } from "express";
import prisma from "../lib/prisma.js";
import { comparePassword } from "../lib/password.js";
import { signAccessToken, generateRefreshToken, hashToken } from "../lib/tokens.js";
import { setRefreshCookie, clearRefreshCookie, getRefreshCookie } from "../lib/cookie.js";
import { logAudit } from "../lib/audit.js";
import { authLimiter } from "../middleware/rate-limit.js";
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

// POST /api/auth/logout (will be protected with authenticate in commit 3)
router.post("/logout", async (req, res) => {
  try {
    const token = getRefreshCookie(req.cookies);
    if (token) {
      const tokenHash = hashToken(token);
      await prisma.refreshToken.deleteMany({ where: { tokenHash } });
    }
    clearRefreshCookie(res);
    res.json({ message: "ok" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
