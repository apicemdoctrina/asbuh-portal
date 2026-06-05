import { BankApiError } from "./types.js";
import type { SberConfig } from "./sber-mtls.js";

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

export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string; // может совпадать со старым, если ротации нет
}

/** Обновить access_token по refresh_token. mTLS + client credentials. */
export async function refreshAccessToken(
  refreshToken: string,
  cfg: SberConfig,
): Promise<RefreshedTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
    scope: cfg.scope,
  });
  const res = await sberFetch(cfg.authBaseUrl, cfg, "/ic/sso/api/v2/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (res.status === 401 || res.status === 403) {
    throw new BankApiError("Сбер отклонил авторизацию — переподключите счёт");
  }
  if (!res.ok) throw new BankApiError(`Сбер вернул ошибку авторизации ${res.status}`);
  const data = await res.json();
  if (!data?.access_token) throw new BankApiError("Сбер не вернул access_token");
  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string) || refreshToken,
  };
}

/** Обменять authorization code на токены. mTLS + client credentials. */
export async function exchangeAuthCode(code: string, cfg: SberConfig): Promise<RefreshedTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: cfg.redirectUri,
  });
  const res = await sberFetch(cfg.authBaseUrl, cfg, "/ic/sso/api/v2/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (res.status === 401 || res.status === 403) {
    throw new BankApiError("Сбер отклонил код авторизации");
  }
  if (!res.ok) throw new BankApiError(`Сбер вернул ошибку обмена кода ${res.status}`);
  const data = await res.json();
  if (!data?.access_token || !data?.refresh_token) {
    throw new BankApiError("Сбер не вернул токены");
  }
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
  };
}

/**
 * Скачать дневную выписку счёта в формате 1С (windows-1251 байты) или null, если за день нет данных.
 *
 * ВНИМАНИЕ (не подтверждено живым стендом): точная форма ответа `/statement/files`
 * (синхронный файл vs task→link→download, поля `202`-ответа) у Сбера версионно-неоднозначна.
 * Реализация ниже — по докам, с дефолтом «непонятно → BankApiError, не 500». На первом прогоне
 * на IFT правим ТОЛЬКО эту функцию (контракт: (accessToken, accountNumber, YYYY-MM-DD) → Buffer|null).
 */
export async function fetchDailyFile(
  accessToken: string,
  accountNumber: string,
  dateISO: string,
  cfg: SberConfig,
): Promise<Buffer | null> {
  const qs = new URLSearchParams({
    accountNumber,
    statementDate: dateISO,
    format: "1C",
    encoding: "WINDOWS",
  });
  const auth = { Authorization: `Bearer ${accessToken}` };

  // Шаг 1: заказать файл; ретраим, пока банк формирует (HTTP 202).
  let taskBody: unknown = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await sberFetch(
      cfg.baseUrl,
      cfg,
      `/fintech/api/v1/statement/files?${qs.toString()}`,
      {
        method: "GET",
        headers: auth,
      },
    );
    if (res.status === 401 || res.status === 403) {
      throw new BankApiError("Сбер отклонил токен при запросе файла");
    }
    if (res.status === 404) return null; // за день нет выписки
    if (res.status === 202) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    if (!res.ok) throw new BankApiError(`Сбер вернул ошибку файла ${res.status}`);

    const ctype = res.headers.get("content-type") || "";
    // Вариант A: банк сразу отдал файл (текст 1С).
    if (!ctype.includes("application/json")) {
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.length > 0 ? buf : null;
    }
    // Вариант B: банк отдал JSON с идентификатором задачи/ссылкой.
    taskBody = await res.json();
    break;
  }
  if (!taskBody) throw new BankApiError("Сбер не успел сформировать файл, попробуйте позже");

  // Шаг 2: достать ссылку/идентификатор и скачать файл.
  const obj = taskBody as Record<string, unknown>;
  const link = (obj.downloadLink || obj.link || obj.url) as string | undefined;
  if (!link) throw new BankApiError("Сбер не вернул ссылку на файл");
  const dl = await sberFetch(
    cfg.baseUrl,
    cfg,
    link.startsWith("http") ? link.replace(cfg.baseUrl, "") : link,
    { method: "GET", headers: auth },
  );
  if (dl.status === 404) return null;
  if (!dl.ok) throw new BankApiError(`Не удалось скачать файл Сбера ${dl.status}`);
  const buf = Buffer.from(await dl.arrayBuffer());
  return buf.length > 0 ? buf : null;
}
