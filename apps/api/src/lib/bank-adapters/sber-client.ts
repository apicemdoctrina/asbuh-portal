import { BankApiError } from "./types.js";
import type { SberConfig } from "./sber-mtls.js";
import { postOAuthToken, type OAuthTokens } from "./oauth-token.js";
import { generate1c } from "../statement-1c.js";
import type { ParsedStatement, ParsedOperation } from "../statement-types.js";

// fetch в Node принимает undici-`dispatcher` в рантайме, но его нет в типах RequestInit,
// поэтому добавляем поле и гасим excess-property-проверку приведением `as RequestInit`.
function sberFetch(
  baseUrl: string,
  cfg: SberConfig,
  path: string,
  init: RequestInit,
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { ...init, dispatcher: cfg.dispatcher } as RequestInit);
}

export type RefreshedTokens = OAuthTokens;

const SBER_TOKEN_PATH = "/ic/sso/api/v2/oauth/token";

/** Обновить access_token по refresh_token. mTLS + client credentials. */
export async function refreshAccessToken(
  refreshToken: string,
  cfg: SberConfig,
): Promise<RefreshedTokens> {
  // /authorize живёт на authBaseUrl (sbi.sberbank.ru), /token — на baseUrl (fintech.sberbank.ru).
  return postOAuthToken({
    url: `${cfg.baseUrl}${SBER_TOKEN_PATH}`,
    dispatcher: cfg.dispatcher,
    params: {
      grant_type: "refresh_token",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: refreshToken,
      scope: cfg.scope,
    },
    authRejectMessage: "Сбер отклонил авторизацию — переподключите счёт",
    apiErrorPrefix: "Сбер вернул ошибку авторизации",
    missingTokenMessage: "Сбер не вернул access_token",
  });
}

/** Обменять authorization code на токены. mTLS + client credentials. */
export async function exchangeAuthCode(code: string, cfg: SberConfig): Promise<RefreshedTokens> {
  return postOAuthToken({
    url: `${cfg.baseUrl}${SBER_TOKEN_PATH}`,
    dispatcher: cfg.dispatcher,
    params: {
      grant_type: "authorization_code",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: cfg.redirectUri,
    },
    authRejectMessage: "Сбер отклонил код авторизации",
    apiErrorPrefix: "Сбер вернул ошибку обмена кода",
    missingTokenMessage: "Сбер не вернул токены",
    expectRefresh: true,
  });
}

/**
 * Скачать дневную выписку счёта в формате 1С (windows-1251 байты) или null, если за день нет данных.
 *
 * ВНИМАНИЕ (не подтверждено живым стендом): точная форма ответа `/statement/files`
 * (синхронный файл vs task→link→download, поля `202`-ответа) у Сбера версионно-неоднозначна.
 * Реализация ниже — по докам, с дефолтом «непонятно → BankApiError, не 500». На первом прогоне
 * на IFT правим ТОЛЬКО эту функцию (контракт: (accessToken, accountNumber, YYYY-MM-DD) → Buffer|null).
 */
/**
 * Лог «пустого дня» — каждая ветка, где fetchDailyFile тихо отдаёт null. Включается
 * `DEBUG_SBER=1`. Нужно на IFT-прогоне, чтобы отличить «банк не вернул выписку за день»
 * от «вернул, но файл пустой» — без этого пустые выгрузки неотлаживаемы.
 */
function debugEmpty(accountNumber: string, dateISO: string, reason: string): void {
  if (!process.env.DEBUG_SBER) return;
  console.warn(`[sber] empty day acc=${accountNumber} date=${dateISO} reason=${reason}`);
}

/** "2026-05-28" → "28.05.2026" — формат даты для KL_TO_1C. */
function isoToRu(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
}

/** Безопасно вытащить число из {amount, currencyName} либо из строки/числа. */
function pickAmount(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v) || 0;
  if (v && typeof v === "object") {
    const a = (v as { amount?: unknown }).amount;
    if (typeof a === "string") return Number(a) || 0;
    if (typeof a === "number") return a;
  }
  return 0;
}

interface SberTxn {
  amount?: { amount?: string };
  amountRub?: { amount?: string };
  direction?: "CREDIT" | "DEBIT";
  documentDate?: string;
  number?: string;
  operationCode?: string;
  paymentPurpose?: string;
  rurTransfer?: {
    deliveryKind?: string;
    payeeAccount?: string;
    payeeBankBic?: string;
    payeeBankCorrAccount?: string;
    payeeBankName?: string;
    payeeInn?: string;
    payeeKpp?: string;
    payeeName?: string;
    payerAccount?: string;
    payerBankBic?: string;
    payerBankCorrAccount?: string;
    payerBankName?: string;
    payerInn?: string;
    payerKpp?: string;
    payerName?: string;
    receiptDate?: string;
    valueDate?: string;
  };
}

