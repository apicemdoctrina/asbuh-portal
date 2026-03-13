import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { logAudit } from "../lib/audit.js";
import { sendEmail } from "../lib/mailer.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { parsePagination, sendZodError } from "../lib/route-helpers.js";

const router = Router();

// ── Template schemas ────────────────────────────────────────────────────

const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().max(500).optional(),
  body: z.string().min(1),
  channel: z.enum(["EMAIL", "TELEGRAM"]).optional(),
});

const updateTemplateSchema = createTemplateSchema.partial();

const sendMessageSchema = z.object({
  templateId: z.string().uuid().optional(),
  recipient: z.string().min(1),
  subject: z.string().max(500).optional(),
  body: z.string().min(1),
  channel: z.enum(["EMAIL", "TELEGRAM"]),
});

// ── Helpers ─────────────────────────────────────────────────────────────

/** Replace {{placeholders}} in a string with values from a context object. */
function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// ── Templates CRUD ──────────────────────────────────────────────────────

// GET /api/messages/templates
router.get("/templates", authenticate, requirePermission("message", "view"), async (req, res) => {
  try {
    const templates = await prisma.messageTemplate.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    res.json(templates);
  } catch (err) {
    console.error("List templates error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/messages/templates
router.post(
  "/templates",
  authenticate,
  requirePermission("message", "create"),
  async (req, res) => {
    try {
      const parsed = createTemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        sendZodError(res, parsed.error);
        return;
      }

      const template = await prisma.messageTemplate.create({
        data: {
          ...parsed.data,
          channel: parsed.data.channel ?? "EMAIL",
          createdById: req.user!.userId,
        },
      });

      await logAudit({
        action: "message_template_create",
        userId: req.user!.userId,
        entity: "message_template",
        entityId: template.id,
        details: { name: template.name },
      });

      res.status(201).json(template);
    } catch (err) {
      console.error("Create template error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PUT /api/messages/templates/:id
router.put(
  "/templates/:id",
  authenticate,
  requirePermission("message", "edit"),
  async (req, res) => {
    try {
      const parsed = updateTemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        sendZodError(res, parsed.error);
        return;
      }

      const template = await prisma.messageTemplate.update({
        where: { id: req.params.id },
        data: parsed.data,
      });

      await logAudit({
        action: "message_template_update",
        userId: req.user!.userId,
        entity: "message_template",
        entityId: template.id,
      });

      res.json(template);
    } catch (err) {
      console.error("Update template error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// DELETE /api/messages/templates/:id
router.delete(
  "/templates/:id",
  authenticate,
  requirePermission("message", "delete"),
  async (req, res) => {
    try {
      await prisma.messageTemplate.delete({ where: { id: req.params.id } });

      await logAudit({
        action: "message_template_delete",
        userId: req.user!.userId,
        entity: "message_template",
        entityId: req.params.id,
      });

      res.json({ message: "ok" });
    } catch (err) {
      console.error("Delete template error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ── Send message ────────────────────────────────────────────────────────

// POST /api/messages/send/:orgId
router.post(
  "/send/:orgId",
  authenticate,
  requirePermission("message", "send"),
  async (req, res) => {
    try {
      const parsed = sendMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        sendZodError(res, parsed.error);
        return;
      }

      const { templateId, recipient, subject, body, channel } = parsed.data;

      // Verify org exists
      const org = await prisma.organization.findUnique({
        where: { id: req.params.orgId },
        select: { id: true, name: true },
      });
      if (!org) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      let status = "sent";
      let errorMessage: string | null = null;

      // Send via channel
      if (channel === "EMAIL") {
        try {
          const htmlBody = `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
              ${body.replace(/\n/g, "<br>")}
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
              <p style="color:#94a3b8;font-size:12px">Отправлено через ASBUH Portal</p>
            </div>
          `;
          await sendEmail(recipient, subject || "Сообщение от АСБУХ", htmlBody);
        } catch (err) {
          status = "failed";
          errorMessage = err instanceof Error ? err.message : "Unknown error";
        }
      } else if (channel === "TELEGRAM") {
        // Telegram sending via existing bot infrastructure
        try {
          const { sendMessage: sendTgMessage } = await import("../lib/telegram.js");
          await sendTgMessage(recipient, body);
        } catch (err) {
          status = "failed";
          errorMessage = err instanceof Error ? err.message : "Unknown error";
        }
      }

      // Log the message
      const log = await prisma.messageLog.create({
        data: {
          organizationId: org.id,
          templateId: templateId || null,
          channel,
          recipient,
          subject: subject || null,
          body,
          sentById: req.user!.userId,
          status,
          errorMessage,
        },
        include: {
          sentBy: { select: { id: true, firstName: true, lastName: true } },
          template: { select: { id: true, name: true } },
        },
      });

      await logAudit({
        action: "message_send",
        userId: req.user!.userId,
        entity: "organization",
        entityId: org.id,
        details: { channel, recipient, status, templateId },
      });

      if (status === "failed") {
        res.status(207).json({ ...log, warning: "Message saved but delivery failed" });
      } else {
        res.status(201).json(log);
      }
    } catch (err) {
      console.error("Send message error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ── Message history per organization ────────────────────────────────────

// GET /api/messages/history/:orgId
router.get(
  "/history/:orgId",
  authenticate,
  requirePermission("message", "view"),
  async (req, res) => {
    try {
      const { page, limit, skip } = parsePagination(req.query.page, req.query.limit);

      const [messages, total] = await Promise.all([
        prisma.messageLog.findMany({
          where: { organizationId: req.params.orgId },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          include: {
            sentBy: { select: { id: true, firstName: true, lastName: true } },
            template: { select: { id: true, name: true } },
          },
        }),
        prisma.messageLog.count({
          where: { organizationId: req.params.orgId },
        }),
      ]);

      res.json({ data: messages, total, page, limit });
    } catch (err) {
      console.error("Message history error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ── Template preview with variables ─────────────────────────────────────

// POST /api/messages/preview
router.post("/preview", authenticate, async (req, res) => {
  try {
    const { body, subject, variables } = req.body;
    if (!body) {
      res.status(400).json({ error: "body is required" });
      return;
    }

    const vars = variables || {};
    res.json({
      subject: subject ? renderTemplate(subject, vars) : null,
      body: renderTemplate(body, vars),
    });
  } catch (err) {
    console.error("Preview error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
