# Ticket System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a ticket system where clients create support tickets from organization cards, staff respond with messages and internal notes, both sides receive notifications.

**Architecture:** New Prisma models (Ticket, TicketMessage, TicketAttachment) with a single Express router (`/api/tickets`). Frontend gets two new pages (TicketsPage list + TicketDetailPage chat) and an integration card in OrganizationDetailPage. Notifications via existing SSE + Telegram infrastructure.

**Tech Stack:** Express 5 + TypeScript, Prisma ORM, PostgreSQL, React 18, Tailwind CSS v4, Multer for file uploads, Zod for validation, lucide-react for icons.

**Spec:** `docs/superpowers/specs/2026-03-13-ticket-system-design.md`

---

## Chunk 1: Database Layer

### Task 1: Prisma Schema — Enums & Ticket Model

**Files:**

- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add enums to schema.prisma**

Add after the existing `RecurrenceType` enum (around line 180):

```prisma
enum TicketType {
  QUESTION
  DOCUMENT_REQUEST
  PROBLEM
  DOCUMENT_UPLOAD
}

enum TicketStatus {
  NEW
  IN_PROGRESS
  WAITING_CLIENT
  ON_HOLD
  ESCALATED
  CLOSED
  REOPENED
}

enum TicketPriority {
  LOW
  NORMAL
  HIGH
  URGENT
}
```

- [ ] **Step 2: Add Ticket model**

Add after the enums:

```prisma
model Ticket {
  id             String         @id @default(uuid())
  number         Int            @unique @default(autoincrement())
  subject        String
  type           TicketType     @default(QUESTION)
  status         TicketStatus   @default(NEW)
  priority       TicketPriority @default(NORMAL)

  organizationId String         @map("organization_id")
  organization   Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  createdById    String         @map("created_by_id")
  createdBy      User           @relation("TicketCreator", fields: [createdById], references: [id])

  assignedToId   String?        @map("assigned_to_id")
  assignedTo     User?          @relation("TicketAssignee", fields: [assignedToId], references: [id])

  closedAt       DateTime?      @map("closed_at")
  createdAt      DateTime       @default(now()) @map("created_at")
  updatedAt      DateTime       @updatedAt @map("updated_at")

  messages       TicketMessage[]

  @@index([organizationId, status])
  @@index([assignedToId])
  @@index([status])
  @@map("tickets")
}
```

- [ ] **Step 3: Add TicketMessage model**

```prisma
model TicketMessage {
  id         String    @id @default(uuid())
  body       String
  isInternal Boolean   @default(false) @map("is_internal")
  deletedAt  DateTime? @map("deleted_at")

  ticketId   String    @map("ticket_id")
  ticket     Ticket    @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  authorId   String    @map("author_id")
  author     User      @relation("TicketMessageAuthor", fields: [authorId], references: [id])

  createdAt  DateTime  @default(now()) @map("created_at")
  updatedAt  DateTime  @updatedAt @map("updated_at")

  attachments TicketAttachment[]

  @@index([ticketId])
  @@map("ticket_messages")
}
```

- [ ] **Step 4: Add TicketAttachment model**

```prisma
model TicketAttachment {
  id        String   @id @default(uuid())
  fileName  String   @map("file_name")
  fileKey   String   @map("file_key")
  fileSize  Int      @map("file_size")
  mimeType  String   @map("mime_type")

  messageId String   @map("message_id")
  message   TicketMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now()) @map("created_at")

  @@map("ticket_attachments")
}
```

- [ ] **Step 5: Add relations to User model**

In the `User` model, add these relation fields alongside the existing ones:

```prisma
  createdTickets    Ticket[]          @relation("TicketCreator")
  assignedTickets   Ticket[]          @relation("TicketAssignee")
  ticketMessages    TicketMessage[]   @relation("TicketMessageAuthor")
```

- [ ] **Step 6: Add relation to Organization model**

In the `Organization` model, add:

```prisma
  tickets           Ticket[]
```

- [ ] **Step 7: Validate schema**

Run: `cd apps/api && npx prisma validate`
Expected: "The schema at ... is valid."

---

### Task 2: Migration SQL

**Files:**

- Create: `apps/api/prisma/migrations/20260313_tickets/migration.sql`

- [ ] **Step 1: Create migration file**

```sql
-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('QUESTION', 'DOCUMENT_REQUEST', 'PROBLEM', 'DOCUMENT_UPLOAD');
CREATE TYPE "TicketStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'WAITING_CLIENT', 'ON_HOLD', 'ESCALATED', 'CLOSED', 'REOPENED');
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateTable: tickets
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "subject" TEXT NOT NULL,
    "type" "TicketType" NOT NULL DEFAULT 'QUESTION',
    "status" "TicketStatus" NOT NULL DEFAULT 'NEW',
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "organization_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "assigned_to_id" TEXT,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ticket_messages
CREATE TABLE "ticket_messages" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "ticket_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ticket_attachments
CREATE TABLE "ticket_attachments" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tickets_number_key" ON "tickets"("number");
CREATE INDEX "tickets_organization_id_status_idx" ON "tickets"("organization_id", "status");
CREATE INDEX "tickets_assigned_to_id_idx" ON "tickets"("assigned_to_id");
CREATE INDEX "tickets_status_idx" ON "tickets"("status");
CREATE INDEX "ticket_messages_ticket_id_idx" ON "ticket_messages"("ticket_id");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "ticket_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 2: Run migration**

Run: `cd apps/api && npx prisma migrate deploy`
Expected: "1 migration applied successfully"

- [ ] **Step 3: Generate Prisma client**

Run: `cd apps/api && npx prisma generate`
Expected: "Generated Prisma Client"

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260313_tickets/
git commit -m "feat(tickets): add Ticket, TicketMessage, TicketAttachment models and migration"
```