interface SberSummary {
  openingBalance?: unknown;
  closingBalance?: unknown;
  totalCredit?: unknown;
  totalDebit?: unknown;
  // Альтернативные имена, которые встречаются в разных версиях
  inflow?: unknown;
  outflow?: unknown;
  income?: unknown;
  expense?: unknown;
}

/** Преобразовать одну операцию Сбера в KL_TO_1C-документ. */
function toParsedOperation(tx: SberTxn): ParsedOperation {
  const isIn = tx.direction === "CREDIT";
  const r = tx.rurTransfer ?? {};
  const amount = pickAmount(tx.amount);
  const dateRu = tx.documentDate ? isoToRu(tx.documentDate) : "";
  const sumStr = amount.toFixed(2);

  const raw: Record<string, string> = {
    Номер: tx.number ?? "",
    Дата: dateRu,
    Сумма: sumStr,
  };
  if (r.payerAccount) {
    raw["ПлательщикСчет"] = r.payerAccount;
    raw["ПлательщикРасчСчет"] = r.payerAccount;
  }
  if (r.payerName) raw["Плательщик"] = r.payerName;
  if (r.payerInn) raw["ПлательщикИНН"] = r.payerInn;
  if (r.payerKpp) raw["ПлательщикКПП"] = r.payerKpp;
  if (r.payerBankName) raw["ПлательщикБанк1"] = r.payerBankName;
  if (r.payerBankBic) raw["ПлательщикБИК"] = r.payerBankBic;
  if (r.payerBankCorrAccount) raw["ПлательщикКорсчет"] = r.payerBankCorrAccount;
  if (r.payeeAccount) {
    raw["ПолучательСчет"] = r.payeeAccount;
    raw["ПолучательРасчСчет"] = r.payeeAccount;
  }
  if (r.payeeName) raw["Получатель"] = r.payeeName;
  if (r.payeeInn) raw["ПолучательИНН"] = r.payeeInn;
  if (r.payeeKpp) raw["ПолучательКПП"] = r.payeeKpp;
  if (r.payeeBankName) raw["ПолучательБанк1"] = r.payeeBankName;
  if (r.payeeBankBic) raw["ПолучательБИК"] = r.payeeBankBic;
  if (r.payeeBankCorrAccount) raw["ПолучательКорсчет"] = r.payeeBankCorrAccount;
  if (r.deliveryKind) raw["ВидПлатежа"] = r.deliveryKind;
  if (tx.operationCode) raw["ВидОплаты"] = tx.operationCode;
  if (isIn && r.receiptDate) raw["ДатаПоступило"] = isoToRu(r.receiptDate);
  if (!isIn && r.valueDate) raw["ДатаСписано"] = isoToRu(r.valueDate);
  if (tx.paymentPurpose) raw["НазначениеПлатежа"] = tx.paymentPurpose;

  return {
    docType: "Платежное поручение",
    number: tx.number ?? "",
    date: dateRu,
    amount,
    direction: isIn ? "in" : "out",
    payerName: r.payerName ?? null,
    payerInn: r.payerInn ?? null,
    payerAccount: r.payerAccount ?? null,
    payeeName: r.payeeName ?? null,
    payeeInn: r.payeeInn ?? null,
    payeeAccount: r.payeeAccount ?? null,
    purpose: tx.paymentPurpose ?? null,
    raw,
  };
}

/** Дёрнуть /v2/statement/summary; вернуть балансы (или нули, если не удалось). */
async function fetchSummary(
  accountNumber: string,
  dateISO: string,
  auth: Record<string, string>,
  cfg: SberConfig,
): Promise<{ opening: number; closing: number; totalIn: number; totalOut: number; ok: boolean }> {
  try {
    const url = `/fintech/api/v2/statement/summary?accountNumber=${accountNumber}&statementDate=${dateISO}`;
    const r = await sberFetch(cfg.baseUrl, cfg, url, { method: "GET", headers: auth });
    if (!r.ok) {
      if (process.env.DEBUG_SBER) {
        console.warn(`[sber] summary acc=${accountNumber} date=${dateISO} status=${r.status}`);
      }
      return { opening: 0, closing: 0, totalIn: 0, totalOut: 0, ok: false };
    }
    const body = (await r.json().catch(() => ({}))) as SberSummary;
    if (process.env.DEBUG_SBER) {
      console.warn(
        `[sber] summary acc=${accountNumber} date=${dateISO} body=${JSON.stringify(body).slice(0, 600)}`,
      );
    }
    return {
      opening: pickAmount(body.openingBalance),
      closing: pickAmount(body.closingBalance),
      totalIn: pickAmount(body.totalCredit ?? body.inflow ?? body.income),
      totalOut: pickAmount(body.totalDebit ?? body.outflow ?? body.expense),
      ok: true,
    };
  } catch (e) {
    if (process.env.DEBUG_SBER) {
      console.warn(
        `[sber] summary acc=${accountNumber} date=${dateISO} err=${(e as Error).message}`,
      );
    }
    return { opening: 0, closing: 0, totalIn: 0, totalOut: 0, ok: false };
  }
}

