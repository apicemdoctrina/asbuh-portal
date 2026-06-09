import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { upload } from "../lib/upload.js";
import { createNotification } from "../lib/notify.js";

const router = Router();

function isStaff(roles: string[]): boolean {
  return roles.includes("admin") || roles.includes("supervisor");
}

const authorSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
} as const;

async function notifyOthers(opts: {
  threadId: string;
  authorId: string;
  authorIsStaff: boolean;
  threadUserId: string;
  subject: string;
}) {
  const { threadId, authorId, authorIsStaff, threadUserId, subject } = opts;
  if (authorIsStaff) {
    // staff отвечает клиенту
    if (threadUserId !== authorId) {
      await createNotification(
        threadUserId,
        "support_reply",
        "Ответ от техподдержки",
        subject,
        `/support/${threadId}`,
      );
    }
  } else {
    // клиент пишет → уведомляем всех admin
    const admins = await prisma.user.findMany({
      where: { roles: { some: { role: { name: "admin" } } } },
      select: { id: true },
    });
    for (const a of admins) {
      if (a.id === authorId) continue;
      await createNotification(
        a.id,
        "support_new_message",
        "Новое сообщение в техподдержку",
        subject,
        `/support/${threadId}`,
      );
    }
  }
}

/** GET /api/support/threads — список тредов (свои для юзера, все для admin/supervisor). */
router.get("/threads", authenticate, async (req, res) => {
  try {
    const user = req.user!;
    const where = isStaff(user.roles) ? {} : { userId: user.userId };
    const threads = await prisma.supportThread.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      include: {
        user: { select: authorSelect },
        _count: { select: { messages: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, body: true, isStaff: true, createdAt: true, readAt: true },
        },
      },
      take: 200,
    });
    res.json(threads);
  } catch (err) {
    console.error("support threads list:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const createThreadSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(1).max(10_000),
});

/** POST /api/support/threads — создать тред с первым сообщением. */
router.post("/threads", authenticate, async (req, res) => {
  try {
    const parsed = createThreadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Некорректные данные", details: parsed.error.flatten() });
      return;
    }
    const user = req.user!;
    const userIsStaff = isStaff(user.roles);
    const thread = await prisma.supportThread.create({
      data: {
        subject: parsed.data.subject,
        userId: user.userId,
        messages: {
          create: {
            body: parsed.data.body,
            authorId: user.userId,
            isStaff: userIsStaff,
          },
        },
      },
      include: {
        user: { select: authorSelect },
        messages: { include: { author: { select: authorSelect } } },
      },
    });
    await notifyOthers({
      threadId: thread.id,
      authorId: user.userId,
      authorIsStaff: userIsStaff,
      threadUserId: thread.userId,
      subject: thread.subject,
    });
    res.status(201).json(thread);
  } catch (err) {
    console.error("support thread create:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function loadThreadOrDeny(threadId: string, userId: string, roles: string[]) {
  const thread = await prisma.supportThread.findUnique({
    where: { id: threadId },
    include: { user: { select: authorSelect } },
  });
  if (!thread) return { error: "not_found" as const };
  if (!isStaff(roles) && thread.userId !== userId) {
    return { error: "forbidden" as const };
  }
  return { thread };
}

/** GET /api/support/threads/:id — детали треда + сообщения. */
router.get("/threads/:id", authenticate, async (req, res) => {
  try {
    const user = req.user!;
    const found = await loadThreadOrDeny(req.params.id, user.userId, user.roles);
    if (found.error === "not_found") {
      res.status(404).json({ error: "Тред не найден" });
      return;
    }
    if (found.error === "forbidden") {
      res.status(403).json({ error: "Нет доступа" });
      return;
    }
    const messages = await prisma.supportMessage.findMany({
      where: { threadId: found.thread.id },
      orderBy: { createdAt: "asc" },
      include: { author: { select: authorSelect } },
    });

    // Пометить сообщения как прочитанные противоположной стороной.
    const userIsStaff = isStaff(user.roles);
    await prisma.supportMessage.updateMany({
      where: {
        threadId: found.thread.id,
        readAt: null,
        isStaff: userIsStaff ? false : true,
      },
      data: { readAt: new Date() },
    });

    res.json({ ...found.thread, messages });
  } catch (err) {
    console.error("support thread get:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const attachmentSchema = z.object({
  fileName: z.string(),
  fileKey: z.string(),
  originalName: z.string().optional(),
  fileSize: z.number().int().nonnegative().optional(),
  mimeType: z.string().optional(),
});

const addMessageSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
  attachments: z.array(attachmentSchema).max(10).optional(),
});

/** POST /api/support/threads/:id/messages — добавить сообщение. */
router.post("/threads/:id/messages", authenticate, async (req, res) => {
  try {
    const parsed = addMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Сообщение не должно быть пустым" });
      return;
    }
    const user = req.user!;
    const found = await loadThreadOrDeny(req.params.id, user.userId, user.roles);
    if (found.error === "not_found") {
      res.status(404).json({ error: "Тред не найден" });
      return;
    }
    if (found.error === "forbidden") {
      res.status(403).json({ error: "Нет доступа" });
      return;
    }
    if (found.thread.status === "CLOSED") {
      res.status(409).json({ error: "Тред закрыт" });
      return;
    }
    const userIsStaff = isStaff(user.roles);
    const message = await prisma.supportMessage.create({
      data: {
        threadId: found.thread.id,
        body: parsed.data.body,
        authorId: user.userId,
        isStaff: userIsStaff,
        attachments: parsed.data.attachments ?? undefined,
      },
      include: { author: { select: authorSelect } },
    });
    await prisma.supportThread.update({
      where: { id: found.thread.id },
      data: {
        lastMessageAt: message.createdAt,
        // если staff отвечает на OPEN — оставляем OPEN; если был RESOLVED, оставляем
        // (status меняется только через PATCH).
      },
    });
    await notifyOthers({
      threadId: found.thread.id,
      authorId: user.userId,
      authorIsStaff: userIsStaff,
      threadUserId: found.thread.userId,
      subject: found.thread.subject,
    });
    res.status(201).json(message);
  } catch (err) {
    console.error("support message create:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const patchSchema = z.object({
  status: z.enum(["OPEN", "RESOLVED", "CLOSED"]),
});

/** PATCH /api/support/threads/:id — admin меняет статус. */
router.patch("/threads/:id", authenticate, async (req, res) => {
  try {
    const user = req.user!;
    if (!isStaff(user.roles)) {
      res.status(403).json({ error: "Только сотрудники могут менять статус" });
      return;
    }
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Некорректный статус" });
      return;
    }
    const thread = await prisma.supportThread.update({
      where: { id: req.params.id },
      data: {
        status: parsed.data.status,
        closedAt: parsed.data.status === "CLOSED" ? new Date() : null,
      },
      include: { user: { select: authorSelect } },
    });
    res.json(thread);
  } catch (err) {
    console.error("support thread patch:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** POST /api/support/upload — загрузить файл (для вложений в сообщениях). */
router.post("/upload", authenticate, upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(422).json({ error: "Файл не передан" });
    return;
  }
  res.json({
    fileName: req.file.filename,
    fileKey: req.file.filename,
    originalName: req.file.originalname,
    fileSize: req.file.size,
    mimeType: req.file.mimetype,
    url: `/uploads/${req.file.filename}`,
  });
});

export default router;
