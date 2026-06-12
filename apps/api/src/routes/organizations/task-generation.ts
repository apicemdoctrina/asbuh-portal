import { Router } from "express";
import prisma from "../../lib/prisma.js";
import { logAudit } from "../../lib/audit.js";
import { generateTaskTemplates } from "../../lib/task-generator.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { orgStrictScope } from "../../lib/scoping.js";

const router = Router();

const getScopedWhere = orgStrictScope;

// GET /api/organizations/:id/generate-tasks/preview
// Returns tasks that WOULD be created without writing to DB
router.get(
  "/:id/generate-tasks/preview",
  authenticate,
  requirePermission("task", "create"),
  async (req, res) => {
    try {
      const org = await prisma.organization.findFirst({
        where: { id: req.params.id, ...getScopedWhere(req.user!.userId, req.user!.roles) },
        select: {
          form: true,
          taxSystems: true,
          employeeCount: true,
          hasCashRegister: true,
          digitalSignature: true,
          digitalSignatureExpiry: true,
          serviceType: true,
        },
      });
      if (!org) return res.status(404).json({ error: "Organization not found" });

      const templates = generateTaskTemplates(org);

      // Mark which titles already have an active task for this org
      const existing = await prisma.task.findMany({
        where: { organizationId: req.params.id, status: { notIn: ["DONE", "CANCELLED"] } },
        select: { title: true },
      });
      const existingTitles = new Set(existing.map((t) => t.title));

      res.json(templates.map((t) => ({ ...t, alreadyExists: existingTitles.has(t.title) })));
    } catch (err) {
      console.error("generate-tasks preview error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/organizations/:id/generate-tasks
// Creates tasks based on organization parameters (skips already-existing ones)
router.post(
  "/:id/generate-tasks",
  authenticate,
  requirePermission("task", "create"),
  async (req, res) => {
    try {
      const org = await prisma.organization.findFirst({
        where: { id: req.params.id, ...getScopedWhere(req.user!.userId, req.user!.roles) },
        select: {
          form: true,
          taxSystems: true,
          employeeCount: true,
          hasCashRegister: true,
          digitalSignature: true,
          digitalSignatureExpiry: true,
          serviceType: true,
          members: { select: { userId: true, role: true } },
        },
      });
      if (!org) return res.status(404).json({ error: "Organization not found" });

      const templates = generateTaskTemplates(org);

      const existing = await prisma.task.findMany({
        where: { organizationId: req.params.id, status: { notIn: ["DONE", "CANCELLED"] } },
        select: { title: true },
      });
      const existingTitles = new Set(existing.map((t) => t.title));

      // Assign to first accountant/manager member if available
      const assignee = org.members.find((m) => ["accountant", "manager"].includes(m.role));

      const toCreate = templates.filter((t) => !existingTitles.has(t.title));

      await prisma.$transaction(
        toCreate.map((t) =>
          prisma.task.create({
            data: {
              ...t,
              organizationId: req.params.id,
              createdById: req.user!.userId,
              assignees: assignee ? { create: [{ userId: assignee.userId }] } : undefined,
            },
          }),
        ),
      );

      await logAudit({
        action: "tasks.generate",
        userId: req.user!.userId,
        entity: "organization",
        entityId: req.params.id,
        details: { generated: toCreate.length, skipped: templates.length - toCreate.length },
      });

      res.json({
        generated: toCreate.length,
        skipped: templates.length - toCreate.length,
      });
    } catch (err) {
      console.error("generate-tasks error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
