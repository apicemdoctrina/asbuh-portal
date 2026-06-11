import prisma from "./prisma.js";
import { scheduleDailyAt } from "./scheduler.js";

/**
 * Интеграция с Точка Банк (Open Banking API): получение выписок,
 * импорт входящих платежей, авто-матчинг и ежедневный cron.
 * Вынесено из routes/payments.ts — роут не должен содержать cron и shared-логику.
 */

const TOCHKA_API_BASE = "https://enter.tochka.com/uapi/open-banking/v1.0";
export const TOCHKA_TOKEN = process.env.TOCHKA_JWT_TOKEN || "";

export async function tochkaFetch(path: string, opts?: RequestInit): Promise<Response> {
  return fetch(`${TOCHKA_API_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOCHKA_TOKEN}`,
      "Content-Type": "application/json",
      ...opts?.headers,
    },
  });
}

export interface TochkaTransaction {
  transactionId: string;
  paymentId?: string;
  creditDebitIndicator: "Credit" | "Debit";
  status: string;
  documentNumber?: string;
  documentProcessDate: string;
  description?: string;
  Amount: { amount: number; currency: string };
  DebtorParty?: { inn?: string; name?: string; kpp?: string };
  DebtorAccount?: { identification?: string };
  CreditorParty?: { inn?: string; name?: string; kpp?: string };
  CreditorAccount?: { identification?: string };
}

/** Create a statement request and poll until ready. Returns transactions array. */
export async function fetchTochkaTransactions(
  accountId: string,
  startDate: string,
  endDate: string,
): Promise<TochkaTransaction[]> {
  // 1. Create statement
  const createRes = await tochkaFetch("/statements", {
    method: "POST",
    body: JSON.stringify({
      Data: {
        Statement: {
          accountId,
          startDateTime: startDate,
          endDateTime: endDate,
        },
      },
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Tochka create statement error ${createRes.status}: ${err}`);
  }

  const createData = await createRes.json();
  const statementId = createData?.Data?.Statement?.statementId;
  if (!statementId) throw new Error("No statementId in response");

  // 2. Poll until Ready (max 60 seconds)
  const encodedAccId = encodeURIComponent(accountId);
  const pollPath = `/accounts/${encodedAccId}/statements/${statementId}`;

  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((r) => setTimeout(r, 3000));

    const pollRes = await tochkaFetch(pollPath);
    if (!pollRes.ok) continue;

    const pollData = await pollRes.json();
    const stmts = pollData?.Data?.Statement;
    if (!Array.isArray(stmts) || stmts.length === 0) continue;

    const stmt = stmts[0];
    if (stmt.status === "Error") throw new Error("Statement generation failed");
    if (stmt.status === "Ready" || stmt.status === "Complete") {
      return (stmt.Transaction || []) as TochkaTransaction[];
    }
  }

  throw new Error("Statement polling timed out");
}

/** Возвраты депозитов и проценты по ним — не выручка, отфильтровываем. */
export const DEPOSIT_KEYWORDS =
  /возврат.*депозит|депозит.*возврат|возврат.*размещ|размещ.*возврат|процент.*депозит|депозит.*процент|выплата.*процент.*по.*депозит|%.*депозит|депозитн/i;

/**
 * Импорт входящих (Credit, без депозитных) транзакций в БД.
 * Общий код ручного /sync и ежедневного cron'а.
 */
export async function importTochkaIncoming(
  accountId: string,
  allTx: TochkaTransaction[],
): Promise<{ imported: number; skipped: number; incoming: number; depositReturns: number }> {
  const incoming = allTx.filter(
    (tx) => tx.creditDebitIndicator === "Credit" && !DEPOSIT_KEYWORDS.test(tx.description || ""),
  );
  const allCredit = allTx.filter((tx) => tx.creditDebitIndicator === "Credit");
  const depositReturns = allCredit.length - incoming.length;

  let imported = 0;
  let skipped = 0;
  for (const tx of incoming) {
    const externalId = tx.transactionId;
    const exists = await prisma.bankTransaction.findUnique({ where: { externalId } });
    if (exists) {
      skipped++;
      continue;
    }

    await prisma.bankTransaction.create({
      data: {
        bankAccountId: accountId,
        externalId,
        date: new Date(tx.documentProcessDate),
        amount: Number(tx.Amount?.amount ?? 0),
        payerName: tx.DebtorParty?.name || null,
        payerInn: tx.DebtorParty?.inn || null,
        payerAccount: tx.DebtorAccount?.identification || null,
        purpose: tx.description || null,
        matchStatus: "UNMATCHED",
      },
    });
    imported++;
  }

  await prisma.bankAccount.update({
    where: { id: accountId },
    data: { lastSyncAt: new Date() },
  });

  return { imported, skipped, incoming: incoming.length, depositReturns };
}

/** Авто-матчинг UNMATCHED транзакций: по ИНН плательщика, затем по имени. */
export async function autoMatchTransactions(): Promise<number> {
  const unmatched = await prisma.bankTransaction.findMany({
    where: { matchStatus: "UNMATCHED" },
  });

  // Load all active organizations with INN
  const orgs = await prisma.organization.findMany({
    where: {
      status: { notIn: ["left", "closed", "ceased", "archived"] },
      paymentDestination: "BANK_TOCHKA",
    },
    select: { id: true, name: true, inn: true },
  });

  let matchedCount = 0;

  for (const tx of unmatched) {
    let orgId: string | null = null;

    // 1. Match by payer INN
    if (tx.payerInn) {
      const org = orgs.find((o) => o.inn === tx.payerInn);
      if (org) orgId = org.id;
    }

    // 2. Fallback: match by name in payer name or purpose
    if (!orgId) {
      const searchIn = `${tx.payerName || ""} ${tx.purpose || ""}`.toLowerCase();
      const org = orgs.find((o) => {
        if (!o.name) return false;
        // Clean org name for matching (remove quotes, legal form)
        const cleanName = o.name
          .replace(/[«»"']/g, "")
          .replace(/^(ООО|ИП|АО|ПАО|НКО)\s*/i, "")
          .trim()
          .toLowerCase();
        return cleanName.length >= 3 && searchIn.includes(cleanName);
      });
      if (org) orgId = org.id;
    }

    if (orgId) {
      await prisma.bankTransaction.update({
        where: { id: tx.id },
        data: {
          organizationId: orgId,
          matchStatus: "AUTO",
          matchedAt: new Date(),
          matchedBy: "auto",
        },
      });
      matchedCount++;
    }
  }

  return matchedCount;
}

// ─── Daily auto-sync cron ────────────────────────────────────────────────────

async function syncBankNow(): Promise<void> {
  if (!TOCHKA_TOKEN) {
    console.log("[bank-sync] TOCHKA_JWT_TOKEN not configured, skipping");
    return;
  }

  const account = await prisma.bankAccount.findFirst({ orderBy: { createdAt: "asc" } });
  if (!account) {
    console.log("[bank-sync] No bank account configured, skipping");
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const allTx = await fetchTochkaTransactions(account.accountNumber, weekAgo, today);
  const { imported } = await importTochkaIncoming(account.id, allTx);
  const matched = await autoMatchTransactions();

  console.log(`[bank-sync] Done: imported=${imported}, matched=${matched}`);
}

export function startBankAutoSync(): void {
  scheduleDailyAt("bank-sync", syncBankNow, 7, 0);
}
