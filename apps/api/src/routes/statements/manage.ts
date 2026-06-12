import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { logAudit } from "../../lib/audit.js";
import { UPLOADS_DIR } from "../../lib/upload.js";
import { readOriginal, loadParsed } from "../../lib/statement-store.js";
import { syncStatementTransactions } from "../../lib/org-finance.js";
import { parseStatement } from "../../lib/statement-parser.js";
import { reconcile } from "../../lib/statement-reconcile.js";
import { normalizeEdited } from "../../lib/statement-edit.js";
import { generate1c } from "../../lib/statement-1c.js";
import { generatePdf } from "../../lib/statement-pdf.js";
import type { ParsedStatement } from "../../lib/statement-types.js";
import { getStatementScopedWhere, orgInScope, aggregatesFrom } from "./helpers.js";

const router = Router();

// Схема правок: клиент присылает счета с операциями; raw синхронизируется на сервере.
// raw-пары попадают verbatim в файл 1CClientBankExchange (`Ключ=Значение` на строку):
// перевод строки или `=` в ключе позволил бы подделать секции файла — отклоняем;
// переводы строк в значениях вычищаем (вторая линия защиты — в statement-1c.ts).
const rawKeySchema = z
  .string()
  .min(1)
  .max(128)
  .refine((k) => !/[=\r\n]/.test(k), { message: "Недопустимый ключ raw-поля" });
const rawValueSchema = z
  .string()
  .max(4000)
  .transform((v) => v.replace(/[\r\n]+/g, " "));
const rawRecordSchema = z.record(rawKeySchema, rawValueSchema);
const opEditSchema = z.object({
  docType: z.string().transform((v) => v.replace(/[\r\n]+/g, " ")),
  number: z.string(),
  date: z.string(),
  amount: z.coerce.number(),
  direction: z.enum(["in", "out"]),
  payerName: z.string().nullable(),
  payerInn: z.string().nullable(),
  payerAccount: z.string().nullable(),
  payeeName: z.string().nullable(),
  payeeInn: z.string().nullable(),
  payeeAccount: z.string().nullable(),
  purpose: z.string().nullable(),
  raw: rawRecordSchema.default({}),
});
const accEditSchema = z.object({
  accountNumber: z.string(),
  openingBalance: z.coerce.number(),
  closingBalance: z.coerce.number(),
  totalIn: z.coerce.number().default(0),
  totalOut: z.coerce.number().default(0),
  hasClosing: z.boolean().default(true),
  raw: rawRecordSchema.default({}),
  operations: z.array(opEditSchema),
});
const editSchema = z.object({ accounts: z.array(accEditSchema).min(1) });

