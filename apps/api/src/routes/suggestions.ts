import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

const createSchema = z.object({
  body: z.string().trim().min(3).max(10_000),
  pageUrl: z
    .string()
    .trim()
    .max(1000)
    .regex(/^\/[A-Za-z0-9_\-./?&=%#]*$/, "pageUrl must be a relative path")
    .optional()
    .nullable(),
});

// POST /api/suggestions — любой залогиненный пользователь может оставить предложение
router.post("/", authenticate, async (req, res) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const userId = req.user!.userId;
    const created = await prisma.suggestion.create({
      data: {
        body: parsed.data.body,
        pageUrl: parsed.data.pageUrl || null,
        userId,
      },
    });
    await logAudit({
      action: "suggestion_created",
      userId,
      entity: "suggestion",
      entityId: created.id,
    });
    return res.status(201).json({ id: created.id });
  } catch (err) {
    console.error("[suggestions] create error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/suggestions — admin only
router.get("/", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const includeArchived = req.query.archived === "1";
    const items = await prisma.suggestion.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return res.json(items);
  } catch (err) {
    console.error("[suggestions] list error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/suggestions/:id — admin marks read / archives
const patchSchema = z.object({
  read: z.boolean().optional(),
  archived: z.boolean().optional(),
});

router.patch("/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input" });
    }
    const data: { readAt?: Date | null; archivedAt?: Date | null } = {};
    if (parsed.data.read !== undefined) data.readAt = parsed.data.read ? new Date() : null;
    if (parsed.data.archived !== undefined)
      data.archivedAt = parsed.data.archived ? new Date() : null;
    const updated = await prisma.suggestion.update({ where: { id: req.params.id }, data });
    return res.json(updated);
  } catch (err) {
    console.error("[suggestions] patch error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
