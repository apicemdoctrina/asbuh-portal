/**
 * Ежедневный авто-fetch банковских выписок за прошлый день.
 *
 * Бежит каждый день в 07:00 UTC (= 09:00 GMT+2 / Калининград).
 * Берёт все OrganizationBankAccount с autoFetchEnabled=true, apiProvider и
 * accountNumber и refresh-токеном — для каждого тянет выписку за вчера
 * через тот же адаптерный пайплайн, что и ручной fetch.
 *
 * Аутентификация: используем admin-пользователя как uploadedById
 * (BankStatement.uploadedById обязателен, FK на User).
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "./prisma.js";
import { getAdapter, BankApiError, BankConfigError } from "./bank-adapters/index.js";
import { decrypt, encrypt } from "./crypto.js";
import { generate1c } from "./statement-1c.js";
import { reconcile } from "./statement-reconcile.js";
import { syncStatementTransactions } from "./org-finance.js";
import { logAudit } from "./audit.js";
import { UPLOADS_DIR } from "./upload.js";

/** YYYY-MM-DD для UTC-времени `t`. */
function isoDayUTC(t: Date): string {
  return t.toISOString().slice(0, 10);
}

/** DD.MM.YYYY → Date (полночь UTC); пустое → текущая дата. */
function parseRuDate(d: string | null): Date {
  if (!d) return new Date();
  const [day, month, year] = d.split(".");
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

/** Найти любого админа — нужен только uploadedById для BankStatement. */
async function findSystemUserId(): Promise<string | null> {
  const adminRole = await prisma.role.findUnique({ where: { name: "admin" } });
  if (!adminRole) return null;
  const ur = await prisma.userRole.findFirst({
    where: { roleId: adminRole.id },
    select: { userId: true },
  });
  return ur?.userId ?? null;
}

async function fetchOneAccount(
  acc: {
    id: string;
    organizationId: string;
    apiProvider: string | null;
    apiToken: string | null;
    apiAccountId: string | null;
    accountNumber: string | null;
  },
  uploadedById: string,
  dayISO: string,
): Promise<void> {
  if (!acc.apiProvider || !acc.apiToken || !acc.accountNumber) return;
  const adapter = getAdapter(acc.apiProvider);
  if (!adapter) return;
  const credential = decrypt(acc.apiToken);

  const parsed = await adapter.fetchStatement({
    accountNumber: acc.accountNumber,
    accountId: acc.apiAccountId,
    start: dayISO,
    end: dayISO,
    credential,
    saveCredential: async (next: string) => {
      await prisma.organizationBankAccount.update({
        where: { id: acc.id },
        data: { apiToken: encrypt(next) },
      });
    },
  });

  // Пустая выписка (за вчера операций не было) — не сохраняем, отметим lastFetchAt.
  const docCount = parsed.accounts.reduce((s, a) => s + a.operations.length, 0);
  if (docCount === 0) {
    await prisma.organizationBankAccount.update({
      where: { id: acc.id },
      data: { lastFetchAt: new Date() },
    });
    return;
  }

  const rec = reconcile(parsed);
  const accountNumbers = parsed.accounts.map((a) => a.accountNumber).filter(Boolean);
  const totalIn = rec.perAccount.reduce((s, p) => s + p.sumIn, 0);
  const totalOut = rec.perAccount.reduce((s, p) => s + p.sumOut, 0);
  const openingBalance = parsed.accounts.reduce((s, a) => s + a.openingBalance, 0);
  const closingBalance = parsed.accounts.reduce((s, a) => s + a.closingBalance, 0);

  const buf = generate1c(parsed);
  const filename = `auto_${acc.apiProvider}_${acc.accountNumber}_${dayISO}_${randomUUID()}.txt`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);

  const record = await prisma.bankStatement.create({
    data: {
      organizationId: acc.organizationId,
      uploadedById,
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
      originalName: `Авто ${acc.accountNumber} ${dayISO}.txt`,
      originalPath: filename,
    },
  });

  await prisma.organizationBankAccount.update({
    where: { id: acc.id },
    data: { lastFetchAt: new Date() },
  });

  await logAudit({
    action: "bank_statement_auto_fetched",
    userId: uploadedById,
    entity: "bank_statement",
    entityId: record.id,
    details: { bankAccountId: acc.id, day: dayISO, reconcile: rec.status },
  });

  await syncStatementTransactions(record.id);
}

async function runOnce(): Promise<void> {
  const uploadedById = await findSystemUserId();
  if (!uploadedById) {
    console.error("[auto-statement-fetch] нет admin-пользователя — пропускаем");
    return;
  }

  const yesterday = new Date(Date.now() - 86400000);
  const dayISO = isoDayUTC(yesterday);

  const accounts = await prisma.organizationBankAccount.findMany({
    where: {
      autoFetchEnabled: true,
      apiProvider: { not: null },
      apiToken: { not: null },
      accountNumber: { not: null },
    },
    select: {
      id: true,
      organizationId: true,
      apiProvider: true,
      apiToken: true,
      apiAccountId: true,
      accountNumber: true,
    },
  });

  if (accounts.length === 0) {
    console.log("[auto-statement-fetch] нет счетов с autoFetchEnabled");
    return;
  }
  console.log(`[auto-statement-fetch] ${accounts.length} счёт(ов) на авто-загрузку за ${dayISO}`);

  let ok = 0;
  let fail = 0;
  for (const acc of accounts) {
    try {
      await fetchOneAccount(acc, uploadedById, dayISO);
      ok++;
    } catch (err) {
      fail++;
      if (err instanceof BankConfigError || err instanceof BankApiError) {
        console.error(`[auto-statement-fetch] ${acc.id}: ${err.message}`);
      } else {
        console.error(`[auto-statement-fetch] ${acc.id}: unexpected`, err);
      }
    }
  }
  console.log(`[auto-statement-fetch] готово: ok=${ok} fail=${fail}`);
}

/**
 * Стартует таймер на ежедневный запуск в 07:00 UTC (= 09:00 GMT+2).
 * После каждого срабатывания планирует следующее.
 */
export function startAutoStatementFetcher(): void {
  function scheduleNext() {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(7, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    const ms = next.getTime() - now.getTime();

    setTimeout(async () => {
      try {
        await runOnce();
      } catch (err) {
        console.error("[auto-statement-fetch] фатальная ошибка:", err);
      }
      scheduleNext();
    }, ms);
  }
  scheduleNext();
  console.log("[auto-statement-fetch] запланировано: ежедневно 07:00 UTC (09:00 GMT+2)");
}
