import { BankApiError } from "./types.js";
import type { AlfaConfig } from "./alfa-mtls.js";
import { postOAuthToken, type OAuthTokens } from "./oauth-token.js";

function alfaFetch(
  baseUrl: string,
  cfg: AlfaConfig,
  path: string,
  init: RequestInit,
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { ...init, dispatcher: cfg.dispatcher } as RequestInit);
}

export type RefreshedTokens = OAuthTokens;

const ALFA_TOKEN_PATH = "/oidc/token";

/** Обменять authorization_code на пару токенов. mTLS обязателен. */
export async function exchangeAuthCode(code: string, cfg: AlfaConfig): Promise<RefreshedTokens> {
  return postOAuthToken({
    url: `${cfg.tokenBaseUrl}${ALFA_TOKEN_PATH}`,
    dispatcher: cfg.dispatcher,
    params: {
      grant_type: "authorization_code",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: cfg.redirectUri,
    },
    authRejectMessage: "Альфа отклонила код авторизации",
    apiErrorPrefix: "Альфа вернула ошибку обмена кода",
    missingTokenMessage: "Альфа не вернула токены",
    expectRefresh: true,
    includeBodyInError: true,
  });
}

/** Обновить access по refresh. Альфа может ротировать refresh — возвращаем то, что прислала. */
export async function refreshAccessToken(
  refreshToken: string,
  cfg: AlfaConfig,
): Promise<RefreshedTokens> {
  return postOAuthToken({
    url: `${cfg.tokenBaseUrl}${ALFA_TOKEN_PATH}`,
    dispatcher: cfg.dispatcher,
    params: {
      grant_type: "refresh_token",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: refreshToken,
      scope: cfg.scope,
    },
    authRejectMessage: "Альфа отклонила авторизацию — переподключите счёт",
    apiErrorPrefix: "Альфа вернула ошибку refresh",
    missingTokenMessage: "Альфа не вернула access_token",
    includeBodyInError: true,
  });
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
    // ALFA_API_BASE уже включает /api (sandbox.alfabank.ru/api или baas.alfabank.ru/api).
    const res = await alfaFetch(
      cfg.apiBaseUrl,
      cfg,
      `/jp/v1/statement/transactions?${qs.toString()}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      },
    );
    if (res.status === 401 || res.status === 403) {
      const txt = await res.text().catch(() => "");
      throw new BankApiError(
        `Альфа отклонила токен при запросе выписки (${res.status}): ${txt.slice(0, 200)}`,
      );
    }
    if (res.status === 404) {
      // По доке Альфы 404 = unknown_endpoint / неактивен, но на практике sandbox
      // и prod возвращают 404 и просто на дни без операций. Логируем тело для
      // диагностики (если что-то странное) и считаем как «нет операций за день».
      const txt = await res.text().catch(() => "");
      if (txt)
        console.warn(`[alfa] 404 ${accountNumber} ${dateISO} page=${page}: ${txt.slice(0, 300)}`);
      return out;
    }
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
