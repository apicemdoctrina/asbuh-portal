/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { logAudit } from "../lib/audit.js";
import { authenticate, requirePermission, requireRole } from "../middleware/auth.js";
import { notifyWithTelegram, createNotification } from "../lib/notify.js";
import {
  sendDocRequestEmail,
  sendTicketReplyEmail,
  getClientUserIdsForOrg,
} from "../lib/client-email.js";

const router = Router();

// ==================== Upload config ====================

const TICKET_UPLOADS_DIR = path.join(process.cwd(), "uploads", "tickets");

const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".jpg",
  ".jpeg",
  ".png",
  ".zip",
]);
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "application/zip",
]);

const ticketUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const ticketId = req.params.id;
      const dir = path.join(TICKET_UPLOADS_DIR, ticketId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : "";
      cb(null, `${crypto.randomUUID()}${safeExt}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_MIMES.has(file.mimetype));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ==================== Zod schemas ====================

const createTicketSchema = z.object({
  subject: z.string().min(1).max(200),
  type: z.enum(["QUESTION", "DOCUMENT_REQUEST", "PROBLEM", "DOCUMENT_UPLOAD"]).optional(),
  organizationId: z.string().uuid(),
  body: z.string().min(1).max(5000),
});

const updateTicketSchema = z.object({
  status: z
    .enum(["NEW", "IN_PROGRESS", "WAITING_CLIENT", "ON_HOLD", "ESCALATED", "CLOSED", "REOPENED"])
    .optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  assignedToId: z.string().uuid().nullable().optional(),
});

// ==================== Helpers ====================

function getTicketScopedWhere(req: Request): Record<string, any> {
  const roles: string[] = req.user!.roles;
  const userId = req.user!.userId;

  if (roles.includes("admin") || roles.includes("supervisor")) return {};
  if (roles.includes("manager")) {
    return { organization: { section: { members: { some: { userId } } } } };
  }
  if (roles.includes("accountant")) {
    return { organization: { section: { members: { some: { userId } } } } };
  }
  // client
  return { organization: { members: { some: { userId, role: "client" } } } };
}

function isClientOnly(req: Request): boolean {
  const roles: string[] = req.user!.roles;
  return (
    roles.includes("client") && !roles.some((r) => ["admin", "manager", "accountant"].includes(r))
  );
}

const TICKET_LIST_INCLUDE = {
  organization: { select: { id: true, name: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { messages: true } },
};

const TICKET_DETAIL_INCLUDE = {
  organization: { select: { id: true, name: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
};

// ==================== GET /api/tickets ====================
router.get(
  "/",
  authenticate,
  requirePermission("ticket", "view"),
  async (req: Request, res: Response) => {
    try {
      const { status, type, priority, organizationId, assignedToId, search, page, limit } =
        req.query;
      const scopedWhere = getTicketScopedWhere(req);

      const where: any = { ...scopedWhere };
      if (status) {
        const statuses = (status as string).split(",");
        where.status = { in: statuses };
      }
      if (type) where.type = type as string;
      if (priority) where.priority = priority as string;
      if (organizationId) where.organizationId = organizationId as string;
      if (assignedToId) where.assignedToId = assignedToId as string;
      if (search) where.subject = { contains: search as string, mode: "insensitive" };

      const pageNum = Math.max(1, parseInt(page as string) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(limit as string) || 20));

      const [tickets, total] = await Promise.all([
        prisma.ticket.findMany({
          where,
          include: TICKET_LIST_INCLUDE,
          orderBy: { updatedAt: "desc" },
          skip: (pageNum - 1) * pageSize,
          take: pageSize,
        }),
        prisma.ticket.count({ where }),
      ]);

      res.json({ tickets, total, page: pageNum, limit: pageSize });
    } catch (err) {
      console.error("GET /api/tickets error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ==================== GET /api/tickets/attachments/:attachmentId ====================
// NOTE: must be before /:id route to avoid matching "attachments" as an id
router.get("/attachments/:attachmentId", authenticate, async (req: Request, res: Response) => {
  try {
    const { attachmentId } = req.params;
    const scopedWhere = getTicketScopedWhere(req);

    const attachment = await prisma.ticketAttachment.findFirst({
      where: {
        id: attachmentId,
        message: {
          deletedAt: null,
          ticket: scopedWhere,
        },
      },
    });

    if (!attachment) return res.status(404).json({ error: "Attachment not found" });

    const filePath = path.join(process.cwd(), "uploads", attachment.fileKey);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found on disk" });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(attachment.fileName)}"`,
    );
    res.setHeader("Content-Type", attachment.mimeType);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error("GET /api/tickets/attachments error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==================== GET /api/tickets/:id ====================
router.get(
  "/:id",
  authenticate,
  requirePermission("ticket", "view"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { cursor, limit } = req.query;
      const scopedWhere = getTicketScopedWhere(req);
      const clientOnly = isClientOnly(req);
      const msgLimit = Math.min(100, Math.max(1, parseInt(limit as string) || 50));

      const ticket = await prisma.ticket.findFirst({
        where: { id, ...scopedWhere },
        include: TICKET_DETAIL_INCLUDE,
      });

      if (!ticket) return res.status(404).json({ error: "Ticket not found" });

      const msgWhere: any = { ticketId: id, deletedAt: null };
      if (clientOnly) msgWhere.isInternal = false;

      const msgQuery: any = {
        where: msgWhere,
        include: {
          author: { select: { id: true, firstName: true, lastName: true, avatarPath: true } },
          attachments: true,
        },
        orderBy: { createdAt: "desc" as const },
        take: msgLimit,
      };

      if (cursor) {
        msgQuery.cursor = { id: cursor as string };
        msgQuery.skip = 1;
      }

      const messages = await prisma.ticketMessage.findMany(msgQuery);
      const hasMore = messages.length === msgLimit;

      res.json({
        ticket,
        messages: messages.reverse(),
        hasMore,
        nextCursor: hasMore ? messages[0]?.id : null,
      });
    } catch (err) {
      console.error("GET /api/tickets/:id error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ==================== POST /api/tickets ====================
router.post(
  "/",
  authenticate,
  requirePermission("ticket", "create"),
  async (req: Request, res: Response) => {
    try {
      const parsed = createTicketSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

      const { subject, type, organizationId, body } = parsed.data;
      const userId = req.user!.userId;
      const clientOnly = isClientOnly(req);

      // Verify access to organization
      if (clientOnly) {
        const membership = await prisma.organizationMember.findFirst({
          where: { userId, organizationId, role: "client" },
        });
        if (!membership)
          return res.status(403).json({ error: "Access denied to this organization" });
      } else {
        const org = await prisma.organization.findUnique({ where: { id: organizationId } });
        if (!org) return res.status(404).json({ error: "Organization not found" });
      }

      // Auto-assign: responsible > accountant > null
      let assignedToId: string | null = null;
      const members = await prisma.organizationMember.findMany({
        where: { organizationId },
      });
      const responsible = members.find((m) => m.role === "responsible");
      if (responsible) {
        assignedToId = responsible.userId;
      } else {
        const accountant = members.find((m) => m.role === "accountant");
        if (accountant) assignedToId = accountant.userId;
      }

      const ticket = await prisma.ticket.create({
        data: {
          subject,
          type: (type as any) || "QUESTION",
          organizationId,
          createdById: userId,
          assignedToId,
          messages: {
            create: { body, authorId: userId },
          },
        },
        include: {
          ...TICKET_LIST_INCLUDE,
          messages: {
            include: {
              author: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      });

      logAudit({
        action: "ticket.create",
        userId,
        entity: "Ticket",
        entityId: ticket.id,
        details: { subject, type: ticket.type, organizationId },
      }).catch(console.error);

      if (assignedToId) {
        notifyWithTelegram(
          assignedToId,
          "ticket_new",
          "Новый тикет",
          `#${ticket.number}: ${subject}`,
          `/tickets/${ticket.id}`,
          `🎫 Новый тикет #${ticket.number}: ${subject}`,
        ).catch(console.error);
      }

      // Email to clients of this org when staff creates a document request
      if (!clientOnly && ticket.type === "DOCUMENT_REQUEST") {
        getClientUserIdsForOrg(organizationId)
          .then((clientIds) =>
            Promise.all(
              clientIds.map((uid) =>
                sendDocRequestEmail(uid, {
                  ticketId: ticket.id,
                  ticketNumber: ticket.number,
                  subject,
                  organizationName: ticket.organization?.name ?? "",
                }),
              ),
            ),
          )
          .catch(console.error);
      }

      res.status(201).json(ticket);
    } catch (err) {
      console.error("POST /api/tickets error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ==================== PATCH /api/tickets/:id ====================
router.patch(
  "/:id",
  authenticate,
  requirePermission("ticket", "edit"),
  async (req: Request, res: Response) => {
    try {
      const parsed = updateTicketSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

      const { id } = req.params;
      const scopedWhere = getTicketScopedWhere(req);

      const existing = await prisma.ticket.findFirst({ where: { id, ...scopedWhere } });
      if (!existing) return res.status(404).json({ error: "Ticket not found" });

      const data: any = {};
      if (parsed.data.status !== undefined) {
        data.status = parsed.data.status;
        if (parsed.data.status === "CLOSED") data.closedAt = new Date();
        if (parsed.data.status === "REOPENED") data.closedAt = null;
      }
      if (parsed.data.priority !== undefined) data.priority = parsed.data.priority;
      if (parsed.data.assignedToId !== undefined) data.assignedToId = parsed.data.assignedToId;

      if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      const ticket = await prisma.ticket.update({
        where: { id },
        data,
        include: TICKET_LIST_INCLUDE,
      });

      logAudit({
        action: "ticket.update",
        userId: req.user!.userId,
        entity: "Ticket",
        entityId: id,
        details: parsed.data,
      }).catch(console.error);

      // Notify client about status change
      if (parsed.data.status && existing.createdById !== req.user!.userId) {
        createNotification(
          existing.createdById,
          "ticket_status",
          "Статус обращения изменён",
          `#${ticket.number}: ${parsed.data.status}`,
          `/tickets/${id}`,
        ).catch(console.error);
      }

      // Notify on escalation
      if (parsed.data.status === "ESCALATED") {
        const org = await prisma.organization.findUnique({
          where: { id: existing.organizationId },
          include: { section: { include: { members: { include: { user: true } } } } },
        });
        if (org?.section) {
          for (const m of org.section.members) {
            const memberRoles = await prisma.userRole.findMany({
              where: { userId: m.userId },
              include: { role: true },
            });
            if (memberRoles.some((r) => r.role.name === "manager")) {
              notifyWithTelegram(
                m.userId,
                "ticket_escalated",
                "Тикет эскалирован",
                `#${ticket.number}: ${ticket.subject}`,
                `/tickets/${id}`,
                `⚠️ Эскалация тикета #${ticket.number}: ${ticket.subject}`,
              ).catch(console.error);
            }
          }
        }
      }

      res.json(ticket);
    } catch (err) {
      console.error("PATCH /api/tickets/:id error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ==================== DELETE /api/tickets/:id ====================
router.delete("/:id", authenticate, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    await prisma.ticket.delete({ where: { id } });

    logAudit({
      action: "ticket.delete",
      userId: req.user!.userId,
      entity: "Ticket",
      entityId: id,
      details: { number: ticket.number, subject: ticket.subject },
    }).catch(console.error);

    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/tickets/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==================== POST /api/tickets/:id/messages ====================
router.post(
  "/:id/messages",
  authenticate,
  ticketUpload.array("files", 5),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { body: msgBody, isInternal } = req.body;
      const userId = req.user!.userId;
      const clientOnly = isClientOnly(req);

      if (!msgBody || typeof msgBody !== "string" || msgBody.trim().length === 0) {
        return res.status(400).json({ error: "Message body is required" });
      }
      if (msgBody.length > 5000) {
        return res.status(400).json({ error: "Message too long (max 5000 chars)" });
      }

      const internal = isInternal === "true" || isInternal === true;
      if (clientOnly && internal) {
        return res.status(403).json({ error: "Clients cannot send internal messages" });
      }

      const scopedWhere = getTicketScopedWhere(req);
      const ticket = await prisma.ticket.findFirst({ where: { id, ...scopedWhere } });
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });

      const files = (req.files as Express.Multer.File[]) || [];
      const message = await prisma.ticketMessage.create({
        data: {
          body: msgBody.trim(),
          isInternal: internal,
          ticketId: id,
          authorId: userId,
          attachments:
            files.length > 0
              ? {
                  create: files.map((f) => ({
                    fileName: f.originalname,
                    fileKey: `tickets/${id}/${f.filename}`,
                    fileSize: f.size,
                    mimeType: f.mimetype,
                  })),
                }
              : undefined,
        },
        include: {
          author: { select: { id: true, firstName: true, lastName: true, avatarPath: true } },
          attachments: true,
        },
      });

      // Auto-status transition
      const statusUpdate: any = { updatedAt: new Date() };
      if (clientOnly && ticket.status === "WAITING_CLIENT") {
        statusUpdate.status = "IN_PROGRESS";
      } else if (!clientOnly && !internal) {
        if (["NEW", "IN_PROGRESS", "REOPENED"].includes(ticket.status)) {
          statusUpdate.status = "WAITING_CLIENT";
        }
      }
      await prisma.ticket.update({ where: { id }, data: statusUpdate });

      logAudit({
        action: "ticket.message.create",
        userId,
        entity: "TicketMessage",
        entityId: message.id,
        details: { ticketId: id, isInternal: internal, attachments: files.length },
      }).catch(console.error);

      // Notifications (skip for internal notes)
      if (!internal) {
        if (clientOnly && ticket.assignedToId) {
          notifyWithTelegram(
            ticket.assignedToId,
            "ticket_message",
            "Новое сообщение в тикете",
            `#${ticket.number}: ${ticket.subject}`,
            `/tickets/${id}`,
            `💬 Сообщение в тикете #${ticket.number}: ${ticket.subject}`,
          ).catch(console.error);
        } else if (!clientOnly) {
          notifyWithTelegram(
            ticket.createdById,
            "ticket_message",
            "Ответ по вашему обращению",
            `#${ticket.number}: ${ticket.subject}`,
            `/tickets/${id}`,
            `💬 Ответ по обращению #${ticket.number}: ${ticket.subject}`,
          ).catch(console.error);

          // Email to all clients of this org (createdById may not be the client)
          const author = message.author;
          const authorName = author ? `${author.firstName} ${author.lastName}` : "Бухгалтер";
          getClientUserIdsForOrg(ticket.organizationId)
            .then((clientIds) =>
              Promise.all(
                clientIds.map((uid) =>
                  sendTicketReplyEmail(uid, {
                    ticketId: id,
                    ticketNumber: ticket.number,
                    subject: ticket.subject,
                    authorName,
                    bodyPreview: msgBody.trim(),
                  }),
                ),
              ),
            )
            .catch(console.error);
        }
      }

      res.status(201).json(message);
    } catch (err) {
      console.error("POST /api/tickets/:id/messages error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ==================== DELETE /api/tickets/:id/messages/:msgId ====================
router.delete(
  "/:id/messages/:msgId",
  authenticate,
  requireRole("admin", "manager"),
  async (req: Request, res: Response) => {
    try {
      const { id, msgId } = req.params;

      const message = await prisma.ticketMessage.findFirst({
        where: { id: msgId, ticketId: id, deletedAt: null },
      });
      if (!message) return res.status(404).json({ error: "Message not found" });

      await prisma.ticketMessage.update({
        where: { id: msgId },
        data: { deletedAt: new Date() },
      });

      logAudit({
        action: "ticket.message.delete",
        userId: req.user!.userId,
        entity: "TicketMessage",
        entityId: msgId,
        details: { ticketId: id },
      }).catch(console.error);

      res.json({ ok: true });
    } catch (err) {
      console.error("DELETE /api/tickets/:id/messages/:msgId error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
