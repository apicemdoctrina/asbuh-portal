import type { ParsedStatement, ParsedOperation } from "../statement-types.js";
import { decrypt } from "../crypto.js";
import { BankApiError, BankConfigError, type BankAdapter, type FetchOpts } from "./types.js";

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

/** Создать запрос выписки и опрашивать до Ready. Возвращает транзакции. */
async function fetchTransactions(
  token: string,
  accountId: string,
  start: string,
  end: string,
): Promise<TochkaTransaction[]> {
  const createRes = await tochkaApi(token, "/statements", {
    method: "POST",
    body: JSON.stringify({
      Data: { Statement: { accountId, startDateTime: start, endDateTime: end } },
    }),
  });
  if (createRes.status === 401 || createRes.status === 403) {
    throw new BankApiError("Банк отклонил токен — проверьте доступ");
  }
  if (!createRes.ok) throw new BankApiError(`Банк вернул ошибку ${createRes.status}`);

  const createData = await createRes.json();
  const statementId = createData?.Data?.Statement?.statementId;
  if (!statementId) throw new BankApiError("Банк не вернул идентификатор выписки");

  const pollPath = `/accounts/${encodeURIComponent(accountId)}/statements/${statementId}`;
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((r) => setTimeout(r, 3000));
    const pollRes = await tochkaApi(token, pollPath);
    if (!pollRes.ok) continue;
    const stmts = (await pollRes.json())?.Data?.Statement;
    if (!Array.isArray(stmts) || stmts.length === 0) continue;
    const stmt = stmts[0];
    if (stmt.status === "Error") throw new BankApiError("Банк не смог подготовить выписку");
    if (stmt.status === "Ready" || stmt.status === "Complete") {
      return (stmt.Transaction || []) as TochkaTransaction[];
    }
  }
  throw new BankApiError("Банк не успел подготовить выписку, попробуйте позже");
}

/**
 * Best-effort остаток счёта. Любая ошибка/неизвестная форма → null (выписка без сверки,
 * reconcile поставит "нет данных" вместо ложного MISMATCH).
 *
 * ВНИМАНИЕ: точные имена типов баланса Точки (`OpeningAvailable`/`ClosingAvailable`/…)
 * и путь `Data.Balance[]` НЕ подтверждены реальным ответом — `payments.ts` остатки не тянет.
 * При первом боевом запуске сверить с фактическим JSON `/balances` и поправить разбор.
 * Когда остаток не распарсился — пишем диагностический warn, чтобы это было видно в логах.
 */
async function fetchBalance(
  token: string,
  accountId: string,
): Promise<{ opening: number; closing: number } | null> {
  try {
    const res = await tochkaApi(token, `/accounts/${encodeURIComponent(accountId)}/balances`);
    if (!res.ok) {
      console.warn(`[tochka] balances HTTP ${res.status} — выписка будет без сверки`);
      return null;
    }
    const balances = (await res.json())?.Data?.Balance;
    if (!Array.isArray(balances)) {
      console.warn("[tochka] balances: неожиданная форма ответа — выписка без сверки");
      return null;
    }
    const opening = balances.find(
      (b) => b.type === "OpeningAvailable" || b.type === "OpeningBooked",
    );
    const closing = balances.find(
      (b) => b.type === "ClosingAvailable" || b.type === "ClosingBooked",
    );
    if (!opening || !closing) {
      console.warn("[tochka] balances: не найдены Opening/Closing — выписка без сверки");
      return null;
    }
    return {
      opening: Number(opening.Amount?.amount ?? 0),
      closing: Number(closing.Amount?.amount ?? 0),
    };
  } catch {
    return null;
  }
}

export const tochkaAdapter: BankAdapter = {
  provider: "tochka",
  async fetchStatement(opts: FetchOpts) {
    const [transactions, balance] = await Promise.all([
      fetchTransactions(opts.token, opts.accountId, opts.start, opts.end),
      fetchBalance(opts.token, opts.accountId),
    ]);
    return tochkaToParsedStatement({
      accountNumber: opts.accountNumber,
      start: opts.start,
      end: opts.end,
      transactions,
      balance,
    });
  },
};
