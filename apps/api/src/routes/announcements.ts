import { Router } from "express";
import prisma from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { sendMessage } from "../lib/telegram.js";

const router = Router();

// GET /api/announcements — all announcements with read status for current user
router.get("/", authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const announcements = await prisma.announcement.findMany({
      orderBy: { publishedAt: "desc" },
      include: {
        author: { select: { firstName: true, lastName: true } },
        reads: { where: { userId }, select: { readAt: true } },
      },
    });

    const result = announcements.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      type: a.type,
      publishedAt: a.publishedAt,
      author: `${a.author.firstName} ${a.author.lastName}`,
      isRead: a.reads.length > 0,
    }));

    res.json(result);
  } catch (err) {
    console.error("GET /announcements error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/announcements/unread-count
router.get("/unread-count", authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const total = await prisma.announcement.count();
    const read = await prisma.announcementRead.count({ where: { userId } });
    res.json({ count: Math.max(0, total - read) });
  } catch (err) {
    console.error("GET /announcements/unread-count error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/announcements — create (admin only)
router.post("/", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { title, body, type } = req.body as {
      title: string;
      body: string;
      type?: string;
    };

    if (!title?.trim() || !body?.trim()) {
      res.status(400).json({ error: "title and body are required" });
      return;
    }

    const validTypes = ["FEATURE", "FIX", "CHANGE", "REMOVAL"];
    const announcementType = validTypes.includes(type ?? "") ? type! : "FEATURE";

    const announcement = await prisma.announcement.create({
      data: {
        title: title.trim(),
        body: body.trim(),
        type: announcementType as "FEATURE" | "FIX" | "CHANGE" | "REMOVAL",
        authorId: req.user!.userId,
      },
      include: {
        author: { select: { firstName: true, lastName: true } },
      },
    });

    // Telegram push to all users with a binding
    void sendTelegramAnnouncement(announcement.title, announcement.body, announcementType);

    res.status(201).json({
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      type: announcement.type,
      publishedAt: announcement.publishedAt,
      author: `${announcement.author.firstName} ${announcement.author.lastName}`,
      isRead: false,
    });
  } catch (err) {
    console.error("POST /announcements error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/announcements/read-all — mark all as read for current user
router.post("/read-all", authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const all = await prisma.announcement.findMany({ select: { id: true } });

    await prisma.$transaction(
      all.map((a) =>
        prisma.announcementRead.upsert({
          where: { announcementId_userId: { announcementId: a.id, userId } },
          create: { announcementId: a.id, userId },
          update: {},
        }),
      ),
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("POST /announcements/read-all error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/announcements/:id/read — mark single as read
router.post("/:id/read", authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const announcementId = req.params.id;

    await prisma.announcementRead.upsert({
      where: { announcementId_userId: { announcementId, userId } },
      create: { announcementId, userId },
      update: {},
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("POST /announcements/:id/read error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/announcements/:id — delete (admin only)
router.delete("/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    await prisma.announcement.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /announcements/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const typeEmoji: Record<string, string> = {
  FEATURE: "✨",
  FIX: "🔧",
  CHANGE: "🔄",
  REMOVAL: "🗑",
};

const typeLabel: Record<string, string> = {
  FEATURE: "Новое",
  FIX: "Исправление",
  CHANGE: "Изменение",
  REMOVAL: "Удалено",
};

async function sendTelegramAnnouncement(title: string, body: string, type: string) {
  try {
    const bindings = await prisma.telegramBinding.findMany({ select: { chatId: true } });
    if (!bindings.length) return;

    const emoji = typeEmoji[type] ?? "📢";
    const label = typeLabel[type] ?? type;
    const text = `${emoji} <b>[${label}] ${title}</b>\n\n${body}`;

    await Promise.allSettled(bindings.map((b) => sendMessage(b.chatId, text)));
  } catch (err) {
    console.error("[announcements] Telegram push error:", err);
  }
}

export default router;
