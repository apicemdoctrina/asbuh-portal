import { Router } from "express";
import prisma from "../lib/prisma.js";
import { logAudit } from "../lib/audit.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { createWorkContactSchema, updateWorkContactSchema } from "../lib/validators.js";

const router = Router();

// GET /api/work-contacts — list with optional search & pagination
router.get("/", authenticate, requirePermission("work_contact", "view"), async (req, res) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { position: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      prisma.workContact.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
        include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
      }),
      prisma.workContact.count({ where }),
    ]);

    res.json({ data, total, page, limit });
  } catch (err) {
    console.error("WorkContacts list error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/work-contacts — create
router.post("/", authenticate, requirePermission("work_contact", "create"), async (req, res) => {
  try {
    const parsed = createWorkContactSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const contact = await prisma.workContact.create({
      data: { ...parsed.data, createdById: req.user!.userId },
    });

    await logAudit({
      action: "work_contact.create",
      userId: req.user!.userId,
      entity: "work_contact",
      entityId: contact.id,
      details: parsed.data,
      ipAddress: req.ip,
    });

    res.status(201).json(contact);
  } catch (err) {
    console.error("WorkContacts create error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/work-contacts/:id — update
router.put("/:id", authenticate, requirePermission("work_contact", "edit"), async (req, res) => {
  try {
    const parsed = updateWorkContactSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const existing = await prisma.workContact.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    const contact = await prisma.workContact.update({
      where: { id: req.params.id },
      data: parsed.data,
    });

    await logAudit({
      action: "work_contact.edit",
      userId: req.user!.userId,
      entity: "work_contact",
      entityId: contact.id,
      details: parsed.data,
      ipAddress: req.ip,
    });

    res.json(contact);
  } catch (err) {
    console.error("WorkContacts update error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/work-contacts/:id — delete
router.delete(
  "/:id",
  authenticate,
  requirePermission("work_contact", "delete"),
  async (req, res) => {
    try {
      const existing = await prisma.workContact.findUnique({ where: { id: req.params.id } });
      if (!existing) {
        res.status(404).json({ error: "Contact not found" });
        return;
      }

      await prisma.workContact.delete({ where: { id: req.params.id } });

      await logAudit({
        action: "work_contact.delete",
        userId: req.user!.userId,
        entity: "work_contact",
        entityId: req.params.id,
        details: { name: existing.name },
        ipAddress: req.ip,
      });

      res.json({ success: true });
    } catch (err) {
      console.error("WorkContacts delete error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
