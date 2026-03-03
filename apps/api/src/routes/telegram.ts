import { Router } from "express";
import crypto from "crypto";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { getBotName } from "../lib/telegram.js";

const router = Router();

function generateCode(): string {
  // 6 uppercase hex characters
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

// GET /api/telegram/status
router.get("/status", authenticate, async (req, res) => {
  try {
    const binding = await prisma.telegramBinding.findUnique({
      where: { userId: req.user.userId },
    });

    if (!binding) {
      return res.json({ connected: false });
    }

    if (binding.chatId) {
      return res.json({ connected: true, username: binding.username });
    }

    const codeValid = binding.code && binding.codeExpiresAt && binding.codeExpiresAt > new Date();

    if (codeValid) {
      return res.json({
        connected: false,
        pending: true,
        code: binding.code,
        botName: await getBotName(),
        codeExpiresAt: binding.codeExpiresAt,
      });
    }

    return res.json({ connected: false });
  } catch (err) {
    console.error("GET /api/telegram/status error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/telegram/connect — generate connect code
router.post("/connect", authenticate, async (req, res) => {
  try {
    const code = generateCode();
    const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await prisma.telegramBinding.upsert({
      where: { userId: req.user.userId },
      create: { userId: req.user.userId, code, codeExpiresAt },
      update: { code, codeExpiresAt, chatId: null, username: null, connectedAt: null },
    });

    const botName = await getBotName();
    res.json({ code, botName, expiresAt: codeExpiresAt });
  } catch (err) {
    console.error("POST /api/telegram/connect error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/telegram/disconnect
router.delete("/disconnect", authenticate, async (req, res) => {
  try {
    await prisma.telegramBinding.deleteMany({ where: { userId: req.user.userId } });
    res.status(204).send();
  } catch (err) {
    console.error("DELETE /api/telegram/disconnect error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
