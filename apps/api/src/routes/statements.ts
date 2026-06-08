import { Router } from "express";
import type { Request } from "express";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { logAudit } from "../lib/audit.js";
import { upload, UPLOADS_DIR } from "../lib/upload.js";
import { readOriginal, loadParsed } from "../lib/statement-store.js";
import { syncStatementTransactions } from "../lib/org-finance.js";
import { parseStatement } from "../lib/statement-parser.js";
import { reconcile } from "../lib/statement-reconcile.js";
import { normalizeEdited } from "../lib/statement-edit.js";
import { generate1c } from "../lib/statement-1c.js";
import { generatePdf } from "../lib/statement-pdf.js";
import {
  getAdapter,
  resolveToken,
  BankConfigError,
  BankApiError,
} from "../lib/bank-adapters/index.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { getSberConfig } from "../lib/bank-adapters/sber-mtls.js";
import { exchangeAuthCode } from "../lib/bank-adapters/sber-client.js";
import { signSberState, verifySberState } from "../lib/bank-adapters/sber-oauth-state.js";
import { getAlfaConfig } from "../lib/bank-adapters/alfa-mtls.js";
import {
  exchangeAuthCode as exchangeAlfaCode,
  refreshAccessToken as refreshAlfaAccessToken,
  fetchDayTransactions as fetchAlfaDayTransactions,
} from "../lib/bank-adapters/alfa-client.js";
import { alfaAdapter } from "../lib/bank-adapters/alfa.js";
import { signAlfaState, verifyAlfaState } from "../lib/bank-adapters/alfa-oauth-state.js";
import {
  getTochkaOAuthConfig,
  getConsentsToken,
  createConsent,
  buildTochkaAuthorizeUrl,
  exchangeAuthCode as exchangeTochkaCode,
  findAccountIdByNumber as findTochkaAccountId,
} from "../lib/bank-adapters/tochka-oauth.js";
import { signTochkaState, verifyTochkaState } from "../lib/bank-adapters/tochka-oauth-state.js";
import type { ParsedStatement } from "../lib/statement-types.js";

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

/** DD.MM.YYYY → Date (полночь UTC); пустое → текущая дата. */
function parseRuDate(d: string | null): Date {
  if (!d) return new Date();
  const [dd, mm, yyyy] = d.split(".");
  return new Date(`${yyyy}-${mm}-${dd}`);
}

/** Агрегаты для записи BankStatement из распарсенной выписки. */
function aggregatesFrom(parsed: ParsedStatement) {
  const rec = reconcile(parsed);
  return {
    rec,
    accountNumbers: parsed.accounts.map((a) => a.accountNumber).filter(Boolean),
    bankName: parsed.meta.sender,
    totalIn: rec.perAccount.reduce((s, p) => s + p.sumIn, 0),
    totalOut: rec.perAccount.reduce((s, p) => s + p.sumOut, 0),
    docCount: parsed.accounts.reduce((s, a) => s + a.operations.length, 0),
    openingBalance: parsed.accounts.reduce((s, a) => s + a.openingBalance, 0),
    closingBalance: parsed.accounts.reduce((s, a) => s + a.closingBalance, 0),
  };
}

export function mapBankError(err: unknown): { status: number; error: string } {
  if (err instanceof BankConfigError) return { status: 422, error: err.message };
  if (err instanceof BankApiError) return { status: 502, error: err.message };
  return { status: 500, error: "Internal server error" };
}

/** Собрать ссылку авторизации Сбера. Имена параметров — кандидат на правку на живом IFT. */
export function buildAuthorizeUrl(
  cfg: { authBaseUrl: string; clientId: string; redirectUri: string; scope: string },
  state: string,
): string {
  const qs = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: cfg.scope,
    state,
  });
  return `${cfg.authBaseUrl}/ic/sso/api/v2/oauth/authorize?${qs.toString()}`;
}

