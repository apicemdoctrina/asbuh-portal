import { Router } from "express";
import crypto from "node:crypto";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { addConnection, removeConnection } from "../lib/sse-manager.js";

const router = Router();

// Одноразовые SSE-тикеты: EventSource не умеет заголовки, а access token в query
// попадает в логи nginx. Тикет живёт 30 секунд и сгорает при первом использовании.
const TICKET_TTL_MS = 30_000;
const sseTickets = new Map<string, { userId: string; expiresAt: number }>();

function sweepTickets() {
  const now = Date.now();
  for (const [k, v] of sseTickets) if (v.expiresAt < now) sseTickets.delete(k);
}

// POST /api/notifications/stream-ticket — выдать одноразовый тикет для SSE
router.post("/stream-ticket", authenticate, (req, res) => {
  sweepTickets();
  const ticket = crypto.randomBytes(24).toString("hex");
  sseTickets.set(ticket, {
    userId: req.user!.userId,
    expiresAt: Date.now() + TICKET_TTL_MS,
  });
  res.json({ ticket });
});

// GET /api/notifications/stream?ticket=ONE_TIME_TICKET
router.get("/stream", async (req, res) => {
  const ticket = req.query.ticket as string;
  if (!ticket) return res.status(401).end();

  sweepTickets();
  const entry = sseTickets.get(ticket);
  if (!entry) return res.status(401).end();
  sseTickets.delete(ticket); // одноразовый

  const userId = entry.userId;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  res.write("event: connected\ndata: {}\n\n");

  addConnection(userId, res);

  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 30_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeConnection(userId, res);
  });
});

// GET /api/notifications?limit=30
router.get("/", authenticate, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    res.json(notifications);
  } catch (err) {
    console.error("GET /api/notifications error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/notifications/read-all  (must be before /:id)
router.patch("/read-all", authenticate, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.userId, readAt: null },
      data: { readAt: new Date() },
    });
    res.status(204).send();
  } catch (err) {
    console.error("PATCH /api/notifications/read-all error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/notifications/:id/read
router.patch("/:id/read", authenticate, async (req, res) => {
  try {
    const notif = await prisma.notification.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!notif) return res.status(404).json({ error: "Not found" });

    await prisma.notification.update({
      where: { id: req.params.id },
      data: { readAt: new Date() },
    });
    res.status(204).send();
  } catch (err) {
    console.error("PATCH /api/notifications/:id/read error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
