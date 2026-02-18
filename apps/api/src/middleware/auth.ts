import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/tokens.js";
import prisma from "../lib/prisma.js";

export interface AuthUser {
  userId: string;
  roles: string[];
}

// Throttle lastSeenAt updates: at most once per SEEN_INTERVAL_MS per user
const SEEN_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const lastSeenCache = new Map<string, number>();

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  let payload: AccessTokenPayload;
  try {
    payload = verifyAccessToken(header.slice(7));
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  req.user = { userId: payload.userId, roles: payload.roles };

  // Update lastSeenAt in background (throttled) — isolated from auth flow
  const now = Date.now();
  const lastUpdate = lastSeenCache.get(payload.userId) || 0;
  if (now - lastUpdate > SEEN_INTERVAL_MS) {
    lastSeenCache.set(payload.userId, now);
    prisma.user
      .update?.({ where: { id: payload.userId }, data: { lastSeenAt: new Date(now) } })
      ?.catch(() => {});
  }

  next();
}

export function requireRole(...roleNames: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const has = req.user?.roles?.some((r) => roleNames.includes(r));
    if (!has) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

export function requirePermission(entity: string, action: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const count = await prisma.rolePermission.count({
        where: {
          role: { userRoles: { some: { userId: req.user.userId } } },
          permission: { entity, action },
        },
      });

      if (count === 0) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      next();
    } catch (err) {
      console.error("Permission check error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}