/** Собрать ссылку авторизации Альфы (Alfa ID OIDC). */
export function buildAlfaAuthorizeUrl(
  cfg: { authBaseUrl: string; clientId: string; redirectUri: string; scope: string },
  state: string,
): string {
  const params: Record<string, string> = {
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: cfg.scope,
    state,
  };
  // Для обычного ACF (B2B SaaS) — prompt=consent заставляет клиента явно
  // одобрить scope; иначе Альфа может вернуть insufficient_scope как 404.
  // Для H2H consent даётся один раз на 1800 дней — повторный prompt не
  // нужен и может сбить флоу. Включается через ALFA_PROMPT_CONSENT=1.
  if (process.env.ALFA_PROMPT_CONSENT === "1") params.prompt = "consent";
  return `${cfg.authBaseUrl}/oidc/authorize?${new URLSearchParams(params).toString()}`;
}

/**
 * Найти API-подключение организации в скоупе пользователя.
 * Если передан bankAccountId — берётся именно этот счёт (важно когда в орге
 * несколько подключённых банков). Иначе — первый по createdAt для детерминизма.
 */
async function getOrgConnection(orgId: string, user: AuthedUser, bankAccountId?: string) {
  const acc = await prisma.organizationBankAccount.findFirst({
    where: {
      organizationId: orgId,
      apiProvider: { not: null },
      ...(bankAccountId ? { id: bankAccountId } : {}),
      ...(isPrivileged(user.roles)
        ? {}
        : { organization: { section: { members: { some: { userId: user.userId } } } } }),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      apiProvider: true,
      apiToken: true,
      apiAccountId: true,
      accountNumber: true,
    },
  });
  return acc;
}

