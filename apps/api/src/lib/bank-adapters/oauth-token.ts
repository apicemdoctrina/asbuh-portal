import { BankApiError } from "./types.js";
import type { Dispatcher } from "undici";

export interface OAuthTokens {
  accessToken: string;
  /** Может совпадать с входным refresh, если банк не ротирует. */
  refreshToken: string;
}

export interface PostOAuthTokenOpts {
  /** Полный URL /token-эндпоинта банка. */
  url: string;
  /** undici-dispatcher для mTLS-банков (Сбер, Альфа). У Точки нет. */
  dispatcher?: Dispatcher;
  /** Поля form-body (grant_type, client_id, client_secret, refresh_token/code/...). */
  params: Record<string, string>;
  /** Сообщение для 401/403 — обычно «<банк> отклонил/отклонила …». */
  authRejectMessage: string;
  /** Префикс для прочих non-OK ответов: `<prefix> 422: <body>`. */
  apiErrorPrefix: string;
  /** Сообщение для случая «банк не вернул access_token». */
  missingTokenMessage: string;
  /**
   * Если true — refresh_token обязателен в ответе (authorization_code flow).
   * Если false — отсутствующий refresh означает «банк не ротирует», вернём params.refresh_token.
   */
  expectRefresh?: boolean;
  /**
   * Включать ли первые 200 символов тела ответа в сообщение non-OK ошибки.
   * Полезно для отладки конфигурации скоупов/redirect_uri на стороне банка.
   */
  includeBodyInError?: boolean;
}

/**
 * Один POST /token для всех OAuth-банков: refresh, exchange code, client_credentials.
 * Снимает копипасту между sber-client, alfa-client, tochka-oauth.
 *
 * Ошибки строго через BankApiError — caller передаёт точные тексты, чтобы сохранить
 * банк-специфичную формулировку («Сбер отклонил» vs «Альфа отклонила» — род).
 */
export async function postOAuthToken(opts: PostOAuthTokenOpts): Promise<OAuthTokens> {
  const body = new URLSearchParams(opts.params);
  const res = await fetch(opts.url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    dispatcher: opts.dispatcher,
  } as RequestInit);

  if (res.status === 401 || res.status === 403) {
    throw new BankApiError(opts.authRejectMessage);
  }
  if (!res.ok) {
    if (opts.includeBodyInError) {
      const txt = await res.text().catch(() => "");
      throw new BankApiError(
        `${opts.apiErrorPrefix} ${res.status}${txt ? `: ${txt.slice(0, 200)}` : ""}`,
      );
    }
    throw new BankApiError(`${opts.apiErrorPrefix} ${res.status}`);
  }

  const data = (await res.json()) as { access_token?: string; refresh_token?: string };
  if (!data?.access_token) throw new BankApiError(opts.missingTokenMessage);
  if (opts.expectRefresh && !data.refresh_token) {
    throw new BankApiError(opts.missingTokenMessage);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || opts.params.refresh_token || "",
  };
}
