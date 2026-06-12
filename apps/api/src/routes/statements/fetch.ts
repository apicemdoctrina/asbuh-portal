import { Router } from "express";
import type { Request } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import prisma from "../../lib/prisma.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { logAudit } from "../../lib/audit.js";
import { reconcile } from "../../lib/statement-reconcile.js";
import { ingestStatement } from "../../lib/statement-ingest.js";
import { generate1c } from "../../lib/statement-1c.js";
import { getAdapter, resolveToken, BankConfigError } from "../../lib/bank-adapters/index.js";
import { encrypt } from "../../lib/crypto.js";
import type { ParsedStatement } from "../../lib/statement-types.js";
import { type AuthedUser, isPrivileged, orgInScope, mapBankError } from "./helpers.js";

const router = Router();

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

      const result = await ingestStatement({
        buffer: buf,
        originalName: `${parsed.meta.sender || apiProvider} ${body.data.start}—${body.data.end}.txt`,
        organizationId: body.data.organizationId,
        uploadedById: req.user!.userId,
        parsedHint: parsed,
        storedFilename: filename,
      });

      const record = await prisma.bankStatement.findUniqueOrThrow({
        where: { id: result.statementId },
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
          reconcile: result.reconcile.status,
          organizationId: body.data.organizationId,
          period: `${body.data.start}..${body.data.end}`,
        },
      });

      res.status(201).json({
        statement: record,
        reconcile: result.reconcile,
        accounts: result.parsed.accounts.map((a) => ({
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

export default router;
