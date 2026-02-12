import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/tokens.js";
import prisma from "../lib/prisma.js";

export interface AuthUser {
  userId: string;
  roles: string[];
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    const payload = verifyAccessToken(header.slice(7));
    req.user = { userId: payload.userId, roles: payload.roles };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
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
