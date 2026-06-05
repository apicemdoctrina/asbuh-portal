/**
 * OAuth 2.0 для Точка-Банка (без mTLS).
 *
 * Алгоритм:
 *   1. getConsentsToken() — client_credentials → Bearer на 24ч
 *   2. createConsent(consentsToken, perms) → consentId
 *   3. buildAuthorizeUrl(consentId, state) — пользователь редиректится в Точку
 *   4. exchangeAuthCode(code) → { access, refresh } (access 24ч, refresh 30 дней)
 *   5. refreshAccessToken(refresh) → новые токены
 */

import { BankApiError, BankConfigError } from "./types.js";

const TOCHKA_AUTH_BASE = "https://enter.tochka.com";

export interface TochkaOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Минимальный набор разрешений для чтения выписки. */
  permissions: string[];
  /** Scope для client_credentials/refresh — фиксированный набор операций. */
  scope: string;
}

export function getTochkaOAuthConfig(): TochkaOAuthConfig {
  const clientId = process.env.TOCHKA_CLIENT_ID || "";
  const clientSecret = process.env.TOCHKA_CLIENT_SECRET || "";
  const redirectUri = process.env.TOCHKA_REDIRECT_URI || "";
  if (!clientId || !clientSecret || !redirectUri) {
    throw new BankConfigError(
      "Точка OAuth не сконфигурирована (TOCHKA_CLIENT_ID/SECRET/REDIRECT_URI)",
    );
  }
  return {
    clientId,
    clientSecret,
    redirectUri,
    // ReadStatements даёт метаданные выписки, но без операций; для самих
    // транзакций нужны Transactions* (Basic + Detail + Credits + Debits),
    // иначе Точка молча отдаёт docCount=0.
    permissions: [
      "ReadAccountsBasic",
      "ReadAccountsDetail",
      "ReadBalances",
      "ReadStatements",
      "ReadTransactionsBasic",
      "ReadTransactionsDetail",
      "ReadTransactionsCredits",
      "ReadTransactionsDebits",
    ],
    scope: "accounts balances statements",
  };
}

export interface TochkaTokens {
  accessToken: string;
  refreshToken: string;
}

/** Получить «партнёрский» bearer для создания consent. */
export async function getConsentsToken(cfg: TochkaOAuthConfig): Promise<string> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "client_credentials",
    scope: cfg.scope,
  });
  const res = await fetch(`${TOCHKA_AUTH_BASE}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new BankApiError(
      `Точка вернула ошибку consents_token ${res.status}: ${txt.slice(0, 200)}`,
    );
  }
  const data = await res.json();
  if (!data?.access_token) throw new BankApiError("Точка не вернула consents_token");
  return data.access_token as string;
}

/** Создать consent — список разрешений, которые клиент подтвердит. */
export async function createConsent(
  consentsToken: string,
  cfg: TochkaOAuthConfig,
): Promise<string> {
  const expirationDateTime = new Date(Date.now() + 365 * 86400_000).toISOString();
  const res = await fetch(`${TOCHKA_AUTH_BASE}/uapi/v1.0/consents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${consentsToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      Data: { permissions: cfg.permissions, expirationDateTime },
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new BankApiError(`Точка вернула ошибку consent ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const consentId = data?.Data?.consentId || data?.Data?.ConsentId || data?.consentId;
  if (!consentId) throw new BankApiError("Точка не вернула consentId");
  return consentId as string;
}

/** Ссылка для редиректа пользователя в Точку для подтверждения. */
export function buildTochkaAuthorizeUrl(
  cfg: TochkaOAuthConfig,
  consentId: string,
  state: string,
): string {
  const qs = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: cfg.redirectUri,
    scope: cfg.scope,
    state,
    consent_id: consentId,
  });
  return `${TOCHKA_AUTH_BASE}/connect/authorize?${qs.toString()}`;
}

/** Обменять authorization_code на access + refresh. */
export async function exchangeAuthCode(
  code: string,
  cfg: TochkaOAuthConfig,
): Promise<TochkaTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: cfg.redirectUri,
  });
  const res = await fetch(`${TOCHKA_AUTH_BASE}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (res.status === 401 || res.status === 403) {
    throw new BankApiError("Точка отклонила код авторизации");
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new BankApiError(`Точка вернула ошибку обмена кода ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data?.access_token || !data?.refresh_token) {
    throw new BankApiError("Точка не вернула токены");
  }
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
  };
}

/**
 * Найти внутренний `accountId` Точки по номеру расчётного счёта (20 цифр).
 * Точка использует свой UUID-подобный accountId, а не сам номер счёта; его
 * нужно сохранять в `apiAccountId` и передавать во все API-вызовы.
 *
 * Возвращает первый матч по Identification, или null если не нашли.
 */
export async function findAccountIdByNumber(
  accessToken: string,
  accountNumber: string,
): Promise<string | null> {
  const res = await fetch(`${TOCHKA_AUTH_BASE}/uapi/open-banking/v1.0/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    console.warn(`[tochka] GET /accounts вернул ${res.status}`);
    return null;
  }
  const data = await res.json();
  const accounts = (data?.Data?.Account ?? []) as Array<Record<string, unknown>>;

  // Точка кладёт номер счёта в разные поля в зависимости от версии. Проверяем
  // все известные варианты + ищем 20-значное совпадение в любом строковом поле
  // первого уровня. Также — массив Identification[].identification (Open Banking).
  function digitsOnly(v: unknown): string {
    return typeof v === "string" ? v.replace(/\D/g, "") : "";
  }

  for (const a of accounts) {
    const candidates: string[] = [];
    candidates.push(digitsOnly(a.Identification));
    candidates.push(digitsOnly(a.identification));
    candidates.push(digitsOnly(a.accountNumber));
    candidates.push(digitsOnly(a.AccountNumber));
    // У Точки сам accountId часто имеет вид "<20 цифр>/<БИК>" — первые 20 цифр это номер счёта.
    const aid = typeof a.accountId === "string" ? a.accountId : "";
    if (aid) candidates.push(aid.split("/")[0]);
    // accountDetails[].identification (Open Banking; Точка использует RU.CBR.AccountNumber).
    const details = a.accountDetails as Array<{ identification?: unknown }> | undefined;
    if (Array.isArray(details)) {
      for (const d of details) {
        const id = typeof d?.identification === "string" ? d.identification : "";
        if (id) candidates.push(id.split("/")[0]);
      }
    }
    // Account.Account[].Identification (массив, старый Open Banking).
    const acctArr = a.Account as Array<{ Identification?: unknown }> | undefined;
    if (Array.isArray(acctArr)) {
      for (const x of acctArr) candidates.push(digitsOnly(x?.Identification));
    }
    if (candidates.some((c) => c === accountNumber)) {
      return (a.accountId ?? a.AccountId ?? a.id) as string;
    }
  }

  console.warn(
    `[tochka] /accounts: не нашёл ${accountNumber}. Полученные счета: ${JSON.stringify(
      accounts.slice(0, 3),
    ).slice(0, 500)}`,
  );
  return null;
}

/** Обновить access по refresh. Точка ротирует refresh. */
export async function refreshAccessToken(
  refreshToken: string,
  cfg: TochkaOAuthConfig,
): Promise<TochkaTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
  });
  const res = await fetch(`${TOCHKA_AUTH_BASE}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (res.status === 401 || res.status === 403) {
    throw new BankApiError("Точка отклонила refresh — переподключите счёт");
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new BankApiError(`Точка вернула ошибку refresh ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data?.access_token) throw new BankApiError("Точка не вернула access_token");
  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string) || refreshToken,
  };
}
