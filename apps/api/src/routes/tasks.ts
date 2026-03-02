import { Router } from "express";
import prisma from "../lib/prisma.js";
import { logAudit } from "../lib/audit.js";
import { authenticate, requirePermission } from "../middleware/auth.js";

const router = Router();

const INCLUDE = {
  organization: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  checklistItems: { select: { done: true }, orderBy: { position: "asc" as const } },
  _count: { select: { comments: true } },
};

const COMMENT_AUTHOR_SELECT = { id: true, firstName: true, lastName: true };

function isAdminOrManager(roles: string[]) {
  return roles.some((r) => ["admin", "manager"].includes(r));
}

// GET /api/tasks
router.get("/", authenticate, requirePermission("task", "view"), async (req, res) => {
  try {
    const { status, organizationId, assignedToId, overdue, my } = req.query;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (status) where.status = status;
    if (organizationId) where.organizationId = organizationId as string;
    if (assignedToId) where.assignedToId = assignedToId as string;
    if (my === "true") where.assignedToId = req.user.userId;

    if (overdue === "true") {
      where.dueDate = { lt: new Date() };
      where.status = { notIn: ["DONE", "CANCELLED"] };
    }

    const tasks = await prisma.task.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });

    res.json(tasks);
  } catch (err) {
    console.error("GET /api/tasks error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tasks
router.post("/", authenticate, requirePermission("task", "create"), async (req, res) => {
  try {
    const { title, description, priority, category, dueDate, organizationId, assignedToId } =
      req.body;

    if (!title?.trim()) {
      return res.status(400).json({ error: "title is required" });
    }

    const task = await prisma.task.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        priority: priority || "MEDIUM",
        category: category || "OTHER",
        dueDate: dueDate ? new Date(dueDate) : null,
        organizationId: organizationId || null,
        assignedToId: assignedToId || null,
        createdById: req.user.userId,
      },
      include: INCLUDE,
    });

    await logAudit({
      action: "task.create",
      userId: req.user.userId,
      entity: "task",
      entityId: task.id,
      details: { title: task.title },
    });

    res.status(201).json(task);
  } catch (err) {
    console.error("POST /api/tasks error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/tasks/:id
router.put("/:id", authenticate, requirePermission("task", "edit"), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      status,
      priority,
      category,
      dueDate,
      organizationId,
      assignedToId,
    } = req.body;

    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Task not found" });

    if (!isAdminOrManager(req.user.roles) && existing.createdById !== req.user.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    if (title !== undefined) data.title = title.trim();
    if (description !== undefined) data.description = description?.trim() || null;
    if (status !== undefined) data.status = status;
    if (priority !== undefined) data.priority = priority;
    if (category !== undefined) data.category = category;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
    if (organizationId !== undefined) data.organizationId = organizationId || null;
    if (assignedToId !== undefined) data.assignedToId = assignedToId || null;

    const task = await prisma.task.update({
      where: { id },
      data,
      include: INCLUDE,
    });

    await logAudit({
      action: "task.update",
      userId: req.user.userId,
      entity: "task",
      entityId: task.id,
      details: data,
    });

    res.json(task);
  } catch (err) {
    console.error("PUT /api/tasks/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/tasks/:id
router.delete("/:id", authenticate, requirePermission("task", "delete"), async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Task not found" });

    if (!isAdminOrManager(req.user.roles) && existing.createdById !== req.user.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await prisma.task.delete({ where: { id } });

    await logAudit({
      action: "task.delete",
      userId: req.user.userId,
      entity: "task",
      entityId: id,
      details: { title: existing.title },
    });

    res.status(204).send();
  } catch (err) {
    console.error("DELETE /api/tasks/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/tasks/:id/comments
router.get("/:id/comments", authenticate, requirePermission("task", "view"), async (req, res) => {
  try {
    const { id } = req.params;

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return res.status(404).json({ error: "Task not found" });

    const comments = await prisma.taskComment.findMany({
      where: { taskId: id },
      include: { author: { select: COMMENT_AUTHOR_SELECT } },
      orderBy: { createdAt: "asc" },
    });

    res.json(comments);
  } catch (err) {
    console.error("GET /api/tasks/:id/comments error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tasks/:id/comments
router.post("/:id/comments", authenticate, requirePermission("task", "view"), async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    if (!text?.trim()) {
      return res.status(400).json({ error: "text is required" });
    }

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return res.status(404).json({ error: "Task not found" });

    const comment = await prisma.taskComment.create({
      data: { taskId: id, authorId: req.user.userId, text: text.trim() },
      include: { author: { select: COMMENT_AUTHOR_SELECT } },
    });

    res.status(201).json(comment);
  } catch (err) {
    console.error("POST /api/tasks/:id/comments error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/tasks/:id/checklist
router.get("/:id/checklist", authenticate, requirePermission("task", "view"), async (req, res) => {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) return res.status(404).json({ error: "Task not found" });

    const items = await prisma.taskChecklistItem.findMany({
      where: { taskId: req.params.id },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });

    res.json(items);
  } catch (err) {
    console.error("GET /api/tasks/:id/checklist error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tasks/:id/checklist
router.post("/:id/checklist", authenticate, requirePermission("task", "edit"), async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: "text is required" });

    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) return res.status(404).json({ error: "Task not found" });

    const last = await prisma.taskChecklistItem.findFirst({
      where: { taskId: req.params.id },
      orderBy: { position: "desc" },
    });

    const item = await prisma.taskChecklistItem.create({
      data: { taskId: req.params.id, text: text.trim(), position: (last?.position ?? -1) + 1 },
    });

    res.status(201).json(item);
  } catch (err) {
    console.error("POST /api/tasks/:id/checklist error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/tasks/:id/checklist/:itemId
router.patch(
  "/:id/checklist/:itemId",
  authenticate,
  requirePermission("task", "edit"),
  async (req, res) => {
    try {
      const existing = await prisma.taskChecklistItem.findFirst({
        where: { id: req.params.itemId, taskId: req.params.id },
      });
      if (!existing) return res.status(404).json({ error: "Item not found" });

      const data: { done?: boolean; text?: string } = {};
      if (req.body.done !== undefined) data.done = req.body.done;
      if (req.body.text !== undefined) data.text = req.body.text.trim();

      const item = await prisma.taskChecklistItem.update({
        where: { id: req.params.itemId },
        data,
      });

      res.json(item);
    } catch (err) {
      console.error("PATCH /api/tasks/:id/checklist/:itemId error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// DELETE /api/tasks/:id/checklist/:itemId
router.delete(
  "/:id/checklist/:itemId",
  authenticate,
  requirePermission("task", "edit"),
  async (req, res) => {
    try {
      const existing = await prisma.taskChecklistItem.findFirst({
        where: { id: req.params.itemId, taskId: req.params.id },
      });
      if (!existing) return res.status(404).json({ error: "Item not found" });

      await prisma.taskChecklistItem.delete({ where: { id: req.params.itemId } });
      res.status(204).send();
    } catch (err) {
      console.error("DELETE /api/tasks/:id/checklist/:itemId error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
