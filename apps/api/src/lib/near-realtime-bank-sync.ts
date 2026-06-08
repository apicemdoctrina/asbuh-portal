/**
 * Near-realtime sync банковских выписок: запускается каждые 30 минут и
 * подтягивает свежие операции для всех счетов с autoFetchEnabled=true.
 *
 * Сбер — настоящий incremental через /v2/statement/increment с курсором
 * (lastSberSync на OrganizationBankAccount). Остальные банки — quasi-incremental:
 * дёргаем выписку за сегодня. Дедуп по opHash защищает от двойного учёта.
 *
 * Если за прогон не появилось ни одной новой операции — BankStatement не
 * создаём, чтобы не плодить пустые записи в списке выписок.
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "./prisma.js";
import { getAdapter, BankApiError, BankConfigError } from "./bank-adapters/index.js";
import { fetchSberIncrement } from "./bank-adapters/sber-client.js";
import { getSberConfig } from "./bank-adapters/sber-mtls.js";
import { refreshAccessToken } from "./bank-adapters/sber-client.js";
import { decrypt, encrypt } from "./crypto.js";
import { generate1c } from "./statement-1c.js";
import { reconcile } from "./statement-reconcile.js";
import { syncStatementTransactions } from "./org-finance.js";
import { opHash } from "./op-hash.js";
import { logAudit } from "./audit.js";
import { UPLOADS_DIR } from "./upload.js";
import type { ParsedStatement, ParsedOperation } from "./statement-types.js";

const INTERVAL_MS = 30 * 60 * 1000; // 30 минут

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoToRu(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
}

function parseRuDate(d: string | null): Date {
  if (!d) return new Date();
  const [day, month, year] = d.split(".");
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

async function findSystemUserId(): Promise<string | null> {
  const adminRole = await prisma.role.findUnique({ where: { name: "admin" } });
  if (!adminRole) return null;
  const ur = await prisma.userRole.findFirst({
    where: { roleId: adminRole.id },
    select: { userId: true },
  });
  return ur?.userId ?? null;
}

/** Построить ParsedStatement-обёртку для массива операций одного счёта на сегодня. */
function wrapOpsAsStatement(
  accountNumber: string,
  ops: ParsedOperation[],
  bankName: string,
): ParsedStatement {
  const dateRu = isoToRu(todayISO());
  return {
    meta: {
      formatVersion: "1.03",
      encoding: "Windows",
      sender: bankName,
      dateStart: dateRu,
      dateEnd: dateRu,
      raw: {
        ВерсияФормата: "1.03",
        Кодировка: "Windows",
        Отправитель: bankName,
        ДатаНачала: dateRu,
        ДатаКонца: dateRu,
        РасчСчет: accountNumber,
      },
    },
    accounts: [
      {
        accountNumber,
        openingBalance: 0,
        totalIn: ops.filter((o) => o.direction === "in").reduce((s, o) => s + o.amount, 0),
        totalOut: ops.filter((o) => o.direction === "out").reduce((s, o) => s + o.amount, 0),
        closingBalance: 0,
        hasClosing: false,
        raw: {
          РасчСчет: accountNumber,
          ДатаНачала: dateRu,
          ДатаКонца: dateRu,
        },
        operations: ops,
      },
    ],
  };
}

/** Отфильтровать операции, которые уже есть в БД по opHash. */
async function keepOnlyNovel(
  organizationId: string,
  accountNumber: string,
  ops: ParsedOperation[],
): Promise<ParsedOperation[]> {
  if (ops.length === 0) return [];
  const hashes = ops.map((op) =>
    opHash({
      accountNumber,
      date: op.date,
      amount: op.amount,
      direction: op.direction,
      number: op.number,
      purpose: op.purpose,
    }),
  );
  const existing = await prisma.statementTransaction.findMany({
    where: { organizationId, opHash: { in: hashes } },
    select: { opHash: true },
  });
  const seen = new Set(existing.map((e) => e.opHash));
  return ops.filter((_, i) => !seen.has(hashes[i]));
}

interface NRTAccount {
  id: string;
  organizationId: string;
  bankName: string;
  apiProvider: string | null;
  apiToken: string | null;
  apiAccountId: string | null;
  accountNumber: string | null;
  lastSberSync: Date | null;
}