/** Список загруженных выписок (по скоупу). */
router.get("/", authenticate, requirePermission("bank_statement", "view"), async (req, res) => {
  try {
    const where = getStatementScopedWhere(req.user!);
    const items = await prisma.bankStatement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { organization: { select: { id: true, name: true } } },
      take: 200,
    });
    res.json(items);
  } catch (err) {
    console.error("Statement list error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** Переназначить организацию уже загруженной выписки (исправление привязки). */
router.patch(
  "/:id",
  authenticate,
  requirePermission("bank_statement", "create"),
  async (req, res) => {
    try {
      const where = getStatementScopedWhere(req.user!);
      const item = await prisma.bankStatement.findFirst({
        where: { AND: [{ id: req.params.id }, where] },
        select: { id: true },
      });
      if (!item) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const organizationId = (req.body.organizationId as string) || null;
      if (!organizationId) {
        res.status(422).json({ error: "Не выбрана организация" });
        return;
      }
      if (!(await orgInScope(organizationId, req.user!))) {
        res.status(422).json({ error: "Организация не найдена или нет доступа" });
        return;
      }
      const updated = await prisma.bankStatement.update({
        where: { id: item.id },
        data: { organizationId },
        include: { organization: { select: { id: true, name: true } } },
      });
      await logAudit({
        action: "bank_statement_reassigned",
        userId: req.user!.userId,
        entity: "bank_statement",
        entityId: item.id,
        details: { organizationId },
      });
      await syncStatementTransactions(item.id);
      res.json(updated);
    } catch (err) {
      console.error("Statement reassign error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

/** Сохранить правки операций: пересинхронизировать raw, пересверить, обновить агрегаты. */
router.put(
  "/:id/operations",
  authenticate,
  requirePermission("bank_statement", "create"),
  async (req, res) => {
    try {
      const where = getStatementScopedWhere(req.user!);
      const item = await prisma.bankStatement.findFirst({
        where: { AND: [{ id: req.params.id }, where] },
        select: { id: true, editedData: true, originalPath: true },
      });
      if (!item) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      const parsedBody = editSchema.safeParse(req.body);
      if (!parsedBody.success) {
        res.status(422).json({ error: "Некорректные данные правок" });
        return;
      }

      const base = loadParsed(item); // для сохранения meta (кодировка, банк, шапка)
      const edited = normalizeEdited({
        meta: base.meta,
        accounts: parsedBody.data.accounts as ParsedStatement["accounts"],
      });
      const agg = aggregatesFrom(edited);

      const updated = await prisma.bankStatement.update({
        where: { id: item.id },
        data: {
          editedData: edited as unknown as Prisma.InputJsonValue,
          editedAt: new Date(),
          bankName: agg.bankName,
          accountNumbers: agg.accountNumbers,
          openingBalance: new Prisma.Decimal(agg.openingBalance),
          closingBalance: new Prisma.Decimal(agg.closingBalance),
          totalIn: new Prisma.Decimal(agg.totalIn),
          totalOut: new Prisma.Decimal(agg.totalOut),
          docCount: agg.docCount,
          reconcileStatus: agg.rec.status,
          reconcileDiff: new Prisma.Decimal(agg.rec.totalDiff),
        },
        include: { organization: { select: { id: true, name: true } } },
      });

      await logAudit({
        action: "bank_statement_edited",
        userId: req.user!.userId,
        entity: "bank_statement",
        entityId: item.id,
        details: { reconcile: agg.rec.status, docCount: agg.docCount },
      });

      await syncStatementTransactions(item.id);

      res.json({ statement: updated, reconcile: agg.rec, accounts: edited.accounts });
    } catch (err) {
      console.error("Statement edit error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

/** Сбросить правки — вернуться к оригиналу. */
router.post(
  "/:id/reset",
  authenticate,
  requirePermission("bank_statement", "create"),
  async (req, res) => {
    try {
      const where = getStatementScopedWhere(req.user!);
      const item = await prisma.bankStatement.findFirst({
        where: { AND: [{ id: req.params.id }, where] },
        select: { id: true, originalPath: true },
      });
      if (!item) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const parsed = parseStatement(readOriginal(item.originalPath).buf);
      const agg = aggregatesFrom(parsed);
      const updated = await prisma.bankStatement.update({
        where: { id: item.id },
        data: {
          editedData: Prisma.DbNull,
          editedAt: null,
          bankName: agg.bankName,
          accountNumbers: agg.accountNumbers,
          openingBalance: new Prisma.Decimal(agg.openingBalance),
          closingBalance: new Prisma.Decimal(agg.closingBalance),
          totalIn: new Prisma.Decimal(agg.totalIn),
          totalOut: new Prisma.Decimal(agg.totalOut),
          docCount: agg.docCount,
          reconcileStatus: agg.rec.status,
          reconcileDiff: new Prisma.Decimal(agg.rec.totalDiff),
        },
        include: { organization: { select: { id: true, name: true } } },
      });
      await logAudit({
        action: "bank_statement_edits_reset",
        userId: req.user!.userId,
        entity: "bank_statement",
        entityId: item.id,
      });
      await syncStatementTransactions(item.id);

      res.json({ statement: updated, reconcile: agg.rec, accounts: parsed.accounts });
    } catch (err) {
      console.error("Statement reset error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

/** Детали + операции (правленые или из оригинала). */
router.get("/:id", authenticate, requirePermission("bank_statement", "view"), async (req, res) => {
  try {
    const where = getStatementScopedWhere(req.user!);
    const item = await prisma.bankStatement.findFirst({
      where: { AND: [{ id: req.params.id }, where] },
      include: { organization: { select: { id: true, name: true } } },
    });
    if (!item) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const parsed = loadParsed(item);
    res.json({ statement: item, reconcile: reconcile(parsed), accounts: parsed.accounts });
  } catch (err) {
    console.error("Statement detail error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** Скачать txt (для 1С) или pdf (для глаз). */
router.get(
  "/:id/download",
  authenticate,
  requirePermission("bank_statement", "view"),
  async (req, res) => {
    try {
      const format = req.query.format === "pdf" ? "pdf" : "txt";
      const where = getStatementScopedWhere(req.user!);
      const item = await prisma.bankStatement.findFirst({
        where: { AND: [{ id: req.params.id }, where] },
        include: { organization: { select: { name: true } } },
      });
      if (!item) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      const parsed = loadParsed(item);

      if (format === "txt") {
        const out = generate1c(parsed);
        res.setHeader("Content-Type", "text/plain; charset=windows-1251");
        res.setHeader("Content-Disposition", 'attachment; filename="kl_to_1c.txt"');
        res.send(out);
      } else {
        const out = await generatePdf(parsed, reconcile(parsed), {
          orgName: item.organization?.name ?? null,
        });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", 'attachment; filename="statement.pdf"');
        res.send(out);
      }
    } catch (err) {
      console.error("Statement download error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

/** Удалить запись + оригинал файла. */
router.delete(
  "/:id",
  authenticate,
  requirePermission("bank_statement", "delete"),
  async (req, res) => {
    try {
      const where = getStatementScopedWhere(req.user!);
      const item = await prisma.bankStatement.findFirst({
        where: { AND: [{ id: req.params.id }, where] },
      });
      if (!item) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const fullPath = path.join(UPLOADS_DIR, item.originalPath);
      await prisma.bankStatement.delete({ where: { id: item.id } });
      fs.promises.unlink(fullPath).catch(() => {});
      await logAudit({
        action: "bank_statement_deleted",
        userId: req.user!.userId,
        entity: "bank_statement",
        entityId: item.id,
      });
      res.status(204).end();
    } catch (err) {
      console.error("Statement delete error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
