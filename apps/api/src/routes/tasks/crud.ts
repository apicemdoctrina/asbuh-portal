import { Router } from "express";
import { randomUUID } from "crypto";
import prisma from "../../lib/prisma.js";
import { logAudit } from "../../lib/audit.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { parsePagination } from "../../lib/route-helpers.js";
import { taskScope } from "../../lib/scoping.js";
import { notifyAssigned } from "../../lib/task-notifier.js";
import { createNotification } from "../../lib/notify.js";
import {
  INCLUDE,
  isAdminOrManager,
  allOrgsAccessible,
  orgVisible,
  findTaskInScope,
  notifyTaskRecipients,
  calcNextDue,
} from "./helpers.js";

const router = Router();

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
      // Inside an org card — show all tasks for that org. Чтение по view-скоупу:
      // организация из клиентской группы видна менеджеру — её задачи тоже.
      if (!(await orgVisible(req.user!.userId, req.user!.roles, organizationId as string))) {
        return res.status(403).json({ error: "Нет доступа к этой организации" });
      }
      where.organizationId = organizationId as string;
    } else {
      // Scope-логика централизована в lib/scoping.ts
      Object.assign(where, taskScope(req.user!.userId, req.user!.roles));
    }

    if (assignedToId) where.assignees = { some: { userId: assignedToId as string } };

    if (overdue === "true") {
      where.dueDate = { lt: new Date() };
      where.status = { notIn: ["DONE", "CANCELLED"] };
    }

    // Bounded list: default 500, optional ?page/?limit (response stays an array)
    const { limit, skip } = parsePagination(req.query.page, req.query.limit ?? 500, 500);
    const tasks = await prisma.task.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: limit,
      skip,
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
      visibleToClient,
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

    if (!(await allOrgsAccessible(req.user!.userId, req.user!.roles, orgIdList))) {
      return res.status(403).json({ error: "Нет доступа к одной из организаций" });
    }

    // Tasks created for multiple orgs at once share a groupId
    const groupId = orgIdList.length > 1 ? randomUUID() : undefined;

    // Default visibleToClient: true for REPORTING tasks, false otherwise
    const resolvedVisibleToClient =
      typeof visibleToClient === "boolean"
        ? visibleToClient
        : (category || "OTHER") === "REPORTING";

    // Все задачи мульти-орг набора создаются атомарно: падение посередине
    // больше не оставляет «половину» набора
    const createdTasks = await prisma.$transaction(
      orgIdList.map((orgId) =>
        prisma.task.create({
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
            createdById: req.user!.userId,
            visibleToClient: resolvedVisibleToClient,
            assignees: assigneeIds.length
              ? { create: assigneeIds.map((uid) => ({ userId: uid })) }
              : undefined,
          },
          include: INCLUDE,
        }),
      ),
    );

    // Side effects (audit + notifications) — после коммита
    for (const task of createdTasks) {
      await logAudit({
        action: "task.create",
        userId: req.user!.userId,
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
      visibleToClient,
    } = req.body;

    // taskScope (участки) ИЛИ личная связь с задачей — менеджер/бухгалтер не может
    // редактировать задачи чужих участков, к которым не имеет отношения
    const existing = await prisma.task.findFirst({
      where: {
        id,
        OR: [
          taskScope(req.user!.userId, req.user!.roles),
          { createdById: req.user!.userId },
          { assignees: { some: { userId: req.user!.userId } } },
        ],
      },
      include: { assignees: { select: { userId: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Task not found" });

    const isAssignee = existing.assignees.some((a) => a.userId === req.user!.userId);
    if (
      !isAdminOrManager(req.user!.roles) &&
      existing.createdById !== req.user!.userId &&
      !isAssignee
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Перенос/клонирование на другие организации — только в пределах скоупа
    const targetOrgIds: (string | null | undefined)[] = [
      ...(organizationId && organizationId !== existing.organizationId ? [organizationId] : []),
      ...(Array.isArray(addOrganizationIds) ? addOrganizationIds : []),
    ];
    if (!(await allOrgsAccessible(req.user!.userId, req.user!.roles, targetOrgIds))) {
      return res.status(403).json({ error: "Нет доступа к одной из организаций" });
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
    if (visibleToClient !== undefined) data.visibleToClient = visibleToClient;

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

    if (existing.status !== "DONE" && data.status === "DONE") {
      data.completedAt = new Date();
    } else if (existing.status === "DONE" && data.status && data.status !== "DONE") {
      data.completedAt = null;
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
          visibleToClient: task.visibleToClient,
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
      userId: req.user!.userId,
      entity: "task",
      entityId: task.id,
      details: data,
    });

    // Notify newly added assignees
    const newlyAddedAssignees: string[] = [];
    if (assignedToIds !== undefined) {
      const existingIds = new Set(existing.assignees.map((a) => a.userId));
      const orgName = task.organization ? ` · ${task.organization.name}` : "";
      const taskLink = task.organizationId ? `/organizations/${task.organizationId}` : "/tasks";
      for (const a of task.assignees) {
        if (existingIds.has(a.userId)) continue;
        newlyAddedAssignees.push(a.userId);
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

    const orgNameSuffix = task.organization ? ` · ${task.organization.name}` : "";

    // Notify about deadline change
    if (data.dueDate !== undefined) {
      const oldDue = existing.dueDate?.toISOString().slice(0, 10) ?? "—";
      const newDue = data.dueDate ? new Date(data.dueDate).toISOString().slice(0, 10) : "—";
      if (oldDue !== newDue) {
        notifyTaskRecipients(
          task.id,
          req.user!.userId,
          "task_due_changed",
          "Изменён срок задачи",
          `«${task.title}»${orgNameSuffix}: ${oldDue} → ${newDue}`,
          `📅 <b>Изменён срок задачи</b>\n\n«${task.title}»${orgNameSuffix}\n\n${oldDue} → <b>${newDue}</b>`,
          newlyAddedAssignees,
        ).catch(console.error);
      }
    }

    // Notify about status change (opt-in, off by default)
    if (data.status !== undefined && data.status !== existing.status) {
      notifyTaskRecipients(
        task.id,
        req.user!.userId,
        "task_status_changed",
        "Изменён статус задачи",
        `«${task.title}»${orgNameSuffix}: ${existing.status} → ${data.status}`,
        `🔄 <b>Изменён статус задачи</b>\n\n«${task.title}»${orgNameSuffix}\n\n${existing.status} → <b>${data.status}</b>`,
        newlyAddedAssignees,
      ).catch(console.error);
    }

    // Notify about other field changes (opt-in, off by default)
    const otherChanges: string[] = [];
    if (data.title !== undefined && data.title !== existing.title) {
      otherChanges.push(`название: «${existing.title}» → «${data.title}»`);
    }
    if (data.description !== undefined && data.description !== existing.description) {
      otherChanges.push("описание изменено");
    }
    if (data.priority !== undefined && data.priority !== existing.priority) {
      otherChanges.push(`приоритет: ${existing.priority} → ${data.priority}`);
    }
    if (data.category !== undefined && data.category !== existing.category) {
      otherChanges.push(`категория: ${existing.category ?? "—"} → ${data.category ?? "—"}`);
    }
    if (assignedToIds !== undefined) {
      const oldIds = new Set(existing.assignees.map((a) => a.userId));
      const newIds = new Set(task.assignees.map((a) => a.userId));
      const added = [...newIds].filter((x) => !oldIds.has(x)).length;
      const removed = [...oldIds].filter((x) => !newIds.has(x)).length;
      if (added || removed) {
        const parts: string[] = [];
        if (added) parts.push(`+${added}`);
        if (removed) parts.push(`-${removed}`);
        otherChanges.push(`исполнители (${parts.join(", ")})`);
      }
    }
    if (otherChanges.length > 0) {
      notifyTaskRecipients(
        task.id,
        req.user!.userId,
        "task_updated",
        "Изменение задачи",
        `«${task.title}»${orgNameSuffix}: ${otherChanges.join("; ")}`,
        `✏️ <b>Изменение задачи</b>\n\n«${task.title}»${orgNameSuffix}\n\n${otherChanges.map((c) => `• ${c}`).join("\n")}`,
        newlyAddedAssignees,
      ).catch(console.error);
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

    const existing = await findTaskInScope(id, req.user!.userId, req.user!.roles);
    if (!existing) return res.status(404).json({ error: "Task not found" });

    if (!isAdminOrManager(req.user!.roles) && existing.createdById !== req.user!.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await prisma.task.delete({ where: { id } });

    await logAudit({
      action: "task.delete",
      userId: req.user!.userId,
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

export default router;
