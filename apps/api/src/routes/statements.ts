import { Router } from "express";
import type { Request } from "express";
import fs from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { logAudit } from "../lib/audit.js";
import { upload, UPLOADS_DIR } from "../lib/upload.js";
import { parseStatement } from "../lib/statement-parser.js";
import { reconcile } from "../lib/statement-reconcile.js";
import { generate1c } from "../lib/statement-1c.js";
import { generatePdf } from "../lib/statement-pdf.js";

const router = Router();

type AuthedUser = { userId: string; roles: string[] };

export function getStatementScopedWhere(user: AuthedUser): Prisma.BankStatementWhereInput {
  const { roles, userId } = user;
  if (roles.includes("admin") || roles.includes("supervisor")) return {};
  if (roles.includes("manager") || roles.includes("accountant")) {
    return { organization: { section: { members: { some: { userId } } } } };
  }
  // client — нет доступа в v1
  return { id: "__none__" };
}

function isPrivileged(roles: string[]): boolean {
  return roles.some((r) => r === "admin" || r === "supervisor");
}

/** Существует ли организация И доступна ли она пользователю по его скоупу. */
async function orgInScope(orgId: string, user: AuthedUser): Promise<boolean> {
  const allowed = await prisma.organization.findFirst({
    where: {
      id: orgId,
      ...(isPrivileged(user.roles)
        ? {}
        : { section: { members: { some: { userId: user.userId } } } }),
    },
    select: { id: true },
  });
  return Boolean(allowed);
}

/** Авто-детект организации по номеру счёта — только среди организаций в скоупе. */
async function detectOrg(
  accountNumbers: string[],
  user: AuthedUser,
): Promise<{ id: string; name: string } | null> {
  if (!accountNumbers.length) return null;
  const bankAcc = await prisma.organizationBankAccount.findFirst({
    where: {
      accountNumber: { in: accountNumbers },
      ...(isPrivileged(user.roles)
        ? {}
        : { organization: { section: { members: { some: { userId: user.userId } } } } }),
    },
    select: { organization: { select: { id: true, name: true } } },
  });
  return bankAcc?.organization ?? null;
}

function readOriginal(filename: string): { buf: Buffer; fullPath: string } {
  const fullPath = path.join(UPLOADS_DIR, filename);
  return { buf: fs.readFileSync(fullPath), fullPath };
}

/** DD.MM.YYYY → Date (полночь UTC); пустое → текущая дата. */
function parseRuDate(d: string | null): Date {
  if (!d) return new Date();
  const [dd, mm, yyyy] = d.split(".");
  return new Date(`${yyyy}-${mm}-${dd}`);
}

/**
 * Шаг 1: распарсить и сверить выписку БЕЗ сохранения, предложить организацию
 * по номеру счёта. Файл не сохраняется — клиент шлёт его повторно на сохранение.
 */
router.post(
  "/preview",
  authenticate,
  requirePermission("bank_statement", "create"),
  upload.single("file"),
  async (req: Request, res) => {
    try {
      if (!req.file) {
        res.status(422).json({ error: "Файл не передан" });
        return;
      }
      const buf = fs.readFileSync(req.file.path);
      fs.promises.unlink(req.file.path).catch(() => {}); // preview ничего не хранит

      let parsed;
      try {
        parsed = parseStatement(buf);
      } catch {
        res.status(422).json({
          error: "Не удалось распознать файл как выписку формата 1CClientBankExchange",
        });
        return;
      }

      const rec = reconcile(parsed);
      const accountNumbers = parsed.accounts.map((a) => a.accountNumber).filter(Boolean);
      const suggestedOrg = await detectOrg(accountNumbers, req.user!);

      res.json({
        reconcile: rec,
        accountNumbers,
        bankName: parsed.meta.sender,
        periodStart: parsed.meta.dateStart,
        periodEnd: parsed.meta.dateEnd,
        docCount: parsed.accounts.reduce((s, a) => s + a.operations.length, 0),
        suggestedOrg, // {id,name} | null
      });
    } catch (err) {
      console.error("Statement preview error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

/**
 * Шаг 2: сохранить выписку. Организация ОБЯЗАТЕЛЬНА и проверяется на скоуп —
 * непривязанные выписки не допускаются.
 */
router.post(
  "/",
  authenticate,
  requirePermission("bank_statement", "create"),
  upload.single("file"),
  async (req: Request, res) => {
    const cleanup = () => {
      if (req.file) fs.promises.unlink(req.file.path).catch(() => {});
    };
    try {
      if (!req.file) {
        res.status(422).json({ error: "Файл не передан" });
        return;
      }

      const organizationId = (req.body.organizationId as string) || null;
      if (!organizationId) {
        cleanup();
        res.status(422).json({ error: "Не выбрана организация" });
        return;
      }
      if (!(await orgInScope(organizationId, req.user!))) {
        cleanup();
        res.status(422).json({ error: "Организация не найдена или нет доступа" });
        return;
      }

      const buf = fs.readFileSync(req.file.path);
      let parsed;
      try {
        parsed = parseStatement(buf);
      } catch {
        cleanup();
        res.status(422).json({
          error: "Не удалось распознать файл как выписку формата 1CClientBankExchange",
        });
        return;
      }

      const rec = reconcile(parsed);
      const accountNumbers = parsed.accounts.map((a) => a.accountNumber).filter(Boolean);
      const totalIn = rec.perAccount.reduce((s, p) => s + p.sumIn, 0);
      const totalOut = rec.perAccount.reduce((s, p) => s + p.sumOut, 0);
      const docCount = parsed.accounts.reduce((s, a) => s + a.operations.length, 0);
      const openingBalance = parsed.accounts.reduce((s, a) => s + a.openingBalance, 0);
      const closingBalance = parsed.accounts.reduce((s, a) => s + a.closingBalance, 0);

      const record = await prisma.bankStatement.create({
        data: {
          organizationId,
          uploadedById: req.user!.userId,
          bankName: parsed.meta.sender,
          accountNumbers,
          periodStart: parseRuDate(parsed.meta.dateStart),
          periodEnd: parseRuDate(parsed.meta.dateEnd),
          openingBalance: new Prisma.Decimal(openingBalance),
          closingBalance: new Prisma.Decimal(closingBalance),
          totalIn: new Prisma.Decimal(totalIn),
          totalOut: new Prisma.Decimal(totalOut),
          docCount,
          reconcileStatus: rec.status,
          reconcileDiff: new Prisma.Decimal(rec.totalDiff),
          originalName: req.file.originalname,
          originalPath: req.file.filename,
        },
        include: { organization: { select: { id: true, name: true } } },
      });

      await logAudit({
        action: "bank_statement_uploaded",
        userId: req.user!.userId,
        entity: "bank_statement",
        entityId: record.id,
        details: { reconcile: rec.status, organizationId, accounts: accountNumbers },
      });

      res.status(201).json({
        statement: record,
        reconcile: rec,
        accounts: parsed.accounts.map((a) => ({
          accountNumber: a.accountNumber,
          openingBalance: a.openingBalance,
          closingBalance: a.closingBalance,
          operations: a.operations,
        })),
      });
    } catch (err) {
      console.error("Statement upload error:", err);
      cleanup();
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

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
      res.json(updated);
    } catch (err) {
      console.error("Statement reassign error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

/** Детали + операции (перепарс оригинала). */
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
    const { buf } = readOriginal(item.originalPath);
    const parsed = parseStatement(buf);
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

      const { buf } = readOriginal(item.originalPath);
      const parsed = parseStatement(buf);

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
