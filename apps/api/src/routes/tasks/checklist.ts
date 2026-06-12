import { Router } from "express";
import prisma from "../../lib/prisma.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { findTaskInScope, notifyTaskRecipients } from "./helpers.js";

const router = Router();

// GET /api/tasks/:id/checklist
router.get("/:id/checklist", authenticate, requirePermission("task", "view"), async (req, res) => {
  try {
    const task = await findTaskInScope(req.params.id, req.user!.userId, req.user!.roles);
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

    const task = await findTaskInScope(req.params.id, req.user!.userId, req.user!.roles);
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

    notifyTaskRecipients(
      req.params.id,
      req.user!.userId,
      "task_checklist_changed",
      "Изменение чек-листа",
      `«${task.title}»: добавлен пункт «${item.text}»`,
      `✏️ <b>Чек-лист задачи</b>\n\n«${task.title}»\n\n+ пункт: «${item.text}»`,
    ).catch(console.error);

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
      const task = await findTaskInScope(req.params.id, req.user!.userId, req.user!.roles);
      if (!task) return res.status(404).json({ error: "Task not found" });

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

      const parentTask = await prisma.task.findUnique({
        where: { id: req.params.id },
        select: { title: true },
      });
      if (parentTask) {
        const changeParts: string[] = [];
        if (data.done !== undefined && data.done !== existing.done) {
          changeParts.push(data.done ? "✅ выполнен" : "↩ возвращён в работу");
        }
        if (data.text !== undefined && data.text !== existing.text) {
          changeParts.push(`текст: «${existing.text}» → «${data.text}»`);
        }
        if (data.dueDate !== undefined) {
          const oldDue = existing.dueDate?.toISOString().slice(0, 10) ?? "—";
          const newDue = data.dueDate ? new Date(data.dueDate).toISOString().slice(0, 10) : "—";
          if (oldDue !== newDue) changeParts.push(`срок пункта: ${oldDue} → ${newDue}`);
        }
        if (changeParts.length > 0) {
          const summary = `пункт «${item.text}»: ${changeParts.join("; ")}`;
          notifyTaskRecipients(
            req.params.id,
            req.user!.userId,
            "task_checklist_changed",
            "Изменение чек-листа",
            `«${parentTask.title}»: ${summary}`,
            `✏️ <b>Чек-лист задачи</b>\n\n«${parentTask.title}»\n\n${summary}`,
          ).catch(console.error);
        }
      }

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
      const task = await findTaskInScope(req.params.id, req.user!.userId, req.user!.roles);
      if (!task) return res.status(404).json({ error: "Task not found" });

      const existing = await prisma.taskChecklistItem.findFirst({
        where: { id: req.params.itemId, taskId: req.params.id },
      });
      if (!existing) return res.status(404).json({ error: "Item not found" });

      await prisma.taskChecklistItem.delete({ where: { id: req.params.itemId } });

      const parentTask = await prisma.task.findUnique({
        where: { id: req.params.id },
        select: { title: true },
      });
      if (parentTask) {
        notifyTaskRecipients(
          req.params.id,
          req.user!.userId,
          "task_checklist_changed",
          "Изменение чек-листа",
          `«${parentTask.title}»: удалён пункт «${existing.text}»`,
          `✏️ <b>Чек-лист задачи</b>\n\n«${parentTask.title}»\n\n− пункт: «${existing.text}»`,
        ).catch(console.error);
      }

      res.status(204).send();
    } catch (err) {
      console.error("DELETE /api/tasks/:id/checklist/:itemId error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
