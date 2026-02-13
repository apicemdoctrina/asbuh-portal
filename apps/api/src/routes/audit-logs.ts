import { Router } from "express";
import prisma from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const router = Router();

const SENSITIVE_KEYS = /password|token|refresh|secret|login/i;

function sanitizeDetails(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeDetails);
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.test(key)) {
        result[key] = "***";
      } else if (typeof value === "object" && value !== null) {
        result[key] = sanitizeDetails(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
  return obj;
}

// GET /api/audit-logs
router.get("/", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const { search, entity, userId, from, to } = req.query as Record<string, string | undefined>;

    const where: Record<string, unknown> = {};

    if (entity) {
      where.entity = entity;
    }

    if (userId) {
      where.userId = userId;
    }

    if (from || to) {
      const createdAt: Record<string, Date> = {};
      if (from) createdAt.gte = new Date(`${from}T00:00:00.000Z`);
      if (to) createdAt.lte = new Date(`${to}T23:59:59.999Z`);
      where.createdAt = createdAt;
    }

    if (search) {
      where.OR = [
        { action: { contains: search, mode: "insensitive" } },
        { entityId: { contains: search, mode: "insensitive" } },
        { ipAddress: { contains: search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    const sanitized = data.map((log) => ({
      ...log,
      details: sanitizeDetails(log.details),
    }));

    res.json({ data: sanitized, total, page, limit });
  } catch (err) {
    console.error("Audit logs error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
