import { BankApiError } from "./types.js";
import type { SberConfig } from "./sber-mtls.js";
import { postOAuthToken, type OAuthTokens } from "./oauth-token.js";

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
    if (res.status === 404) {
      debugEmpty(accountNumber, dateISO, "files:404");
      return null;
    }
    if (res.status === 202) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    if (!res.ok) throw new BankApiError(`Сбер вернул ошибку файла ${res.status}`);

    const ctype = res.headers.get("content-type") || "";
    // Вариант A: банк сразу отдал файл (текст 1С).
    if (!ctype.includes("application/json")) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) {
        debugEmpty(accountNumber, dateISO, "files:empty-body");
        return null;
      }
      return buf;
    }
    // Вариант B: банк отдал JSON с идентификатором задачи/ссылкой.
    taskBody = await res.json();
    if (process.env.DEBUG_SBER) {
      const interestingHeaders = ["location", "content-disposition", "x-statement-status", "link"]
        .map((h) => `${h}=${res.headers.get(h) ?? "-"}`)
        .join(" ");
      console.warn(
        `[sber] step1 acc=${accountNumber} date=${dateISO} ctype=${ctype} ${interestingHeaders} body=${JSON.stringify(taskBody).slice(0, 400)}`,
      );
    }
    break;
  }
  if (!taskBody) throw new BankApiError("Сбер не успел сформировать файл, попробуйте позже");

  // Шаг 2: вытащить идентификатор/ссылку. Сбер на практике отдаёт:
  // - голое число/строку — это statementId, файл лежит по /statement/files/{id};
  // - объект с downloadLink/link/url — относительный или абсолютный URL.
  let downloadPath: string;
  if (typeof taskBody === "string" || typeof taskBody === "number") {
    downloadPath = `/fintech/api/v1/statement/files/${taskBody}`;
  } else {
    const obj = taskBody as Record<string, unknown>;
    const id = (obj.statementId || obj.id || obj.taskId || obj.requestId) as
      | string
      | number
      | undefined;
    const link = (obj.downloadLink || obj.link || obj.url) as string | undefined;
    if (link) {
      downloadPath = link.startsWith("http") ? link.replace(cfg.baseUrl, "") : link;
    } else if (id !== undefined) {
      downloadPath = `/fintech/api/v1/statement/files/${id}`;
    } else {
      throw new BankApiError("Сбер не вернул идентификатор файла");
    }
  }
  if (process.env.DEBUG_SBER) {
    console.warn(`[sber] step2 acc=${accountNumber} date=${dateISO} downloadPath=${downloadPath}`);
  }

  // Probe-режим (DEBUG_SBER=probe): дёргаем рабочий URL 6 раз с интервалом 2 сек,
  // логируем headers + body до 4000 символов. Цель — понять асинхронный flow:
  // сидит ли в эхе statementId пока файл готовится, или это финальный ответ.
  if (process.env.DEBUG_SBER === "probe") {
    const rawId =
      typeof taskBody === "string" || typeof taskBody === "number"
        ? String(taskBody)
        : String(
            ((taskBody as Record<string, unknown>).statementId ||
              (taskBody as Record<string, unknown>).id ||
              "") as string,
          );
    const probePath = `/fintech/api/v1/statement/files?${qs.toString()}&statementId=${rawId}`;
    for (let i = 0; i < 6; i++) {
      try {
        const r = await sberFetch(cfg.baseUrl, cfg, probePath, { method: "GET", headers: auth });
        const headers: Record<string, string> = {};
        r.headers.forEach((v, k) => {
          headers[k] = v;
        });
        const txt = await r.text().catch(() => "");
        console.warn(
          `[sber] probe-poll acc=${accountNumber} date=${dateISO} attempt=${i} status=${r.status} headers=${JSON.stringify(headers)} body[${txt.length}]=${txt.slice(0, 4000).replace(/\s+/g, " ")}`,
        );
        if (r.status === 200 && txt.length > 20) break; // получили что-то осмысленное — стоп
      } catch (e) {
        console.warn(
          `[sber] probe-poll acc=${accountNumber} date=${dateISO} attempt=${i} err=${(e as Error).message}`,
        );
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return null;
  }

  // Сбер может вернуть 404 пока файл в очереди формирования. Ретраим 404 столько
  // же раз, сколько 202 — на 4-й попытке (12 секунд ожидания) выходим, чтоб
  // не мучить банк.
  let firstNotFoundAttempt = -1;
  for (let attempt = 0; attempt < 20; attempt++) {
    const dl = await sberFetch(cfg.baseUrl, cfg, downloadPath, {
      method: "GET",
      headers: auth,
    });
    if (dl.status === 404) {
      if (firstNotFoundAttempt < 0) firstNotFoundAttempt = attempt;
      if (attempt - firstNotFoundAttempt >= 3) {
        debugEmpty(accountNumber, dateISO, "download:404");
        return null;
      }
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    if (dl.status === 202) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    if (!dl.ok) {
      const txt = await dl.text().catch(() => "");
      throw new BankApiError(
        `Не удалось скачать файл Сбера ${dl.status}${txt ? `: ${txt.slice(0, 200)}` : ""}`,
      );
    }
    const buf = Buffer.from(await dl.arrayBuffer());
    if (buf.length === 0) {
      debugEmpty(accountNumber, dateISO, "download:empty-body");
      return null;
    }
    return buf;
  }
  throw new BankApiError("Сбер не успел отдать файл, попробуйте позже");
}