export async function fetchDailyFile(
  accessToken: string,
  accountNumber: string,
  dateISO: string,
  cfg: SberConfig,
): Promise<Buffer | null> {
  const auth = { Authorization: `Bearer ${accessToken}` };
  const dateRu = isoToRu(dateISO);

  // Шаг 1: операции дня через /v2/statement/transactions с пагинацией.
  // Требует scope GET_STATEMENT_ACCOUNT, который у нас есть в продуктовом
  // SCOPE_B2BSaaS_… (обходим невключённый сервис FILES).
  const transactions: SberTxn[] = [];
  for (let page = 1; page <= 50; page++) {
    const url = `/fintech/api/v2/statement/transactions?accountNumber=${accountNumber}&statementDate=${dateISO}&page=${page}`;
    const r = await sberFetch(cfg.baseUrl, cfg, url, { method: "GET", headers: auth });
    if (r.status === 401 || r.status === 403) {
      throw new BankApiError("Сбер отклонил токен при запросе операций");
    }
    if (r.status === 404) {
      debugEmpty(accountNumber, dateISO, "transactions:404");
      return null;
    }
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new BankApiError(
        `Сбер вернул ошибку операций ${r.status}${txt ? `: ${txt.slice(0, 200)}` : ""}`,
      );
    }
    const body = (await r.json().catch(() => null)) as {
      transactions?: SberTxn[];
      _links?: Array<{ rel?: string; href?: string }>;
    } | null;
    if (!body) throw new BankApiError("Сбер вернул пустой JSON в /v2/statement/transactions");
    const pageTx = body.transactions ?? [];
    if (process.env.DEBUG_SBER) {
      console.warn(
        `[sber] tx acc=${accountNumber} date=${dateISO} page=${page} count=${pageTx.length} links=${JSON.stringify(body._links ?? [])}`,
      );
    }
    transactions.push(...pageTx);
    // Если на странице меньше 100 операций или нет _links на след стр — стоп.
    const hasNext = (body._links ?? []).some((l) => l.rel === "next" || l.rel === "nextPage");
    if (!hasNext || pageTx.length === 0) break;
  }

  if (transactions.length === 0) {
    // За день нет операций; всё равно создаём пустую секцию с балансами,
    // чтобы пользователь видел подтверждение «банк проверен, операций нет».
    const summary = await fetchSummary(accountNumber, dateISO, auth, cfg);
    if (!summary.ok && summary.opening === 0 && summary.closing === 0) {
      debugEmpty(accountNumber, dateISO, "transactions:empty+nosummary");
      return null;
    }
  }

  // Шаг 2: балансы для секции счёта.
  const summary = await fetchSummary(accountNumber, dateISO, auth, cfg);

  // Шаг 3: построить ParsedStatement и собрать KL_TO_1C через generate1c.
  const ops = transactions.map(toParsedOperation);
  const sumIn = ops.filter((o) => o.direction === "in").reduce((s, o) => s + o.amount, 0);
  const sumOut = ops.filter((o) => o.direction === "out").reduce((s, o) => s + o.amount, 0);
  const opening = summary.opening;
  // Если summary не вернул closingBalance, посчитаем как opening + in − out.
  const closing = summary.ok ? summary.closing : opening + sumIn - sumOut;
  const totalIn = summary.totalIn || sumIn;
  const totalOut = summary.totalOut || sumOut;

  const parsed: ParsedStatement = {
    meta: {
      formatVersion: "1.03",
      encoding: "Windows",
      sender: "ПАО Сбербанк",
      dateStart: dateRu,
      dateEnd: dateRu,
      raw: {
        ВерсияФормата: "1.03",
        Кодировка: "Windows",
        Отправитель: "ПАО Сбербанк",
        ДатаНачала: dateRu,
        ДатаКонца: dateRu,
        РасчСчет: accountNumber,
      },
    },
    accounts: [
      {
        accountNumber,
        openingBalance: opening,
        totalIn,
        totalOut,
        closingBalance: closing,
        hasClosing: summary.ok,
        raw: {
          РасчСчет: accountNumber,
          ДатаНачала: dateRu,
          ДатаКонца: dateRu,
          НачальныйОстаток: opening.toFixed(2),
          ВсегоПоступило: totalIn.toFixed(2),
          ВсегоСписано: totalOut.toFixed(2),
          КонечныйОстаток: closing.toFixed(2),
        },
        operations: ops,
      },
    ],
  };

  return generate1c(parsed);
}
