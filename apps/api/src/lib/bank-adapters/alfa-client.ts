import { BankApiError } from "./types.js";
import type { AlfaConfig } from "./alfa-mtls.js";

function alfaFetch(
  baseUrl: string,
  cfg: AlfaConfig,
  path: string,
  init: RequestInit,
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { ...init, dispatcher: cfg.dispatcher } as RequestInit);
}

export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
}

/** Обменять authorization_code на пару токенов. mTLS обязателен. */
export async function exchangeAuthCode(code: string, cfg: AlfaConfig): Promise<RefreshedTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: cfg.redirectUri,
  });
  const res = await alfaFetch(cfg.tokenBaseUrl, cfg, "/oidc/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (res.status === 401 || res.status === 403) {
    throw new BankApiError("Альфа отклонила код авторизации");
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new BankApiError(`Альфа вернула ошибку обмена кода ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data?.access_token || !data?.refresh_token) {
    throw new BankApiError("Альфа не вернула токены");
  }
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
  };
}

/** Обновить access по refresh. Альфа может ротировать refresh — возвращаем то, что прислала. */
export async function refreshAccessToken(
  refreshToken: string,
  cfg: AlfaConfig,
): Promise<RefreshedTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
    scope: cfg.scope,
  });
  const res = await alfaFetch(cfg.tokenBaseUrl, cfg, "/oidc/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (res.status === 401 || res.status === 403) {
    throw new BankApiError("Альфа отклонила авторизацию — переподключите счёт");
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new BankApiError(`Альфа вернула ошибку refresh ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data?.access_token) throw new BankApiError("Альфа не вернула access_token");
  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string) || refreshToken,
  };
}

/** Сырой документ операции, как присылает Альфа (нас интересуют только нужные поля). */
export interface AlfaTransaction {
  amount?: number | string;
  amountRub?: number | string;
  direction?: "credit" | "debit" | "in" | "out" | string;
  operationDate?: string; // ISO или DD.MM.YYYY
  paymentPurpose?: string;
  rurTransfer?: {
    payerName?: string;
    payerInn?: string;
    payerAccount?: string;
    payeeName?: string;
    payeeInn?: string;
    payeeAccount?: string;
    documentNumber?: string;
  };
  [k: string]: unknown;
}

/**
 * Скачать все операции счёта за один день (с пагинацией).
 * statementDate — YYYY-MM-DD; за день может быть много страниц по 1000 шт.
 */
export async function fetchDayTransactions(
  accessToken: string,
  accountNumber: string,
  dateISO: string,
  cfg: AlfaConfig,
): Promise<AlfaTransaction[]> {
  const out: AlfaTransaction[] = [];
  let page = 1;
  while (page < 100) {
    const qs = new URLSearchParams({
      accountNumber,
      statementDate: dateISO,
      page: String(page),
    });
    const res = await alfaFetch(
      cfg.apiBaseUrl,
      cfg,
      `/api/jp/v1/statement/transactions?${qs.toString()}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      },
    );
    if (res.status === 401 || res.status === 403) {
      throw new BankApiError("Альфа отклонила токен при запросе выписки");
    }
    if (res.status === 404) return out; // за день нет операций
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new BankApiError(`Альфа вернула ошибку выписки ${res.status}: ${txt.slice(0, 200)}`);
    }
    const data = await res.json();
    const items = (data?.transactions ?? data?._embedded?.transactions ?? data?.data ?? []) as
      | AlfaTransaction[]
      | undefined;
    if (items && Array.isArray(items)) out.push(...items);
    // Пагинация: ищем next в _links.
    const links = data?._links;
    const hasNext = Array.isArray(links)
      ? links.some((l) => l?.rel === "next" || l?.href?.includes("page="))
      : !!links?.next;
    if (!hasNext || !items?.length) break;
    page++;
  }
  return out;
}
