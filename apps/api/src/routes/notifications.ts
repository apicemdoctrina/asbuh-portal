import { Router } from "express";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { verifyAccessToken } from "../lib/tokens.js";
import { addConnection, removeConnection } from "../lib/sse-manager.js";

const router = Router();

// GET /api/notifications/stream?token=ACCESS_TOKEN
// Note: EventSource doesn't support custom headers, so auth via query param
router.get("/stream", async (req, res) => {
  const token = req.query.token as string;
  if (!token) return res.status(401).end();

  let payload: { userId: string };
  try {
    payload = verifyAccessToken(token) as { userId: string };
  } catch {
    return res.status(401).end();
  }

  const userId = payload.userId;

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
      where: { userId: req.user.userId },
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
      where: { userId: req.user.userId, readAt: null },
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
      where: { id: req.params.id, userId: req.user.userId },
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
