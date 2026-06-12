import { Router } from "express";
import prisma from "../../lib/prisma.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { COMMENT_AUTHOR_SELECT, findTaskInScope, notifyTaskRecipients } from "./helpers.js";

const router = Router();

// GET /api/tasks/:id/comments
router.get("/:id/comments", authenticate, requirePermission("task", "view"), async (req, res) => {
  try {
    const { id } = req.params;

    const task = await findTaskInScope(id, req.user!.userId, req.user!.roles);
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

    const task = await findTaskInScope(id, req.user!.userId, req.user!.roles);
    if (!task) return res.status(404).json({ error: "Task not found" });

    const comment = await prisma.taskComment.create({
      data: { taskId: id, authorId: req.user!.userId, text: text.trim() },
      include: { author: { select: COMMENT_AUTHOR_SELECT } },
    });

    const authorName =
      `${comment.author.firstName ?? ""} ${comment.author.lastName ?? ""}`.trim() || "Сотрудник";
    const preview = text.trim().length > 200 ? text.trim().slice(0, 200) + "…" : text.trim();
    notifyTaskRecipients(
      id,
      req.user!.userId,
      "task_comment",
      "Новый комментарий к задаче",
      `${authorName}: ${preview}`,
      `💬 <b>Новый комментарий</b>\n\n«${task.title}»\n\n<b>${authorName}:</b>\n${preview}`,
    ).catch(console.error);

    res.status(201).json(comment);
  } catch (err) {
    console.error("POST /api/tasks/:id/comments error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
