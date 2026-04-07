import { Router } from "express";
import prisma from "../lib/prisma.js";
import { logAudit } from "../lib/audit.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { sendZodError } from "../lib/route-helpers.js";
import { createClientGroupSchema, updateClientGroupSchema } from "../lib/validators.js";

const router = Router();

// GET /api/client-groups — list all groups
router.get("/", authenticate, requirePermission("organization", "view"), async (req, res) => {
  try {
    const groups = await prisma.clientGroup.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { organizations: true } },
      },
    });
    res.json(groups);
  } catch (err) {
    console.error("List client groups error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/client-groups/:id — detail with organizations
router.get("/:id", authenticate, requirePermission("organization", "view"), async (req, res) => {
  try {
    const group = await prisma.clientGroup.findUnique({
      where: { id: req.params.id },
      include: {
        organizations: {
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            inn: true,
            status: true,
            monthlyPayment: true,
            paymentDestination: true,
            paymentFrequency: true,
            serviceStartDate: true,
            debtAmount: true,
          },
        },
      },
    });
    if (!group) {
      res.status(404).json({ error: "Client group not found" });
      return;
    }
    res.json(group);
  } catch (err) {
    console.error("Get client group error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/client-groups — create
router.post("/", authenticate, requirePermission("organization", "create"), async (req, res) => {
  try {
    const result = createClientGroupSchema.safeParse(req.body);
    if (!result.success) {
      sendZodError(res, result.error);
      return;
    }
    const group = await prisma.clientGroup.create({ data: result.data });
    await logAudit({
      action: "client_group_created",
      userId: req.user!.userId,
      entity: "client_group",
      entityId: group.id,
      details: result.data,
      ipAddress: req.ip,
    });
    res.status(201).json(group);
  } catch (err) {
    console.error("Create client group error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/client-groups/:id — update
router.put("/:id", authenticate, requirePermission("organization", "edit"), async (req, res) => {
  try {
    const result = updateClientGroupSchema.safeParse(req.body);
    if (!result.success) {
      sendZodError(res, result.error);
      return;
    }
    const existing = await prisma.clientGroup.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Client group not found" });
      return;
    }
    const group = await prisma.clientGroup.update({
      where: { id: req.params.id },
      data: result.data,
    });
    await logAudit({
      action: "client_group_updated",
      userId: req.user!.userId,
      entity: "client_group",
      entityId: group.id,
      details: result.data,
      ipAddress: req.ip,
    });
    res.json(group);
  } catch (err) {
    console.error("Update client group error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/client-groups/:id — delete (unlinks orgs via SetNull)
router.delete(
  "/:id",
  authenticate,
  requirePermission("organization", "delete"),
  async (req, res) => {
    try {
      const existing = await prisma.clientGroup.findUnique({ where: { id: req.params.id } });
      if (!existing) {
        res.status(404).json({ error: "Client group not found" });
        return;
      }
      await prisma.clientGroup.delete({ where: { id: req.params.id } });
      await logAudit({
        action: "client_group_deleted",
        userId: req.user!.userId,
        entity: "client_group",
        entityId: req.params.id,
        ipAddress: req.ip,
      });
      res.status(204).end();
    } catch (err) {
      console.error("Delete client group error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