async function saveNewOperationsAsStatement(
  acc: NRTAccount,
  ops: ParsedOperation[],
  uploadedById: string,
): Promise<void> {
  if (ops.length === 0) return;
  const parsed = wrapOpsAsStatement(acc.accountNumber!, ops, acc.bankName);
  const rec = reconcile(parsed);
  const totalIn = rec.perAccount.reduce((s, p) => s + p.sumIn, 0);
  const totalOut = rec.perAccount.reduce((s, p) => s + p.sumOut, 0);

  const buf = generate1c(parsed);
  const dayISO = todayISO();
  const filename = `nrt_${acc.apiProvider}_${acc.accountNumber}_${dayISO}_${randomUUID()}.txt`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);

  const record = await prisma.bankStatement.create({
    data: {
      organizationId: acc.organizationId,
      uploadedById,
      bankName: acc.bankName,
      accountNumbers: [acc.accountNumber!],
      periodStart: parseRuDate(parsed.meta.dateStart),
      periodEnd: parseRuDate(parsed.meta.dateEnd),
      openingBalance: new Prisma.Decimal(0),
      closingBalance: new Prisma.Decimal(0),
      totalIn: new Prisma.Decimal(totalIn),
      totalOut: new Prisma.Decimal(totalOut),
      docCount: ops.length,
      reconcileStatus: rec.status,
      reconcileDiff: new Prisma.Decimal(rec.totalDiff),
      originalName: `Свежее ${acc.bankName} ${dayISO} ${new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}.txt`,
      originalPath: filename,
    },
  });

  await syncStatementTransactions(record.id);

  await logAudit({
    action: "bank_statement_nrt_synced",
    userId: uploadedById,
    entity: "bank_statement",
    entityId: record.id,
    details: { bankAccountId: acc.id, day: dayISO, novelOps: ops.length },
  });
}

async function syncSberIncrement(acc: NRTAccount, uploadedById: string): Promise<void> {
  if (!acc.apiToken || !acc.accountNumber) return;
  const cfg = getSberConfig();
  const refreshTokenStored = decrypt(acc.apiToken);
  const { accessToken, refreshToken } = await refreshAccessToken(refreshTokenStored, cfg);
  if (refreshToken !== refreshTokenStored) {
    await prisma.organizationBankAccount.update({
      where: { id: acc.id },
      data: { apiToken: encrypt(refreshToken) },
    });
  }

  const ops = await fetchSberIncrement(accessToken, acc.accountNumber, acc.lastSberSync, cfg);
  const novel = await keepOnlyNovel(acc.organizationId, acc.accountNumber, ops);

  await saveNewOperationsAsStatement(acc, novel, uploadedById);

  await prisma.organizationBankAccount.update({
    where: { id: acc.id },
    data: { lastSberSync: new Date() },
  });
}

async function syncQuasiIncrement(acc: NRTAccount, uploadedById: string): Promise<void> {
  if (!acc.apiToken || !acc.accountNumber || !acc.apiProvider) return;
  const adapter = getAdapter(acc.apiProvider);
  if (!adapter) return;

  const credential = decrypt(acc.apiToken);
  const dayISO = todayISO();

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

  const allOps = parsed.accounts.flatMap((a) => a.operations);
  const novel = await keepOnlyNovel(acc.organizationId, acc.accountNumber, allOps);
  await saveNewOperationsAsStatement(acc, novel, uploadedById);
}

async function runOnce(): Promise<void> {
  const uploadedById = await findSystemUserId();
  if (!uploadedById) {
    console.error("[nrt-sync] нет admin-пользователя — пропускаем");
    return;
  }

  const accounts = (await prisma.organizationBankAccount.findMany({
    where: {
      autoFetchEnabled: true,
      apiProvider: { not: null },
      apiToken: { not: null },
      accountNumber: { not: null },
    },
    select: {
      id: true,
      organizationId: true,
      bankName: true,
      apiProvider: true,
      apiToken: true,
      apiAccountId: true,
      accountNumber: true,
      lastSberSync: true,
    },
  })) as NRTAccount[];

  if (accounts.length === 0) return;

  let ok = 0;
  let fail = 0;
  for (const acc of accounts) {
    try {
      if (acc.apiProvider === "sber") {
        await syncSberIncrement(acc, uploadedById);
      } else {
        await syncQuasiIncrement(acc, uploadedById);
      }
      ok++;
    } catch (err) {
      fail++;
      if (err instanceof BankConfigError || err instanceof BankApiError) {
        console.error(`[nrt-sync] ${acc.id} (${acc.apiProvider}): ${err.message}`);
      } else {
        console.error(`[nrt-sync] ${acc.id} (${acc.apiProvider}): unexpected`, err);
      }
    }
  }
  if (ok || fail) console.log(`[nrt-sync] прогон: ok=${ok} fail=${fail} (из ${accounts.length})`);
}

/**
 * Стартует таймер на каждые 30 минут. Первый прогон — через 30 мин после старта
 * сервиса (чтобы не дублировать ежедневный 09:00 GMT+2, если он только что отработал).
 */
export function startNearRealtimeBankSync(): void {
  setInterval(() => {
    runOnce().catch((err) => console.error("[nrt-sync] фатальная ошибка:", err));
  }, INTERVAL_MS);
  console.log(`[nrt-sync] запланировано: каждые ${INTERVAL_MS / 60_000} минут`);
}