---

### Task 3: Seed Ticket Permissions

**Files:**

- Modify: `apps/api/prisma/seed.ts`

- [ ] **Step 1: Add ticket permissions to PERMISSIONS array**

Find the `PERMISSIONS` array and add:

```typescript
  { entity: "ticket", action: "view" },
  { entity: "ticket", action: "create" },
  { entity: "ticket", action: "edit" },
  { entity: "ticket", action: "delete" },
```

- [ ] **Step 2: Add ticket role-permissions to ROLE_PERMISSIONS**

```typescript
// admin — already gets all PERMISSIONS

// manager — add:
  { entity: "ticket", action: "view" },
  { entity: "ticket", action: "create" },
  { entity: "ticket", action: "edit" },

// accountant — add:
  { entity: "ticket", action: "view" },
  { entity: "ticket", action: "create" },
  { entity: "ticket", action: "edit" },

// client — add:
  { entity: "ticket", action: "view" },
  { entity: "ticket", action: "create" },
```

- [ ] **Step 3: Run seed**

Run: `cd apps/api && npx prisma db seed`
Expected: No errors, permissions upserted.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/seed.ts
git commit -m "feat(tickets): seed ticket permissions for all roles"
```

---

## Chunk 2: Backend API

### Task 4: Tickets Router — Scoping Helper & GET List

**Files:**

- Create: `apps/api/src/routes/tickets.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Create tickets.ts with imports, scoping helper, and GET /**

Create `apps/api/src/routes/tickets.ts`:

```typescript
import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { logAudit } from "../lib/audit.js";
import { authenticate, requirePermission, requireRole } from "../middleware/auth.js";
import { notifyWithTelegram, createNotification } from "../lib/notify.js";

const router = Router();

// --- Scoping helper ---
function getTicketScopedWhere(req: Request): Record<string, any> {
  const roles: string[] = req.user!.roles;
  const userId = req.user!.userId;

  if (roles.includes("admin")) return {};
  if (roles.includes("manager")) {
    return { organization: { section: { members: { some: { userId } } } } };
  }
  if (roles.includes("accountant")) {
    return { organization: { section: { members: { some: { userId } } } } };
  }
  // client
  return { organization: { members: { some: { userId, role: "client" } } } };
}

// --- Includes ---
const TICKET_LIST_INCLUDE = {
  organization: { select: { id: true, shortName: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { messages: true } },
};

const TICKET_DETAIL_INCLUDE = {
  organization: { select: { id: true, shortName: true, fullName: true } },
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

export default router;
```

- [ ] **Step 2: Register router in app.ts**

In `apps/api/src/app.ts`, add:

```typescript
import ticketsRouter from "./routes/tickets.js";
```

And register:

```typescript
app.use("/api/tickets", ticketsRouter);
```

Place it alongside the other router registrations.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/tickets.ts apps/api/src/app.ts
git commit -m "feat(tickets): add GET /api/tickets with scoping and filters"
```

---

### Task 5: GET /api/tickets/:id with Message Pagination

**Files:**

- Modify: `apps/api/src/routes/tickets.ts`

- [ ] **Step 1: Add GET /:id route**

Add before `export default router;`:

```typescript
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
      const isClient =
        req.user!.roles.includes("client") &&
        !req.user!.roles.some((r: string) => ["admin", "manager", "accountant"].includes(r));
      const msgLimit = Math.min(100, Math.max(1, parseInt(limit as string) || 50));

      const ticket = await prisma.ticket.findFirst({
        where: { id, ...scopedWhere },
        include: TICKET_DETAIL_INCLUDE,
      });

      if (!ticket) return res.status(404).json({ error: "Ticket not found" });

      // Cursor-based pagination for messages
      const msgWhere: any = {
        ticketId: id,
        deletedAt: null,
      };
      if (isClient) msgWhere.isInternal = false;

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
        msgQuery.skip = 1; // skip the cursor itself
      }

      const messages = await prisma.ticketMessage.findMany(msgQuery);
      const hasMore = messages.length === msgLimit;

      res.json({
        ticket,
        messages: messages.reverse(), // return oldest-first for display
        hasMore,
        nextCursor: hasMore ? messages[0]?.id : null, // oldest message id for next page
      });
    } catch (err) {
      console.error("GET /api/tickets/:id error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/routes/tickets.ts
git commit -m "feat(tickets): add GET /api/tickets/:id with cursor-based message pagination"
```

---

### Task 6: POST /api/tickets — Create Ticket

**Files:**

- Modify: `apps/api/src/routes/tickets.ts`

- [ ] **Step 1: Add Zod import and schemas at top of file**

After imports:

```typescript
import { z } from "zod";

const createTicketSchema = z.object({
  subject: z.string().min(1).max(200),
  type: z.enum(["QUESTION", "DOCUMENT_REQUEST", "PROBLEM", "DOCUMENT_UPLOAD"]).optional(),
  organizationId: z.string().uuid(),
  body: z.string().min(1).max(5000),
});
```

- [ ] **Step 2: Add POST / route**

```typescript
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

      // Verify user has access to this organization
      const scopedWhere = getTicketScopedWhere(req);
      const org = await prisma.organization.findFirst({
        where: {
          id: organizationId,
          ...(scopedWhere.organization ? { ...scopedWhere.organization } : {}),
        },
        include: { members: true, section: { include: { members: true } } },
      });

      // For clients, check org membership; for staff, check section membership
      const isClient = req.user!.roles.includes("client");
      if (isClient) {
        const isMember = org?.members.some((m) => m.userId === userId && m.role === "client");
        if (!isMember) return res.status(403).json({ error: "Access denied to this organization" });
      } else if (!org) {
        return res.status(404).json({ error: "Organization not found" });
      }

      // Auto-assign: responsible > accountant > null
      let assignedToId: string | null = null;
      if (org) {
        const responsible = org.members.find((m) => m.role === "responsible");
        if (responsible) {
          assignedToId = responsible.userId;
        } else {
          const accountant = org.members.find((m) => m.role === "accountant");
          if (accountant) assignedToId = accountant.userId;
        }
      }

      const ticket = await prisma.ticket.create({
        data: {
          subject,
          type: (type as any) || "QUESTION",
          organizationId,
          createdById: userId,
          assignedToId,
          messages: {
            create: {
              body,
              authorId: userId,
            },
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

      // Audit
      logAudit({
        action: "ticket.create",
        userId,
        entity: "Ticket",
        entityId: ticket.id,
        details: { subject, type: ticket.type, organizationId },
      }).catch(console.error);

      // Notify assigned staff
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

      res.status(201).json(ticket);
    } catch (err) {
      console.error("POST /api/tickets error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/tickets.ts
git commit -m "feat(tickets): add POST /api/tickets with auto-assign and notifications"
```

---

### Task 7: PATCH /api/tickets/:id & DELETE

**Files:**

- Modify: `apps/api/src/routes/tickets.ts`

- [ ] **Step 1: Add update schema**

```typescript
const updateTicketSchema = z
  .object({
    status: z
      .enum(["NEW", "IN_PROGRESS", "WAITING_CLIENT", "ON_HOLD", "ESCALATED", "CLOSED", "REOPENED"])
      .optional(),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
    assignedToId: z.string().uuid().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No fields to update" });
```

- [ ] **Step 2: Add PATCH /:id route**

```typescript
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

      const existing = await prisma.ticket.findFirst({
        where: { id, ...scopedWhere },
      });
      if (!existing) return res.status(404).json({ error: "Ticket not found" });

      const data: any = {};
      if (parsed.data.status !== undefined) {
        data.status = parsed.data.status;
        if (parsed.data.status === "CLOSED") data.closedAt = new Date();
        if (parsed.data.status === "REOPENED") data.closedAt = null;
      }
      if (parsed.data.priority !== undefined) data.priority = parsed.data.priority;
      if (parsed.data.assignedToId !== undefined) data.assignedToId = parsed.data.assignedToId;

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
          "Статус тикета изменён",
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
```

- [ ] **Step 3: Add DELETE /:id route**

```typescript
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
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/tickets.ts
git commit -m "feat(tickets): add PATCH and DELETE endpoints with notifications"
```

---

### Task 8: POST Messages with Attachments

**Files:**

- Modify: `apps/api/src/routes/tickets.ts`

- [ ] **Step 1: Add multer import and config at top of file**

```typescript
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});
```

- [ ] **Step 2: Add POST /:id/messages route**

```typescript
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
      const isClient =
        req.user!.roles.includes("client") &&
        !req.user!.roles.some((r: string) => ["admin", "manager", "accountant"].includes(r));

      if (!msgBody || typeof msgBody !== "string" || msgBody.trim().length === 0) {
        return res.status(400).json({ error: "Message body is required" });
      }
      if (msgBody.length > 5000) {
        return res.status(400).json({ error: "Message too long (max 5000 chars)" });
      }

      // Client cannot send internal messages
      const internal = isInternal === "true" || isInternal === true;
      if (isClient && internal) {
        return res.status(403).json({ error: "Clients cannot send internal messages" });
      }

      // Verify ticket access
      const scopedWhere = getTicketScopedWhere(req);
      const ticket = await prisma.ticket.findFirst({
        where: { id, ...scopedWhere },
      });
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });

      // Create message with attachments
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

      // Auto-status transition + update ticket.updatedAt
      const statusUpdate: any = { updatedAt: new Date() };
      if (isClient && ticket.status === "WAITING_CLIENT") {
        statusUpdate.status = "IN_PROGRESS";
      } else if (!isClient && !internal) {
        if (
          ticket.status === "NEW" ||
          ticket.status === "IN_PROGRESS" ||
          ticket.status === "REOPENED"
        ) {
          statusUpdate.status = "WAITING_CLIENT";
        }
      }
      await prisma.ticket.update({ where: { id }, data: statusUpdate });

      // Audit
      logAudit({
        action: "ticket.message.create",
        userId,
        entity: "TicketMessage",
        entityId: message.id,
        details: { ticketId: id, isInternal: internal, attachments: files.length },
      }).catch(console.error);

      // Notifications (skip for internal notes)
      if (!internal) {
        if (isClient && ticket.assignedToId) {
          notifyWithTelegram(
            ticket.assignedToId,
            "ticket_message",
            "Новое сообщение в тикете",
            `#${ticket.number}: ${ticket.subject}`,
            `/tickets/${id}`,
            `💬 Сообщение в тикете #${ticket.number}: ${ticket.subject}`,
          ).catch(console.error);
        } else if (!isClient) {
          notifyWithTelegram(
            ticket.createdById,
            "ticket_message",
            "Ответ по вашему обращению",
            `#${ticket.number}: ${ticket.subject}`,
            `/tickets/${id}`,
            `💬 Ответ по обращению #${ticket.number}: ${ticket.subject}`,
          ).catch(console.error);
        }
      }

      res.status(201).json(message);
    } catch (err) {
      console.error("POST /api/tickets/:id/messages error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/tickets.ts
git commit -m "feat(tickets): add POST messages with file attachments and auto-status"
```

---

### Task 9: Attachment Download & Message Soft-Delete

**Files:**

- Modify: `apps/api/src/routes/tickets.ts`

- [ ] **Step 1: Add GET /attachments/:attachmentId route**

```typescript
// ==================== GET /api/tickets/attachments/:attachmentId ====================
router.get("/attachments/:attachmentId", authenticate, async (req: Request, res: Response) => {
  try {
    const { attachmentId } = req.params;
    const scopedWhere = getTicketScopedWhere(req);

    // Scoped: Attachment -> Message -> Ticket -> org/section check
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
```

**Important:** This route must be placed **before** the `/:id` route in the file, otherwise Express will treat `attachments` as an `:id` parameter. Move it right after the `GET /` route.

- [ ] **Step 2: Add DELETE /:id/messages/:msgId route**

```typescript
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
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/tickets.ts
git commit -m "feat(tickets): add scoped attachment download and message soft-delete"
```

---

## Chunk 3: Frontend — Tickets List Page

### Task 10: TicketsPage.jsx — List with Filters

**Files:**

- Create: `apps/web/src/pages/TicketsPage.jsx`
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/web/src/components/Layout.jsx`

- [ ] **Step 1: Add route and nav item**

In `apps/web/src/App.jsx`, add import:

```jsx
import TicketsPage from "./pages/TicketsPage.jsx";
import TicketDetailPage from "./pages/TicketDetailPage.jsx";
```

Add routes inside the protected layout:

```jsx
<Route path="tickets" element={<TicketsPage />} />
<Route path="tickets/:id" element={<TicketDetailPage />} />
```

In `apps/web/src/components/Layout.jsx`, add import:

```jsx
import { MessageSquare } from "lucide-react";
```

(Add `MessageSquare` to the existing lucide-react import.)

Add nav item to `navItems` array (before the audit-log entry):

```jsx
{
  to: "/tickets",
  label: null,
  icon: MessageSquare,
  permission: ["ticket", "view"],
},
```

Update the label rendering in the NavLink (line ~151) — the existing `item.label ?? (hasRole("client") ? "Материалы" : "База знаний")` pattern only handles the knowledge item. Add a ticket-specific label resolution.

Change the label rendering to handle both cases:

```jsx
{
  item.label ??
    (item.to === "/tickets"
      ? hasRole("client")
        ? "Обращения"
        : "Тикеты"
      : hasRole("client")
        ? "Материалы"
        : "База знаний");
}
```

- [ ] **Step 2: Create TicketsPage.jsx**

Create `apps/web/src/pages/TicketsPage.jsx`:

```jsx
import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../lib/api.js";
import {
  Plus,
  Loader2,
  MessageSquare,
  HelpCircle,
  FileSearch,
  AlertTriangle,
  Upload,
  Search,
  Filter,
} from "lucide-react";

const STATUS_LABELS = {
  NEW: "Новый",
  IN_PROGRESS: "В работе",
  WAITING_CLIENT: "Ожидает клиента",
  ON_HOLD: "На паузе",
  ESCALATED: "Эскалация",
  CLOSED: "Закрыт",
  REOPENED: "Переоткрыт",
};

const STATUS_COLORS = {
  NEW: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-yellow-100 text-yellow-700",
  WAITING_CLIENT: "bg-orange-100 text-orange-700",
  ON_HOLD: "bg-slate-100 text-slate-600",
  ESCALATED: "bg-red-100 text-red-700",
  CLOSED: "bg-green-100 text-green-700",
  REOPENED: "bg-purple-100 text-purple-700",
};

const PRIORITY_LABELS = { LOW: "Низкий", NORMAL: "Обычный", HIGH: "Высокий", URGENT: "Срочный" };
const PRIORITY_COLORS = {
  LOW: "bg-slate-100 text-slate-600",
  NORMAL: "bg-blue-100 text-blue-700",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};

const TYPE_LABELS = {
  QUESTION: "Вопрос",
  DOCUMENT_REQUEST: "Запрос документа",
  PROBLEM: "Проблема",
  DOCUMENT_UPLOAD: "Загрузка документа",
};

const TYPE_ICONS = {
  QUESTION: HelpCircle,
  DOCUMENT_REQUEST: FileSearch,
  PROBLEM: AlertTriangle,
  DOCUMENT_UPLOAD: Upload,
};

const TYPE_COLORS = {
  QUESTION: "text-blue-600",
  DOCUMENT_REQUEST: "text-amber-600",
  PROBLEM: "text-red-600",
  DOCUMENT_UPLOAD: "text-green-600",
};

export default function TicketsPage() {
  const { hasPermission, hasRole } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tickets, setTickets] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  const [typeFilter, setTypeFilter] = useState(searchParams.get("type") || "");
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [page, setPage] = useState(parseInt(searchParams.get("page") || "1"));

  const isClient = hasRole("client");
  const isStaff = hasRole("admin") || hasRole("manager") || hasRole("accountant");
  const canCreate = hasPermission("ticket", "create");

  // Modal state for creating ticket
  const [showCreate, setShowCreate] = useState(false);
  const [orgs, setOrgs] = useState([]);
  const [createForm, setCreateForm] = useState({
    subject: "",
    type: "QUESTION",
    organizationId: "",
    body: "",
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type", typeFilter);
      if (search) params.set("search", search);
      params.set("page", String(page));
      params.set("limit", "20");

      const res = await api(`/api/tickets?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTickets(data.tickets);
      setTotal(data.total);
    } catch {
      setError("Не удалось загрузить тикеты");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, search, page]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Fetch orgs for create form
  useEffect(() => {
    if (!showCreate) return;
    api("/api/organizations?limit=1000")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.organizations || [];
        setOrgs(list);
        if (list.length === 1) setCreateForm((f) => ({ ...f, organizationId: list[0].id }));
      })
      .catch(() => {});
  }, [showCreate]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!createForm.subject.trim() || !createForm.organizationId || !createForm.body.trim()) {
      setCreateError("Заполните все поля");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await api("/api/tickets", {
        method: "POST",
        body: JSON.stringify(createForm),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Ошибка создания");
      }
      const ticket = await res.json();
      setShowCreate(false);
      setCreateForm({ subject: "", type: "QUESTION", organizationId: "", body: "" });
      navigate(`/tickets/${ticket.id}`);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isClient ? "Обращения" : "Тикеты"}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {total} {isClient ? "обращений" : "тикетов"}
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-xl text-sm font-medium shadow-lg shadow-[#6567F1]/30 transition-all"
          >
            <Plus size={16} />
            {isClient ? "Новое обращение" : "Создать тикет"}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск по теме..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="">Все статусы</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        {isStaff && (
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          >
            <option value="">Все типы</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-16 text-red-500">{error}</div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <MessageSquare size={40} className="mx-auto mb-3 opacity-50" />
          <p>{isClient ? "У вас пока нет обращений" : "Нет тикетов"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => {
            const TypeIcon = TYPE_ICONS[t.type] || HelpCircle;
            return (
              <Link
                key={t.id}
                to={`/tickets/${t.id}`}
                className="block bg-white rounded-2xl shadow-lg border border-slate-200 p-4 hover:shadow-xl transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-slate-400 font-mono">#{t.number}</span>
                      <TypeIcon size={14} className={TYPE_COLORS[t.type]} />
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[t.status]}`}
                      >
                        {STATUS_LABELS[t.status]}
                      </span>
                      {isStaff && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[t.priority]}`}
                        >
                          {PRIORITY_LABELS[t.priority]}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-medium text-slate-900 truncate">{t.subject}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                      {isStaff && t.organization && <span>{t.organization.shortName}</span>}
                      <span>{new Date(t.createdAt).toLocaleDateString("ru")}</span>
                      <span>{t._count?.messages || 0} сообщ.</span>
                    </div>
                  </div>
                  {isStaff && t.assignedTo && (
                    <div className="text-xs text-slate-500 text-right whitespace-nowrap">
                      {t.assignedTo.firstName} {t.assignedTo.lastName}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-50"
          >
            Назад
          </button>
          <span className="text-sm text-slate-500">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-50"
          >
            Далее
          </button>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                {isClient ? "Новое обращение" : "Создать тикет"}
              </h2>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Организация</label>
                <select
                  value={createForm.organizationId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, organizationId: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  required
                >
                  <option value="">Выберите организацию</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.shortName || o.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Тип</label>
                <select
                  value={createForm.type}
                  onChange={(e) => setCreateForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Тема</label>
                <input
                  type="text"
                  maxLength={200}
                  value={createForm.subject}
                  onChange={(e) => setCreateForm((f) => ({ ...f, subject: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  placeholder="Краткое описание вопроса"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Сообщение</label>
                <textarea
                  rows={4}
                  maxLength={5000}
                  value={createForm.body}
                  onChange={(e) => setCreateForm((f) => ({ ...f, body: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none"
                  placeholder="Опишите ваш вопрос подробнее..."
                  required
                />
              </div>
              {createError && <p className="text-sm text-red-500">{createError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 text-sm bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg font-medium shadow-lg shadow-[#6567F1]/30 disabled:opacity-50 transition-all"
                >
                  {creating ? "Создание..." : "Создать"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/TicketsPage.jsx apps/web/src/App.jsx apps/web/src/components/Layout.jsx
git commit -m "feat(tickets): add TicketsPage with filters, pagination, create modal"
```

---

## Chunk 4: Frontend — Ticket Detail Page

### Task 11: TicketDetailPage.jsx — Chat View

**Files:**

- Create: `apps/web/src/pages/TicketDetailPage.jsx`

- [ ] **Step 1: Create TicketDetailPage.jsx**

Create `apps/web/src/pages/TicketDetailPage.jsx`. This is a large file — the main sections are:

```jsx
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "react-router";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../lib/api.js";
import {
  Loader2,
  Send,
  Paperclip,
  ArrowLeft,
  X,
  Download,
  FileText,
  Eye,
  EyeOff,
  Trash2,
  ChevronUp,
} from "lucide-react";

const STATUS_LABELS = {
  NEW: "Новый",
  IN_PROGRESS: "В работе",
  WAITING_CLIENT: "Ожидает клиента",
  ON_HOLD: "На паузе",
  ESCALATED: "Эскалация",
  CLOSED: "Закрыт",
  REOPENED: "Переоткрыт",
};
const STATUS_COLORS = {
  NEW: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-yellow-100 text-yellow-700",
  WAITING_CLIENT: "bg-orange-100 text-orange-700",
  ON_HOLD: "bg-slate-100 text-slate-600",
  ESCALATED: "bg-red-100 text-red-700",
  CLOSED: "bg-green-100 text-green-700",
  REOPENED: "bg-purple-100 text-purple-700",
};
const PRIORITY_LABELS = { LOW: "Низкий", NORMAL: "Обычный", HIGH: "Высокий", URGENT: "Срочный" };

export default function TicketDetailPage() {
  const { id } = useParams();
  const { user, hasRole, hasPermission } = useAuth();
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const [msgBody, setMsgBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);

  const [staff, setStaff] = useState([]);

  const isClient =
    hasRole("client") && !hasRole("admin") && !hasRole("manager") && !hasRole("accountant");
  const isStaff = hasRole("admin") || hasRole("manager") || hasRole("accountant");
  const canEdit = hasPermission("ticket", "edit");
  const canDelete = hasRole("admin") || hasRole("manager");

  const fetchTicket = useCallback(
    async (cursorId) => {
      if (cursorId) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (cursorId) params.set("cursor", cursorId);
        params.set("limit", "50");
        const res = await api(`/api/tickets/${id}?${params}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setTicket(data.ticket);
        if (cursorId) {
          setMessages((prev) => [...data.messages, ...prev]);
        } else {
          setMessages(data.messages);
        }
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);
      } catch {
        setError("Не удалось загрузить тикет");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [id],
  );

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  // Fetch staff for assignment dropdown
  useEffect(() => {
    if (!isStaff) return;
    api("/api/users?limit=200")
      .then((r) => r.json())
      .then((data) => {
        setStaff(Array.isArray(data) ? data : data.users || []);
      })
      .catch(() => {});
  }, [isStaff]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (!loading) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, loading]);

  async function handleSend(e) {
    e.preventDefault();
    if (!msgBody.trim() && files.length === 0) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append("body", msgBody.trim());
      if (isInternal) formData.append("isInternal", "true");
      files.forEach((f) => formData.append("files", f));

      const res = await api(`/api/tickets/${id}/messages`, {
        method: "POST",
        body: formData,
        headers: {}, // let browser set Content-Type for multipart
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Ошибка отправки");
      }
      const msg = await res.json();
      setMessages((prev) => [...prev, msg]);
      setMsgBody("");
      setFiles([]);
      setIsInternal(false);
      // Refresh ticket to get updated status
      const ticketRes = await api(`/api/tickets/${id}?limit=0`);
      if (ticketRes.ok) {
        const data = await ticketRes.json();
        setTicket(data.ticket);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSending(false);
    }
  }

  async function handleStatusChange(newStatus) {
    try {
      const res = await api(`/api/tickets/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setTicket((t) => ({ ...t, status: updated.status, closedAt: updated.closedAt }));
    } catch {
      alert("Не удалось обновить статус");
    }
  }

  async function handlePriorityChange(newPriority) {
    try {
      const res = await api(`/api/tickets/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ priority: newPriority }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setTicket((t) => ({ ...t, priority: updated.priority }));
    } catch {
      alert("Не удалось обновить приоритет");
    }
  }

  async function handleAssignChange(assignedToId) {
    try {
      const res = await api(`/api/tickets/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ assignedToId: assignedToId || null }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setTicket((t) => ({
        ...t,
        assignedToId: updated.assignedToId,
        assignedTo: updated.assignedTo,
      }));
    } catch {
      alert("Не удалось назначить");
    }
  }

  async function handleDeleteMessage(msgId) {
    if (!confirm("Удалить сообщение?")) return;
    try {
      const res = await api(`/api/tickets/${id}/messages/${msgId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, deletedAt: new Date().toISOString() } : m)),
      );
    } catch {
      alert("Не удалось удалить");
    }
  }

  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  if (error || !ticket)
    return <div className="text-center py-16 text-red-500">{error || "Тикет не найден"}</div>;

  const apiBase = import.meta.env.VITE_API_URL || "";

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Main chat area */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Link
            to="/tickets"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">#{ticket.number}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[ticket.status]}`}
              >
                {STATUS_LABELS[ticket.status]}
              </span>
            </div>
            <h1 className="text-lg font-bold text-slate-900 truncate">{ticket.subject}</h1>
          </div>
        </div>

        {/* Messages */}
        <div
          className="bg-white rounded-2xl shadow-lg border border-slate-200 flex flex-col"
          style={{ height: "calc(100vh - 280px)" }}
        >
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {hasMore && (
              <button
                onClick={() => fetchTicket(nextCursor)}
                disabled={loadingMore}
                className="w-full text-center py-2 text-sm text-[#6567F1] hover:bg-[#6567F1]/5 rounded-lg transition-colors"
              >
                {loadingMore ? (
                  <Loader2 size={16} className="animate-spin mx-auto" />
                ) : (
                  <span className="flex items-center justify-center gap-1">
                    <ChevronUp size={14} /> Загрузить ранние сообщения
                  </span>
                )}
              </button>
            )}

            {messages.map((msg) => {
              const isOwn = msg.author?.id === user?.id;
              const isDeleted = !!msg.deletedAt;

              if (isDeleted) {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <span className="text-xs text-slate-400 italic">Сообщение удалено</span>
                  </div>
                );
              }

              return (
                <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                      msg.isInternal
                        ? "bg-yellow-50 border-2 border-dashed border-yellow-300"
                        : isOwn
                          ? "bg-[#6567F1] text-white"
                          : "bg-slate-100 text-slate-900"
                    }`}
                  >
                    {msg.isInternal && (
                      <div className="flex items-center gap-1 text-xs text-yellow-600 font-medium mb-1">
                        <EyeOff size={12} /> Внутренняя заметка
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs font-medium ${msg.isInternal ? "text-yellow-700" : isOwn ? "text-white/80" : "text-slate-500"}`}
                      >
                        {msg.author?.firstName} {msg.author?.lastName}
                      </span>
                      <span
                        className={`text-xs ${msg.isInternal ? "text-yellow-500" : isOwn ? "text-white/60" : "text-slate-400"}`}
                      >
                        {new Date(msg.createdAt).toLocaleString("ru", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {canDelete && !isDeleted && (
                        <button
                          onClick={() => handleDeleteMessage(msg.id)}
                          className={`opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-black/10 transition-opacity ${isOwn ? "text-white/60" : "text-slate-400"}`}
                          title="Удалить"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    <p
                      className={`text-sm whitespace-pre-wrap ${msg.isInternal ? "text-yellow-900" : ""}`}
                    >
                      {msg.body}
                    </p>

                    {/* Attachments */}
                    {msg.attachments?.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {msg.attachments.map((att) => (
                          <a
                            key={att.id}
                            href={`${apiBase}/api/tickets/attachments/${att.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg transition-colors ${
                              isOwn
                                ? "bg-white/20 hover:bg-white/30 text-white"
                                : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200"
                            }`}
                          >
                            <FileText size={14} />
                            <span className="truncate flex-1">{att.fileName}</span>
                            <span className="text-[10px] opacity-70">
                              {(att.fileSize / 1024).toFixed(0)} KB
                            </span>
                            <Download size={12} />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          {ticket.status !== "CLOSED" && (
            <form onSubmit={handleSend} className="border-t border-slate-200 p-4">
              {/* File previews */}
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {files.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1 bg-slate-100 rounded-lg px-2 py-1 text-xs text-slate-600"
                    >
                      <FileText size={12} />
                      <span className="truncate max-w-[120px]">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="text-slate-400 hover:text-red-500"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2">
                {isStaff && (
                  <button
                    type="button"
                    onClick={() => setIsInternal(!isInternal)}
                    className={`p-2 rounded-lg transition-colors ${isInternal ? "bg-yellow-100 text-yellow-700" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"}`}
                    title={
                      isInternal
                        ? "Внутренняя заметка (видна только сотрудникам)"
                        : "Обычное сообщение"
                    }
                  >
                    {isInternal ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  title="Прикрепить файл"
                >
                  <Paperclip size={18} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip"
                  className="hidden"
                  onChange={(e) => {
                    const newFiles = Array.from(e.target.files || []);
                    setFiles((prev) => [...prev, ...newFiles].slice(0, 5));
                    e.target.value = "";
                  }}
                />
                <textarea
                  rows={1}
                  value={msgBody}
                  onChange={(e) => setMsgBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(e);
                    }
                  }}
                  placeholder={isInternal ? "Внутренняя заметка..." : "Введите сообщение..."}
                  className={`flex-1 px-3 py-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] ${
                    isInternal ? "border-yellow-300 bg-yellow-50" : "border-slate-200"
                  }`}
                />
                <button
                  type="submit"
                  disabled={sending || (!msgBody.trim() && files.length === 0)}
                  className="p-2 rounded-lg bg-[#6567F1] text-white hover:bg-[#5557E1] disabled:opacity-50 transition-colors"
                >
                  {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </div>
              {isInternal && (
                <p className="text-xs text-yellow-600 mt-1">
                  Это внутренняя заметка — клиент её не увидит
                </p>
              )}
            </form>
          )}
        </div>
      </div>

      {/* Sidebar (staff only) */}
      {isStaff && (
        <div className="w-full lg:w-72 space-y-4">
          {/* Info card */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-4 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Информация</h3>
            <div>
              <label className="text-xs text-slate-500">Организация</label>
              <Link
                to={`/organizations/${ticket.organization?.id}`}
                className="block text-sm text-[#6567F1] hover:underline"
              >
                {ticket.organization?.shortName || ticket.organization?.fullName}
              </Link>
            </div>
            <div>
              <label className="text-xs text-slate-500">Автор</label>
              <p className="text-sm text-slate-900">
                {ticket.createdBy?.firstName} {ticket.createdBy?.lastName}
              </p>
            </div>
            <div>
              <label className="text-xs text-slate-500">Создан</label>
              <p className="text-sm text-slate-900">
                {new Date(ticket.createdAt).toLocaleString("ru")}
              </p>
            </div>
          </div>

          {/* Controls card */}
          {canEdit && (
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-4 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Управление</h3>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Статус</label>
                <select
                  value={ticket.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                >
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Приоритет</label>
                <select
                  value={ticket.priority}
                  onChange={(e) => handlePriorityChange(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                >
                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Назначен</label>
                <select
                  value={ticket.assignedToId || ""}
                  onChange={(e) => handleAssignChange(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                >
                  <option value="">Не назначен</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/TicketDetailPage.jsx
git commit -m "feat(tickets): add TicketDetailPage with chat, attachments, sidebar controls"
```

---

## Chunk 5: Organization Integration & Final Wiring

### Task 12: Organization Detail — Tickets Section

**Files:**

- Modify: `apps/web/src/pages/OrganizationDetailPage.jsx`

- [ ] **Step 1: Add tickets state and fetch**

In `OrganizationDetailPage.jsx`, add state:

```jsx
const [orgTickets, setOrgTickets] = useState([]);
```

Add fetch function (alongside other fetch functions):

```jsx
const fetchOrgTickets = useCallback(async () => {
  if (!hasPermission("ticket", "view")) return;
  try {
    const res = await api(`/api/tickets?organizationId=${id}&limit=10`);
    if (res.ok) {
      const data = await res.json();
      setOrgTickets(data.tickets || []);
    }
  } catch {
    /* silent */
  }
}, [id]);
```

Call `fetchOrgTickets()` inside the existing `useEffect` that fetches org data, or add a new `useEffect`:

```jsx
useEffect(() => {
  fetchOrgTickets();
}, [fetchOrgTickets]);
```

- [ ] **Step 2: Add tickets section in JSX**

Add a "Тикеты" card section in the full-width area (alongside tasks, documents, etc.):

```jsx
{
  hasPermission("ticket", "view") && (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-900">Тикеты</h3>
        <div className="flex items-center gap-2">
          {orgTickets.length > 0 && (
            <Link
              to={`/tickets?organizationId=${id}`}
              className="text-sm text-[#6567F1] hover:underline"
            >
              Все тикеты
            </Link>
          )}
          {hasPermission("ticket", "create") && (
            <Link
              to={`/tickets?create=true&orgId=${id}`}
              className="flex items-center gap-1 text-sm text-[#6567F1] hover:underline"
            >
              <Plus size={14} /> Создать
            </Link>
          )}
        </div>
      </div>
      {orgTickets.length === 0 ? (
        <p className="text-sm text-slate-400">Нет тикетов</p>
      ) : (
        <div className="space-y-2">
          {orgTickets.map((t) => (
            <Link
              key={t.id}
              to={`/tickets/${t.id}`}
              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-slate-400 font-mono">#{t.number}</span>
                <span className="text-sm text-slate-900 truncate">{t.subject}</span>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                  t.status === "CLOSED"
                    ? "bg-green-100 text-green-700"
                    : t.status === "NEW"
                      ? "bg-blue-100 text-blue-700"
                      : t.status === "WAITING_CLIENT"
                        ? "bg-orange-100 text-orange-700"
                        : "bg-yellow-100 text-yellow-700"
                }`}
              >
                {t.status === "CLOSED"
                  ? "Закрыт"
                  : t.status === "NEW"
                    ? "Новый"
                    : t.status === "WAITING_CLIENT"
                      ? "Ожидает клиента"
                      : "В работе"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

Add `Plus` to the lucide-react imports if not already there.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/OrganizationDetailPage.jsx
git commit -m "feat(tickets): add tickets section to organization detail page"
```

---

### Task 13: Final — TicketsPage Create from Org Link

**Files:**

- Modify: `apps/web/src/pages/TicketsPage.jsx`

- [ ] **Step 1: Handle create=true&orgId query params**

In `TicketsPage.jsx`, update the existing `useEffect` for `showCreate`:

After the existing state declarations, add:

```jsx
// Auto-open create modal from org page link
useEffect(() => {
  if (searchParams.get("create") === "true") {
    setShowCreate(true);
    const orgId = searchParams.get("orgId");
    if (orgId) setCreateForm((f) => ({ ...f, organizationId: orgId }));
    // Clean up URL
    setSearchParams({}, { replace: true });
  }
}, []);
```

- [ ] **Step 2: Verify everything compiles**

Run: `cd apps/web && npx vite build 2>&1 | head -20`
Expected: Build succeeds without errors.

- [ ] **Step 3: Commit all remaining changes**

```bash
git add apps/web/src/pages/TicketsPage.jsx
git commit -m "feat(tickets): handle create from organization detail link"
```

---

### Task 14: Final Verification

- [ ] **Step 1: Run API lint/build**

Run: `cd apps/api && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors or only pre-existing ones.

- [ ] **Step 2: Run frontend build**

Run: `cd apps/web && npx vite build 2>&1 | tail -10`
Expected: Build succeeds.

- [ ] **Step 3: Test manually**

1. Start API: `npm run dev:api`
2. Start Web: `npm run dev:web`
3. Login as admin
4. Go to /tickets — should see empty list
5. Click "Создать тикет" — modal should open
6. Create a ticket — should redirect to detail page
7. Send a message — should appear in chat
8. Change status from sidebar — should update
9. Login as client — should see "Обращения" in nav
10. Create a ticket as client — should auto-assign to org's accountant

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(tickets): complete ticket system implementation"
```