const fetchBodySchema = z.object({
  organizationId: z.string().min(1),
  bankAccountId: z.string().min(1).optional(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Резолв подключения + токена + опрос API банка → ParsedStatement. */
async function loadFetched(
  orgId: string,
  user: AuthedUser,
  start: string,
  end: string,
  bankAccountId?: string,
): Promise<{ parsed: ParsedStatement; apiProvider: string }> {
  const conn = await getOrgConnection(orgId, user, bankAccountId);
  if (!conn) throw new BankConfigError("API-доступ к банку не настроен для организации");
  if (!conn.accountNumber) {
    throw new BankConfigError("Не задан номер счёта банка");
  }
  const adapter = getAdapter(conn.apiProvider);
  if (!adapter) throw new BankConfigError("Провайдер банка не поддерживается");
  const credential = resolveToken(conn);
  const parsed = await adapter.fetchStatement({
    accountNumber: conn.accountNumber,
    accountId: conn.apiAccountId,
    start,
    end,
    credential,
    saveCredential: async (next: string) => {
      await prisma.organizationBankAccount.update({
        where: { id: conn.id },
        data: { apiToken: encrypt(next) },
      });
    },
  });
  return { parsed, apiProvider: conn.apiProvider! };
}

// Схема правок: клиент присылает счета с операциями; raw синхронизируется на сервере.
const opEditSchema = z.object({
  docType: z.string(),
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
  raw: z.record(z.string(), z.string()).default({}),
});
const accEditSchema = z.object({
  accountNumber: z.string(),
  openingBalance: z.coerce.number(),
  closingBalance: z.coerce.number(),
  totalIn: z.coerce.number().default(0),
  totalOut: z.coerce.number().default(0),
  hasClosing: z.boolean().default(true),
  raw: z.record(z.string(), z.string()).default({}),
  operations: z.array(opEditSchema),
});
const editSchema = z.object({ accounts: z.array(accEditSchema).min(1) });

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

      await syncStatementTransactions(record.id);

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

/**
 * Шаг 1 (API): забрать выписку из банка и сверить БЕЗ сохранения.
 * Возвращает сверку + признак уже существующей выгрузки за период.
 */
router.post(
  "/fetch/preview",
  authenticate,
  requirePermission("bank_statement", "create"),
  async (req: Request, res) => {
    try {
      const body = fetchBodySchema.safeParse(req.body);
      if (!body.success) {
        res.status(422).json({ error: "Некорректные параметры" });
        return;
      }
      if (!(await orgInScope(body.data.organizationId, req.user!))) {
        res.status(422).json({ error: "Организация не найдена или нет доступа" });
        return;
      }
      const { parsed } = await loadFetched(
        body.data.organizationId,
        req.user!,
        body.data.start,
        body.data.end,
        body.data.bankAccountId,
      );
      const existing = await prisma.bankStatement.findFirst({
        where: {
          organizationId: body.data.organizationId,
          // нормализуем к полуночи UTC, чтобы сравнение с @db.Date не плыло на границе суток
          periodStart: { lte: new Date(`${body.data.end}T00:00:00Z`) },
          periodEnd: { gte: new Date(`${body.data.start}T00:00:00Z`) },
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, docCount: true },
      });
      res.json({
        reconcile: reconcile(parsed),
        accountNumbers: parsed.accounts.map((a) => a.accountNumber).filter(Boolean),
        bankName: parsed.meta.sender,
        periodStart: parsed.meta.dateStart,
        periodEnd: parsed.meta.dateEnd,
        docCount: parsed.accounts.reduce((s, a) => s + a.operations.length, 0),
        existingForPeriod: existing
          ? { date: existing.createdAt, docCount: existing.docCount }
          : null,
      });
    } catch (err) {
      const m = mapBankError(err);
      if (m.status === 500) console.error("Statement fetch preview error:", err);
      res.status(m.status).json({ error: m.error });
    }
  },
);

/**
 * Шаг 2 (API): забрать выписку из банка и сохранить через канонический конвейер
 * (синтез 1С-файла → BankStatement → синк оборотов).
 */
router.post(
  "/fetch",
  authenticate,
  requirePermission("bank_statement", "create"),
  async (req: Request, res) => {
    try {
      const body = fetchBodySchema.safeParse(req.body);
      if (!body.success) {
        res.status(422).json({ error: "Некорректные параметры" });
        return;
      }
      if (!(await orgInScope(body.data.organizationId, req.user!))) {
        res.status(422).json({ error: "Организация не найдена или нет доступа" });
        return;
      }
      const { parsed, apiProvider } = await loadFetched(
        body.data.organizationId,
        req.user!,
        body.data.start,
        body.data.end,
        body.data.bankAccountId,
      );

      const buf = generate1c(parsed);
      const acc = parsed.accounts[0]?.accountNumber || "acc";
      const filename = `${apiProvider}_${acc}_${body.data.start}_${body.data.end}_${randomUUID()}.txt`;
      fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);

      const agg = aggregatesFrom(parsed);
      const record = await prisma.bankStatement.create({
        data: {
          organizationId: body.data.organizationId,
          uploadedById: req.user!.userId,
          bankName: agg.bankName,
          accountNumbers: agg.accountNumbers,
          periodStart: parseRuDate(parsed.meta.dateStart),
          periodEnd: parseRuDate(parsed.meta.dateEnd),
          openingBalance: new Prisma.Decimal(agg.openingBalance),
          closingBalance: new Prisma.Decimal(agg.closingBalance),
          totalIn: new Prisma.Decimal(agg.totalIn),
          totalOut: new Prisma.Decimal(agg.totalOut),
          docCount: agg.docCount,
          reconcileStatus: agg.rec.status,
          reconcileDiff: new Prisma.Decimal(agg.rec.totalDiff),
          originalName: `${agg.bankName || apiProvider} ${body.data.start}—${body.data.end}.txt`,
          originalPath: filename,
        },
        include: { organization: { select: { id: true, name: true } } },
      });

      await prisma.organizationBankAccount.updateMany({
        where: {
          organizationId: body.data.organizationId,
          apiProvider: { not: null },
          ...(body.data.bankAccountId ? { id: body.data.bankAccountId } : {}),
        },
        data: { lastFetchAt: new Date() },
      });

      await logAudit({
        action: "bank_statement_fetched",
        userId: req.user!.userId,
        entity: "bank_statement",
        entityId: record.id,
        details: {
          reconcile: agg.rec.status,
          organizationId: body.data.organizationId,
          period: `${body.data.start}..${body.data.end}`,
        },
      });

      await syncStatementTransactions(record.id);

      res.status(201).json({
        statement: record,
        reconcile: agg.rec,
        accounts: parsed.accounts.map((a) => ({
          accountNumber: a.accountNumber,
          openingBalance: a.openingBalance,
          closingBalance: a.closingBalance,
          operations: a.operations,
        })),
      });
    } catch (err) {
      const m = mapBankError(err);
      if (m.status === 500) console.error("Statement fetch error:", err);
      res.status(m.status).json({ error: m.error });
    }
  },
);

/** Старт OAuth-онбординга Сбера: вернуть ссылку авторизации для счёта в скоупе. */
router.get(
  "/sber/authorize-url",
  authenticate,
  requirePermission("bank_statement", "connect"),
  async (req: Request, res) => {
    try {
      const bankAccountId = (req.query.bankAccountId as string) || "";
      const acc = await prisma.organizationBankAccount.findFirst({
        where: {
          id: bankAccountId,
          apiProvider: "sber",
          // Сотрудники видят счёт через секцию, клиент — через членство в организации.
          ...(isPrivileged(req.user!.roles)
            ? {}
            : {
                organization: {
                  OR: [
                    { section: { members: { some: { userId: req.user!.userId } } } },
                    { members: { some: { userId: req.user!.userId } } },
                  ],
                },
              }),
        },
        select: { id: true },
      });
      if (!acc) {
        res.status(404).json({ error: "Счёт Сбера не найден или нет доступа" });
        return;
      }
      const cfg = getSberConfig();
      const state = signSberState({ bankAccountId: acc.id, userId: req.user!.userId });
      res.json({ url: buildAuthorizeUrl(cfg, state) });
    } catch (err) {
      const m = mapBankError(err);
      if (m.status === 500) console.error("Sber authorize-url error:", err);
      res.status(m.status).json({ error: m.error });
    }
  },
);

/** Публичный callback Сбера: обменять код на токены и сохранить refresh в счёт. */
router.get("/sber/callback", async (req: Request, res) => {
  const appUrl = process.env.APP_URL || "http://localhost:5173";
  const code = (req.query.code as string) || "";
  const stateRaw = (req.query.state as string) || "";

  let state;
  try {
    state = verifySberState(stateRaw);
  } catch {
    res.redirect(`${appUrl}/?sber=error`);
    return;
  }

  const acc = await prisma.organizationBankAccount.findFirst({
    where: { id: state.bankAccountId },
    select: { id: true, organizationId: true },
  });
  if (!acc) {
    res.redirect(`${appUrl}/?sber=error`);
    return;
  }

  try {
    if (!code) throw new BankApiError("Сбер не вернул код авторизации");
    const cfg = getSberConfig();
    const { refreshToken } = await exchangeAuthCode(code, cfg);
    await prisma.organizationBankAccount.update({
      where: { id: acc.id },
      data: { apiToken: encrypt(refreshToken) },
    });
    await logAudit({
      action: "sber_oauth_connected",
      userId: state.userId,
      entity: "bank_statement",
      entityId: acc.id,
      details: { organizationId: acc.organizationId },
    });
    res.redirect(`${appUrl}/organizations/${acc.organizationId}?sber=connected`);
  } catch (err) {
    console.error("Sber callback error:", err);
    res.redirect(`${appUrl}/organizations/${acc.organizationId}?sber=error`);
  }
});

/** Старт OAuth-онбординга Альфы: вернуть ссылку авторизации для счёта в скоупе. */
router.get(
  "/alfa/authorize-url",
  authenticate,
  requirePermission("bank_statement", "connect"),
  async (req: Request, res) => {
    try {
      const bankAccountId = (req.query.bankAccountId as string) || "";
      const acc = await prisma.organizationBankAccount.findFirst({
        where: {
          id: bankAccountId,
          apiProvider: "alfa",
          ...(isPrivileged(req.user!.roles)
            ? {}
            : {
                organization: {
                  OR: [
                    { section: { members: { some: { userId: req.user!.userId } } } },
                    { members: { some: { userId: req.user!.userId } } },
                  ],
                },
              }),
        },
        select: { id: true },
      });
      if (!acc) {
        res.status(404).json({ error: "Счёт Альфы не найден или нет доступа" });
        return;
      }
      const cfg = getAlfaConfig();
      const state = signAlfaState({ bankAccountId: acc.id, userId: req.user!.userId });
      res.json({ url: buildAlfaAuthorizeUrl(cfg, state) });
    } catch (err) {
      const m = mapBankError(err);
      if (m.status === 500) console.error("Alfa authorize-url error:", err);
      res.status(m.status).json({ error: m.error });
    }
  },
);

/** Публичный callback Альфы: обменять код на токены и сохранить refresh в счёт. */
router.get("/alfa/callback", async (req: Request, res) => {
  const appUrl = process.env.APP_URL || "http://localhost:5173";
  const code = (req.query.code as string) || "";
  const stateRaw = (req.query.state as string) || "";
  const oauthError = (req.query.error as string) || "";
  const oauthErrorDesc = (req.query.error_description as string) || "";

  // Альфа может прислать ?error=...&error_description=... вместо ?code=...
  // (отказ пользователя в consent, отозванный scope и т.п.).
  const fail = (reason: string, orgId?: string) => {
    const url = orgId
      ? `${appUrl}/organizations/${orgId}?alfa=error&reason=${encodeURIComponent(reason)}`
      : `${appUrl}/?alfa=error&reason=${encodeURIComponent(reason)}`;
    res.redirect(url);
  };

  let state;
  try {
    state = verifyAlfaState(stateRaw);
  } catch {
    console.error("Alfa callback: invalid state", { stateRaw });
    fail("Неверный или просроченный state");
    return;
  }

  const acc = await prisma.organizationBankAccount.findFirst({
    where: { id: state.bankAccountId },
    select: { id: true, organizationId: true },
  });
  if (!acc) {
    console.error("Alfa callback: bank account not found", state);
    fail("Счёт не найден");
    return;
  }

  if (oauthError) {
    console.error("Alfa callback: oauth error", { oauthError, oauthErrorDesc });
    fail(`${oauthError}: ${oauthErrorDesc || "без описания"}`, acc.organizationId);
    return;
  }

  try {
    if (!code) {
      console.error("Alfa callback: no code", req.query);
      throw new BankApiError("Альфа не вернула код авторизации");
    }
    const cfg = getAlfaConfig();
    const { refreshToken } = await exchangeAlfaCode(code, cfg);
    await prisma.organizationBankAccount.update({
      where: { id: acc.id },
      data: { apiToken: encrypt(refreshToken) },
    });
    await logAudit({
      action: "alfa_oauth_connected",
      userId: state.userId,
      entity: "bank_statement",
      entityId: acc.id,
      details: { organizationId: acc.organizationId },
    });
    res.redirect(`${appUrl}/organizations/${acc.organizationId}?alfa=connected`);
  } catch (err) {
    console.error("Alfa callback error:", err);
    const msg = err instanceof Error ? err.message : "Неизвестная ошибка";
    fail(msg, acc.organizationId);
  }
});

/**
 * Диагностика Альфа-выписки. Берёт refresh, обменивает на access, декодирует JWT
 * и пробует оба известных endpoint'а (v1 transactions JSON + v2 1C XML). Возвращает
 * сырой ответ, чтобы понять причину 404 без SSH в журнал.
 */
router.get(
  "/alfa/debug",
  authenticate,
  requirePermission("bank_statement", "connect"),
  async (req: Request, res) => {
    try {
      const bankAccountId = (req.query.bankAccountId as string) || "";
      const date = (req.query.date as string) || "2025-12-08";
      const acc = await prisma.organizationBankAccount.findFirst({
        where: {
          id: bankAccountId,
          apiProvider: "alfa",
          ...(isPrivileged(req.user!.roles)
            ? {}
            : {
                organization: {
                  OR: [
                    { section: { members: { some: { userId: req.user!.userId } } } },
                    { members: { some: { userId: req.user!.userId } } },
                  ],
                },
              }),
        },
        select: { id: true, accountNumber: true, apiToken: true },
      });
      if (!acc) {
        res.status(404).json({ error: "Счёт Альфы не найден или нет доступа" });
        return;
      }
      if (!acc.apiToken) {
        res.status(400).json({ error: "Счёт не подключён через OAuth — нет refresh-токена" });
        return;
      }
      const cfg = getAlfaConfig();
      const refresh = decrypt(acc.apiToken);
      const tokens = await refreshAlfaAccessToken(refresh, cfg);
      // Альфа ротирует refresh — старый сразу инвалидируется. Сохраняем новый,
      // иначе повторный клик «Диагностика» получит invalid_grant.
      if (tokens.refreshToken && tokens.refreshToken !== refresh) {
        await prisma.organizationBankAccount.update({
          where: { id: acc.id },
          data: { apiToken: encrypt(tokens.refreshToken) },
        });
      }

      // Декодируем JWT payload без проверки подписи.
      const jwtPart = tokens.accessToken.split(".")[1] || "";
      const pad = "=".repeat((4 - (jwtPart.length % 4)) % 4);
      let jwt: unknown = null;
      try {
        jwt = JSON.parse(
          Buffer.from(jwtPart.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString(),
        );
      } catch {
        jwt = "<failed to decode>";
      }

      const accountNumber = acc.accountNumber || "40702810102300000001";
      const endpoints = [
        {
          name: "v1 transactions (JSON)",
          url: `${cfg.apiBaseUrl}/jp/v1/statement/transactions?accountNumber=${accountNumber}&statementDate=${date}&page=1`,
          accept: "application/json",
        },
        {
          name: "v2 1C statement (XML)",
          url: `${cfg.apiBaseUrl}/jp/v2/accounts/${accountNumber}/transactions/1C?executeDate=${date}`,
          accept: "application/xml",
        },
      ];

      const results = [];
      for (const ep of endpoints) {
        const r = await fetch(ep.url, {
          method: "GET",
          headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: ep.accept },
          dispatcher: cfg.dispatcher,
        } as RequestInit).catch((e) => ({
          status: 0,
          headers: new Headers(),
          text: () => String(e),
        }));
        const headers: Record<string, string> = {};
        for (const [k, v] of (r as Response).headers.entries()) headers[k] = v;
        const body = await (r as Response).text();
        results.push({
          name: ep.name,
          url: ep.url,
          status: (r as Response).status,
          headers,
          body: body.slice(0, 4000),
          bodyTruncated: body.length > 4000,
        });
      }

      // Прямой вызов fetchDayTransactions — те же аргументы, что использует adapter.
      let directFetch: unknown = null;
      let directFetchError: string | null = null;
      try {
        const txs = await fetchAlfaDayTransactions(tokens.accessToken, accountNumber, date, cfg);
        directFetch = {
          count: txs.length,
          firstKeys: txs[0] ? Object.keys(txs[0]) : null,
          firstAmount: (txs[0] as { amount?: unknown })?.amount ?? null,
          firstDirection: (txs[0] as { direction?: unknown })?.direction ?? null,
        };
      } catch (e) {
        directFetchError = e instanceof Error ? e.message : String(e);
      }

      // Полный прогон через adapter — чтобы понять, теряет ли он операции.
      // Используем САМЫЙ свежий refresh (только что сохранён выше) и саму
      // прод-логику saveCredential, чтобы Альфа не отозвала токен.
      const freshRefresh =
        tokens.refreshToken && tokens.refreshToken !== refresh ? tokens.refreshToken : refresh;
      let adapterResult: unknown = null;
      let adapterError: string | null = null;
      try {
        const parsed = await alfaAdapter.fetchStatement({
          accountNumber,
          accountId: null,
          start: date,
          end: date,
          credential: freshRefresh,
          saveCredential: async (next: string) => {
            await prisma.organizationBankAccount.update({
              where: { id: acc.id },
              data: { apiToken: encrypt(next) },
            });
          },
        });
        adapterResult = {
          accounts: parsed.accounts.map((a) => ({
            accountNumber: a.accountNumber,
            operationsCount: a.operations.length,
            totalIn: a.totalIn,
            totalOut: a.totalOut,
            firstOp: a.operations[0] ?? null,
          })),
        };
      } catch (e) {
        adapterError = e instanceof Error ? e.message : String(e);
      }

      res.json({
        accountNumber,
        date,
        jwtPayload: jwt,
        endpoints: results,
        directFetch,
        directFetchError,
        adapter: adapterResult,
        adapterError,
      });
    } catch (err) {
      const m = mapBankError(err);
      if (m.status === 500) console.error("Alfa debug error:", err);
      res.status(m.status).json({ error: m.error });
    }
  },
);

/** Старт OAuth-онбординга Точки: получить consent + вернуть ссылку авторизации. */
router.get(
  "/tochka/authorize-url",
  authenticate,
  requirePermission("bank_statement", "connect"),
  async (req: Request, res) => {
    try {
      const bankAccountId = (req.query.bankAccountId as string) || "";
      const acc = await prisma.organizationBankAccount.findFirst({
        where: {
          id: bankAccountId,
          apiProvider: "tochka",
          ...(isPrivileged(req.user!.roles)
            ? {}
            : {
                organization: {
                  OR: [
                    { section: { members: { some: { userId: req.user!.userId } } } },
                    { members: { some: { userId: req.user!.userId } } },
                  ],
                },
              }),
        },
        select: { id: true },
      });
      if (!acc) {
        res.status(404).json({ error: "Счёт Точки не найден или нет доступа" });
        return;
      }
      const cfg = getTochkaOAuthConfig();
      const consentsToken = await getConsentsToken(cfg);
      const consentId = await createConsent(consentsToken, cfg);
      const state = signTochkaState({ bankAccountId: acc.id, userId: req.user!.userId });
      res.json({ url: buildTochkaAuthorizeUrl(cfg, consentId, state) });
    } catch (err) {
      const m = mapBankError(err);
      if (m.status === 500) console.error("Tochka authorize-url error:", err);
      res.status(m.status).json({ error: m.error });
    }
  },
);

/** Публичный callback Точки: обменять код на токены и сохранить refresh в счёт. */
router.get("/tochka/callback", async (req: Request, res) => {
  const appUrl = process.env.APP_URL || "http://localhost:5173";
  const code = (req.query.code as string) || "";
  const stateRaw = (req.query.state as string) || "";

  let state;
  try {
    state = verifyTochkaState(stateRaw);
  } catch {
    res.redirect(`${appUrl}/?tochka=error`);
    return;
  }

  const acc = await prisma.organizationBankAccount.findFirst({
    where: { id: state.bankAccountId },
    select: { id: true, organizationId: true, accountNumber: true },
  });
  if (!acc) {
    res.redirect(`${appUrl}/?tochka=error`);
    return;
  }

  try {
    if (!code) {
      console.error("Tochka callback query:", req.query);
      throw new BankApiError("Точка не вернула код авторизации");
    }
    const cfg = getTochkaOAuthConfig();
    const { accessToken, refreshToken } = await exchangeTochkaCode(code, cfg);

    // Резолвим внутренний accountId Точки по номеру счёта — без него
    // выписки вернут "Invalid accountId" на первом fetch.
    let apiAccountId: string | null = null;
    if (acc.accountNumber) {
      apiAccountId = await findTochkaAccountId(accessToken, acc.accountNumber);
      if (!apiAccountId) {
        console.warn(
          `[tochka] не нашёл accountId для счёта ${acc.accountNumber} (бух впишет вручную)`,
        );
      }
    }

    await prisma.organizationBankAccount.update({
      where: { id: acc.id },
      data: {
        apiToken: encrypt(refreshToken),
        ...(apiAccountId ? { apiAccountId } : {}),
      },
    });
    await logAudit({
      action: "tochka_oauth_connected",
      userId: state.userId,
      entity: "bank_statement",
      entityId: acc.id,
      details: { organizationId: acc.organizationId },
    });
    res.redirect(`${appUrl}/organizations/${acc.organizationId}?tochka=connected`);
  } catch (err) {
    console.error("Tochka callback error:", err);
    res.redirect(`${appUrl}/organizations/${acc.organizationId}?tochka=error`);
  }
});

export default router;
