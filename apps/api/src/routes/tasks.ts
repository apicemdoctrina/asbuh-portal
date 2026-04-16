import { Router } from "express";
import { randomUUID } from "crypto";
import prisma from "../lib/prisma.js";
import { logAudit } from "../lib/audit.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { notifyAssigned } from "../lib/task-notifier.js";
import { createNotification } from "../lib/notify.js";

const router = Router();

const ASSIGNEE_SELECT = { id: true, firstName: true, lastName: true };

const INCLUDE = {
  organization: { select: { id: true, name: true } },
  reportType: { select: { id: true, name: true, code: true } },
  assignees: { include: { user: { select: ASSIGNEE_SELECT } } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  checklistItems: { select: { done: true }, orderBy: { position: "asc" as const } },
  _count: { select: { comments: true } },
};

const COMMENT_AUTHOR_SELECT = { id: true, firstName: true, lastName: true };

function isAdminOrManager(roles: string[]) {
  return roles.some((r) => ["admin", "supervisor", "manager"].includes(r));
}

function calcNextDue(from: Date, type: string, interval: number): Date {
  const d = new Date(from);
  switch (type) {
    case "DAILY":
      d.setDate(d.getDate() + interval);
      break;
    case "WEEKLY":
      d.setDate(d.getDate() + interval * 7);
      break;
    case "MONTHLY":
      d.setMonth(d.getMonth() + interval);
      break;
    case "YEARLY":
      d.setFullYear(d.getFullYear() + interval);
      break;
  }
  return d;
}

// GET /api/tasks
router.get("/", authenticate, requirePermission("task", "view"), async (req, res) => {
  try {
    const { status, organizationId, assignedToId, overdue, archived } = req.query;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    // Archive scope: archived=true → only archived (admin/supervisor only); default → exclude archived
    const canViewArchive = req.user!.roles.some((r) => ["admin", "supervisor"].includes(r));
    if (archived === "true" && canViewArchive) {
      where.archivedAt = { not: null };
    } else {
      where.archivedAt = null;
    }

    if (status) where.status = status;

    if (organizationId) {
      // Inside an org card — show all tasks for that org
      where.organizationId = organizationId as string;
    } else if (!req.user!.roles.some((r) => ["admin", "supervisor"].includes(r))) {
      // Tasks page — show only tasks the user created or is assigned to (not for admin)
      where.OR = [
        { createdById: req.user!.userId },
        { assignees: { some: { userId: req.user!.userId } } },
      ];
    }

    if (assignedToId) where.assignees = { some: { userId: assignedToId as string } };

    if (overdue === "true") {
      where.dueDate = { lt: new Date() };
      where.status = { notIn: ["DONE", "CANCELLED"] };
    }

    const tasks = await prisma.task.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });

    // Compute hasUnreadComments for each task
    const taskIds = tasks.map((t) => t.id);
    const [lastComments, reads] = await Promise.all([
      prisma.taskComment.groupBy({
        by: ["taskId"],
        where: { taskId: { in: taskIds } },
        _max: { createdAt: true },
      }),
      prisma.taskCommentRead.findMany({
        where: { taskId: { in: taskIds }, userId: req.user!.userId },
      }),
    ]);
    const lastCommentMap = new Map(lastComments.map((c) => [c.taskId, c._max.createdAt]));
    const readMap = new Map(reads.map((r) => [r.taskId, r.lastReadAt]));

    const result = tasks.map((t) => {
      const lastComment = lastCommentMap.get(t.id);
      const lastRead = readMap.get(t.id);
      const hasUnreadComments = !!lastComment && (!lastRead || lastComment > lastRead);
      return { ...t, hasUnreadComments };
    });

    res.json(result);
  } catch (err) {
    console.error("GET /api/tasks error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tasks
router.post("/", authenticate, requirePermission("task", "create"), async (req, res) => {
  try {
    const {
      title,
      description,
      priority,
      category,
      dueDate,
      organizationId,
      organizationIds,
      assignedToIds,
      recurrenceType,
      recurrenceInterval,
    } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({ error: "title is required" });
    }

    const canAssignOthers = isAdminOrManager(req.user!.roles);
    let assigneeIds: string[] = Array.isArray(assignedToIds) ? assignedToIds : [];
    if (!canAssignOthers) {
      // Non-managers can only assign to themselves
      assigneeIds = assigneeIds.filter((id) => id === req.user!.userId);
      if (assigneeIds.length === 0 && assignedToIds?.length > 0) {
        return res.status(403).json({ error: "Можно назначать задачи только себе" });
      }
    }

    // Support multi-org creation: one task per org
    const orgIdList: (string | null)[] =
      Array.isArray(organizationIds) && organizationIds.length > 0
        ? organizationIds
        : [organizationId || null];

    // Tasks created for multiple orgs at once share a groupId
    const groupId = orgIdList.length > 1 ? randomUUID() : undefined;

    const createdTasks = [];

    for (const orgId of orgIdList) {
      const task = await prisma.task.create({
        data: {
          title: title.trim(),
          description: description?.trim() || null,
          priority: priority || "MEDIUM",
          category: category || "OTHER",
          dueDate: dueDate ? new Date(dueDate) : null,
          recurrenceType: recurrenceType || null,
          recurrenceInterval: recurrenceInterval ? Number(recurrenceInterval) : 1,
          groupId: groupId ?? null,
          organizationId: orgId || null,
          createdById: req.user.userId,
          assignees: assigneeIds.length
            ? { create: assigneeIds.map((uid) => ({ userId: uid })) }
            : undefined,
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

      // Notify each new assignee (fire-and-forget)
      const orgName = task.organization ? ` · ${task.organization.name}` : "";
      const taskLink = task.organizationId ? `/organizations/${task.organizationId}` : "/tasks";
      for (const a of task.assignees) {
        notifyAssigned({
          title: task.title,
          description: task.description,
          priority: task.priority,
          category: task.category,
          dueDate: task.dueDate,
          assignedToId: a.userId,
          organization: task.organization,
          assignedBy: task.createdBy,
        }).catch(console.error);
        createNotification(
          a.userId,
          "task_assigned",
          "Вам назначена задача",
          `${task.title}${orgName}`,
          taskLink,
        ).catch(console.error);
      }

      createdTasks.push(task);
    }

    res.status(201).json(createdTasks.length === 1 ? createdTasks[0] : createdTasks);
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
      addOrganizationIds,
      assignedToIds,
      recurrenceType,
      recurrenceInterval,
    } = req.body;

    const existing = await prisma.task.findUnique({
      where: { id },
      include: { assignees: { select: { userId: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Task not found" });

    const isAssignee = existing.assignees.some((a) => a.userId === req.user.userId);
    if (
      !isAdminOrManager(req.user.roles) &&
      existing.createdById !== req.user.userId &&
      !isAssignee
    ) {
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
    if (recurrenceType !== undefined) data.recurrenceType = recurrenceType || null;
    if (recurrenceInterval !== undefined) data.recurrenceInterval = Number(recurrenceInterval) || 1;

    // Replace assignees if provided
    if (assignedToIds !== undefined) {
      let newIds: string[] = Array.isArray(assignedToIds) ? assignedToIds : [];
      if (!isAdminOrManager(req.user!.roles)) {
        newIds = newIds.filter((id) => id === req.user!.userId);
      }
      await prisma.taskAssignee.deleteMany({ where: { taskId: id } });
      if (newIds.length > 0) {
        await prisma.taskAssignee.createMany({
          data: newIds.map((uid) => ({ taskId: id, userId: uid })),
        });
      }
    }

    const task = await prisma.task.update({
      where: { id },
      data,
      include: INCLUDE,
    });

    // Auto-spawn next occurrence when a recurring task is completed
    const completingNow = existing.status !== "DONE" && data.status === "DONE";
    const effectiveRecurrence = data.recurrenceType ?? existing.recurrenceType;
    const effectiveDueDate = data.dueDate ?? existing.dueDate;

    if (completingNow && effectiveRecurrence && effectiveDueDate) {
      const nextDue = calcNextDue(
        effectiveDueDate,
        effectiveRecurrence,
        data.recurrenceInterval ?? existing.recurrenceInterval,
      );
      const spawned = await prisma.task.create({
        data: {
          title: task.title,
          description: task.description,
          priority: task.priority,
          category: task.category,
          dueDate: nextDue,
          recurrenceType: task.recurrenceType,
          recurrenceInterval: task.recurrenceInterval,
          organizationId: task.organizationId,
          createdById: task.createdById,
        },
      });
      if (task.assignees.length > 0) {
        await prisma.taskAssignee.createMany({
          data: task.assignees.map((a) => ({ taskId: spawned.id, userId: a.userId })),
        });
      }
    }

    await logAudit({
      action: "task.update",
      userId: req.user.userId,
      entity: "task",
      entityId: task.id,
      details: data,
    });

    // Notify newly added assignees
    if (assignedToIds !== undefined) {
      const existingIds = new Set(existing.assignees.map((a) => a.userId));
      const orgName = task.organization ? ` · ${task.organization.name}` : "";
      const taskLink = task.organizationId ? `/organizations/${task.organizationId}` : "/tasks";
      for (const a of task.assignees) {
        if (existingIds.has(a.userId)) continue;
        notifyAssigned({
          title: task.title,
          description: task.description,
          priority: task.priority,
          category: task.category,
          dueDate: task.dueDate,
          assignedToId: a.userId,
          organization: task.organization,
          assignedBy: task.createdBy,
        }).catch(console.error);
        createNotification(
          a.userId,
          "task_assigned",
          "Вам назначена задача",
          `${task.title}${orgName}`,
          taskLink,
        ).catch(console.error);
      }
    }

    // Clone task for additional organizations
    if (Array.isArray(addOrganizationIds) && addOrganizationIds.length > 0) {
      // Use first clone as group anchor if original has no org
      const firstClone = await prisma.task.create({
        data: {
          title: task.title,
          description: task.description,
          priority: task.priority,
          category: task.category,
          dueDate: task.dueDate,
          recurrenceType: task.recurrenceType,
          recurrenceInterval: task.recurrenceInterval,
          organizationId: addOrganizationIds[0],
          groupId: task.organizationId ? (task.groupId ?? task.id) : undefined,
          createdById: req.user!.userId,
        },
      });

      // Determine groupId: use existing, or first clone as anchor when original has no org
      const groupId = task.organizationId ? (task.groupId ?? task.id) : firstClone.id;

      // Set groupId on first clone if it wasn't set yet
      if (!task.organizationId) {
        await prisma.task.update({ where: { id: firstClone.id }, data: { groupId } });
      }

      // Create remaining clones
      for (let i = 1; i < addOrganizationIds.length; i++) {
        const cloned = await prisma.task.create({
          data: {
            title: task.title,
            description: task.description,
            priority: task.priority,
            category: task.category,
            dueDate: task.dueDate,
            recurrenceType: task.recurrenceType,
            recurrenceInterval: task.recurrenceInterval,
            organizationId: addOrganizationIds[i],
            groupId,
            createdById: req.user!.userId,
          },
        });
        if (task.assignees.length > 0) {
          await prisma.taskAssignee.createMany({
            data: task.assignees.map((a) => ({ taskId: cloned.id, userId: a.userId })),
          });
        }
      }

      // Copy assignees to first clone
      if (task.assignees.length > 0) {
        await prisma.taskAssignee.createMany({
          data: task.assignees.map((a) => ({ taskId: firstClone.id, userId: a.userId })),
        });
      }

      // Set groupId on original only if it has an org
      if (task.organizationId && !task.groupId) {
        await prisma.task.update({ where: { id: task.id }, data: { groupId } });
      }
    }

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

    // Mark comments as read
    await prisma.taskCommentRead.upsert({
      where: { taskId_userId: { taskId: id, userId: req.user!.userId } },
      update: { lastReadAt: new Date() },
      create: { taskId: id, userId: req.user!.userId },
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
    const { text, dueDate } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: "text is required" });

    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) return res.status(404).json({ error: "Task not found" });

    const last = await prisma.taskChecklistItem.findFirst({
      where: { taskId: req.params.id },
      orderBy: { position: "desc" },
    });

    const item = await prisma.taskChecklistItem.create({
      data: {
        taskId: req.params.id,
        text: text.trim(),
        position: (last?.position ?? -1) + 1,
        dueDate: dueDate ? new Date(dueDate) : null,
      },
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

      const data: { done?: boolean; text?: string; dueDate?: Date | null } = {};
      if (req.body.done !== undefined) data.done = req.body.done;
      if (req.body.text !== undefined) data.text = req.body.text.trim();
      if (req.body.dueDate !== undefined)
        data.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;

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
