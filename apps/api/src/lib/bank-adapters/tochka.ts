import type { ParsedStatement, ParsedOperation } from "../statement-types.js";
import { decrypt } from "../crypto.js";
import { BankApiError, BankConfigError, type BankAdapter, type FetchContext } from "./types.js";
import { getTochkaOAuthConfig, refreshAccessToken } from "./tochka-oauth.js";

const TOCHKA_API_BASE = "https://enter.tochka.com/uapi/open-banking/v1.0";

export interface TochkaTransaction {
  transactionId: string;
  creditDebitIndicator: "Credit" | "Debit";
  documentNumber?: string;
  documentProcessDate: string; // ISO (YYYY-MM-DD[...])
  description?: string;
  Amount: { amount: number; currency: string };
  DebtorParty?: { inn?: string; name?: string };
  DebtorAccount?: { identification?: string };
  CreditorParty?: { inn?: string; name?: string };
  CreditorAccount?: { identification?: string };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** ISO YYYY-MM-DD[...] → DD.MM.YYYY. */
function isoToRu(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/** Записывает в raw только непустые значения. */
function put(raw: Record<string, string>, key: string, val: string | null | undefined) {
  if (val) raw[key] = val;
}

function buildOperation(tx: TochkaTransaction, accountNumber: string): ParsedOperation {
  const isIn = tx.creditDebitIndicator === "Credit";
  const amount = round2(tx.Amount?.amount ?? 0);
  const date = isoToRu(tx.documentProcessDate);
  const number = tx.documentNumber || tx.transactionId;
  const purpose = tx.description || null;

  // Входящий: наш счёт — получатель; контрагент — плательщик (DebtorParty).
  // Исходящий: наш счёт — плательщик; контрагент — получатель (CreditorParty).
  //
  // ВАЖНО (round-trip): parseStatement определяет направление по равенству
  // ПлательщикСчет/ПолучательСчет нашему счёту. Если счёт контрагента СОВПАДАЕТ
  // с нашим (перевод между своими счетами в том же банке), после round-trip обе
  // стороны = наш счёт, и парсер не сможет однозначно определить направление.
  // Поэтому счёт контрагента, равный нашему, обнуляем — направление остаётся
  // закреплённым за нашей стороной (payee для in, payer для out).
  const blankIfOurs = (acc: string | undefined | null) =>
    acc && acc !== accountNumber ? acc : null;

  const payerName = isIn ? (tx.DebtorParty?.name ?? null) : null;
  const payerInn = isIn ? (tx.DebtorParty?.inn ?? null) : null;
  const payerAccount = isIn ? blankIfOurs(tx.DebtorAccount?.identification) : accountNumber;
  const payeeName = isIn ? null : (tx.CreditorParty?.name ?? null);
  const payeeInn = isIn ? null : (tx.CreditorParty?.inn ?? null);
  const payeeAccount = isIn ? accountNumber : blankIfOurs(tx.CreditorAccount?.identification);

  const raw: Record<string, string> = {};
  put(raw, "Номер", number);
  put(raw, "Дата", date);
  put(raw, "Сумма", amount.toFixed(2));
  put(raw, "ПлательщикСчет", payerAccount);
  put(raw, "Плательщик", payerName);
  put(raw, "ПлательщикИНН", payerInn);
  put(raw, "ПолучательСчет", payeeAccount);
  put(raw, "Получатель", payeeName);
  put(raw, "ПолучательИНН", payeeInn);
  put(raw, "НазначениеПлатежа", purpose ?? undefined);

  return {
    docType: "03",
    number,
    date,
    amount,
    direction: isIn ? "in" : "out",
    payerName,
    payerInn,
    payerAccount,
    payeeName,
    payeeInn,
    payeeAccount,
    purpose,
    raw,
  };
}

/** Чистый маппинг ответа Точки → канонический ParsedStatement. */
export function tochkaToParsedStatement(input: {
  accountNumber: string;
  start: string; // YYYY-MM-DD
  end: string;
  transactions: TochkaTransaction[];
  balance: { opening: number; closing: number } | null;
}): ParsedStatement {
  const { accountNumber, start, end, transactions, balance } = input;
  const operations = transactions.map((tx) => buildOperation(tx, accountNumber));

  const accRaw: Record<string, string> = {};
  put(accRaw, "РасчСчет", accountNumber);
  put(accRaw, "ДатаНачала", isoToRu(start));
  put(accRaw, "ДатаКонца", isoToRu(end));
  put(accRaw, "НачальныйОстаток", (balance?.opening ?? 0).toFixed(2));
  if (balance) put(accRaw, "КонечныйОстаток", balance.closing.toFixed(2));

  const headerRaw: Record<string, string> = {};
  put(headerRaw, "ВерсияФормата", "1.03");
  put(headerRaw, "Кодировка", "Windows");
  put(headerRaw, "Отправитель", "Точка");
  put(headerRaw, "ДатаНачала", isoToRu(start));
  put(headerRaw, "ДатаКонца", isoToRu(end));
  put(headerRaw, "РасчСчет", accountNumber);

  return {
    meta: {
      formatVersion: "1.03",
      encoding: "win1251",
      sender: "Точка",
      dateStart: isoToRu(start),
      dateEnd: isoToRu(end),
      raw: headerRaw,
    },
    accounts: [
      {
        accountNumber,
        openingBalance: balance?.opening ?? 0,
        totalIn: 0,
        totalOut: 0,
        closingBalance: balance?.closing ?? 0,
        hasClosing: balance !== null,
        raw: accRaw,
        operations,
      },
    ],
  };
}

export function resolveToken(account: {
  usePartnerToken: boolean;
  apiToken: string | null;
}): string {
  if (account.usePartnerToken) {
    const t = process.env.TOCHKA_JWT_TOKEN || "";
    if (!t) throw new BankConfigError("Партнёрский токен банка не настроен");
    return t;
  }
  if (!account.apiToken) throw new BankConfigError("API-токен банка не настроен для организации");
  return decrypt(account.apiToken);
}

async function tochkaApi(token: string, path: string, opts?: RequestInit): Promise<Response> {
  return fetch(`${TOCHKA_API_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...opts?.headers,
    },
  });
}

interface TochkaStatementData {
  transactions: TochkaTransaction[];
  // Остатки за период берём из самой выписки (startDateBalance/endDateBalance),
  // а НЕ из эндпоинта /balances — тот отдаёт текущий снимок «на сейчас», не за период.
  balance: { opening: number; closing: number } | null;
}

/**
 * Создать выписку через POST /statements, опросить до Ready, и вытащить
 * транзакции из отдельного endpoint'а /statements/{id}/transactions
 * (внутри metadata stmt.Transaction всегда пуст по Open Banking-спеке).
 */
async function fetchStatementData(
  token: string,
  accountId: string,
  start: string,
  end: string,
): Promise<TochkaStatementData> {
  const createRes = await tochkaApi(token, "/statements", {
    method: "POST",
    body: JSON.stringify({
      Data: { Statement: { accountId, startDateTime: start, endDateTime: end } },
    }),
  });
  if (createRes.status === 401 || createRes.status === 403) {
    throw new BankApiError("Банк отклонил токен — проверьте доступ");
  }
  if (!createRes.ok) {
    const txt = await createRes.text().catch(() => "");
    console.error(`[tochka] POST /statements ${createRes.status}:`, txt.slice(0, 300));
    throw new BankApiError(`Банк вернул ошибку ${createRes.status}`);
  }

  const createData = await createRes.json();
  const statementId = createData?.Data?.Statement?.statementId;
  if (!statementId) throw new BankApiError("Банк не вернул идентификатор выписки");

  const accPath = `/accounts/${encodeURIComponent(accountId)}/statements/${statementId}`;
  let balance: TochkaStatementData["balance"] = null;
  let inlineTx: TochkaTransaction[] = [];

  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((r) => setTimeout(r, 3000));
    const pollRes = await tochkaApi(token, accPath);
    if (!pollRes.ok) continue;
    const stmts = (await pollRes.json())?.Data?.Statement;
    if (!Array.isArray(stmts) || stmts.length === 0) continue;
    const stmt = stmts[0];
    if (stmt.status === "Error") throw new BankApiError("Банк не смог подготовить выписку");
    if (stmt.status !== "Ready" && stmt.status !== "Complete") continue;

    const opening = stmt.startDateBalance;
    const closing = stmt.endDateBalance;
    balance =
      typeof opening === "number" && typeof closing === "number" ? { opening, closing } : null;
    inlineTx = (stmt.Transaction || []) as TochkaTransaction[];
    break;
  }

  // Транзакции лежат в отдельном endpoint'е /statements/{id}/transactions.
  // Если по какой-то причине endpoint не отвечает — берём inline (обычно пуст).
  let transactions: TochkaTransaction[] = inlineTx;
  try {
    const txRes = await tochkaApi(token, `${accPath}/transactions`);
    if (txRes.ok) {
      const txData = await txRes.json();
      const list = (txData?.Data?.Transaction ??
        txData?.Data?.Transactions ??
        []) as TochkaTransaction[];
      if (Array.isArray(list) && list.length > 0) transactions = list;
    } else if (txRes.status !== 404) {
      const txt = await txRes.text().catch(() => "");
      console.warn(`[tochka] /transactions ${txRes.status}:`, txt.slice(0, 200));
    }
  } catch (err) {
    console.warn("[tochka] /transactions упал:", err);
  }

  console.log(
    `[tochka] statement=${statementId} inline=${inlineTx.length} used=${transactions.length}`,
  );
  return { transactions, balance };
}

/**
 * Возвращает access-token для запроса в API Точки.
 *
 * Логика выбора:
 * - Партнёрский режим (`usePartnerToken=true`) или сценарий, когда credential уже
 *   является валидным access-токеном (старый ручной ввод JWT) — возвращаем как есть.
 * - Иначе credential — это OAuth refresh-token (сценарий «Подключить Точку»):
 *   меняем на свежий access, ротированный refresh сохраняем обратно в счёт.
 *
 * Эвристика «refresh или access» применяется так: пробуем refresh; если 401/403 —
 * значит credential уже access-токен старого формата, возвращаем его как есть для
 * обратной совместимости.
 */
async function resolveAccessToken(ctx: FetchContext): Promise<string> {
  // Старый партнёрский режим: TOCHKA_JWT_TOKEN — это уже Bearer.
  // FetchContext не знает про usePartnerToken, поэтому полагаемся на то, что
  // partner-токен в credential приходит готовый (см. resolveToken выше).
  // Чтобы отличить refresh от access-токена, пробуем refresh; при провале
  // считаем credential готовым access.
  try {
    const cfg = getTochkaOAuthConfig();
    const { accessToken, refreshToken } = await refreshAccessToken(ctx.credential, cfg);
    if (refreshToken && refreshToken !== ctx.credential) {
      await ctx.saveCredential(refreshToken);
    }
    return accessToken;
  } catch (err) {
    if (err instanceof BankConfigError) {
      // OAuth не настроен — credential должен быть готовым Bearer (партнёр/ручной).
      return ctx.credential;
    }
    if (err instanceof BankApiError && /отклонила refresh|invalid_grant/i.test(err.message)) {
      // Не refresh — пробуем как готовый access-токен (легаси-режим).
      return ctx.credential;
    }
    throw err;
  }
}

export const tochkaAdapter: BankAdapter = {
  provider: "tochka",
  async fetchStatement(ctx: FetchContext) {
    const accountId = ctx.accountId || ctx.accountNumber;
    const accessToken = await resolveAccessToken(ctx);
    const { transactions, balance } = await fetchStatementData(
      accessToken,
      accountId,
      ctx.start,
      ctx.end,
    );
    return tochkaToParsedStatement({
      accountNumber: ctx.accountNumber,
      start: ctx.start,
      end: ctx.end,
      transactions,
      balance,
    });
  },
};
