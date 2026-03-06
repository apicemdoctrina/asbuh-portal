import { Router } from "express";
import prisma from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { parsePagination } from "../lib/route-helpers.js";

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
    const { page, limit, skip } = parsePagination(req.query.page, req.query.limit);

    const { search, entity, action, userId, from, to } = req.query as Record<
      string,
      string | undefined
    >;

    const where: Record<string, unknown> = {};

    if (entity) {
      where.entity = entity;
    }

    if (action) {
      where.action = action;
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (userId) {
      if (!uuidRegex.test(userId)) {
        res.status(400).json({ error: "Invalid userId format" });
        return;
      }
      where.userId = userId;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (from || to) {
      if (from && !dateRegex.test(from)) {
        res.status(400).json({ error: "Invalid 'from' date format. Use YYYY-MM-DD" });
        return;
      }
      if (to && !dateRegex.test(to)) {
        res.status(400).json({ error: "Invalid 'to' date format. Use YYYY-MM-DD" });
        return;
      }
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
        { userAgent: { contains: search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
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

// GET /api/audit-logs/actions — list of distinct actions for filter dropdown
router.get("/actions", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const rows = await prisma.auditLog.findMany({
      select: { action: true },
      distinct: ["action"],
      orderBy: { action: "asc" },
    });
    res.json(rows.map((r) => r.action));
  } catch (err) {
    console.error("Audit actions error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
