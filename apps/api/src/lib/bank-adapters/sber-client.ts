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

  // Диагностический пробник для перехода на /v2/statement/transactions —
  // синхронный JSON-endpoint, требует тот же scope GET_STATEMENT_ACCOUNT,
  // что у нас уже есть. По схеме ответа сможем собирать 1С локально, минуя
  // файловый API (который сейчас 403 из-за невключённого сервиса FILES).
  if (process.env.DEBUG_SBER) {
    try {
      const txQs = new URLSearchParams({
        accountNumber,
        statementDate: dateISO,
        page: "1",
      });
      const r = await sberFetch(
        cfg.baseUrl,
        cfg,
        `/fintech/api/v2/statement/transactions?${txQs.toString()}`,
        { method: "GET", headers: auth },
      );
      const txt = await r.text().catch(() => "");
      console.warn(
        `[sber] v2-transactions acc=${accountNumber} date=${dateISO} status=${r.status} ctype=${r.headers.get("content-type") ?? "-"} body[${txt.length}]=${txt.slice(0, 4000).replace(/\s+/g, " ")}`,
      );
    } catch (e) {
      console.warn(
        `[sber] v2-transactions acc=${accountNumber} date=${dateISO} err=${(e as Error).message}`,
      );
    }
  }

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

  // Шаг 2: вытащить fileId. /statement/files отдаёт голое число/строку —
  // это fileId для файлового API. Поля downloadLink/url Сбер на проде не
  // возвращает (по доке и probe IFT — только число).
  let fileId: string;
  if (typeof taskBody === "string" || typeof taskBody === "number") {
    fileId = String(taskBody);
  } else {
    const obj = taskBody as Record<string, unknown>;
    const id = (obj.fileId || obj.statementId || obj.id || obj.taskId || obj.requestId) as
      | string
      | number
      | undefined;
    if (id === undefined) throw new BankApiError("Сбер не вернул идентификатор файла");
    fileId = String(id);
  }
  if (process.env.DEBUG_SBER) {
    console.warn(`[sber] step2 acc=${accountNumber} date=${dateISO} fileId=${fileId}`);
  }

  // Шаг 3: POST /fintech/api/v1/files/download с {fileId} забирает готовый файл.
  // Требует scope GET_STATEMENT_TRANSACTION (без него — 403 ACTION_ACCESS_EXCEPTION
  // «отсутствует доступ к [FILES]»). Ретраим 202/404 пока файл формируется.
  const downloadPath = "/fintech/api/v1/files/download";
  let firstNotFoundAttempt = -1;
  for (let attempt = 0; attempt < 20; attempt++) {
    const dl = await sberFetch(cfg.baseUrl, cfg, downloadPath, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ fileId }),
    });
    if (dl.status === 403) {
      // Это gate на стороне Сбера: сервис «FILES» должен быть включён в продукт
      // партнёра в developer.sberbank.ru. Без этого продуктовый scope (SCOPE_B2BSaaS_…)
      // не пускает к /v1/files/download — никакая правка .env это не обходит.
      throw new BankApiError(
        "Сбер: продукт партнёра не имеет доступа к сервису FILES — обратитесь к менеджеру Сбера, чтобы включить FILES в ваш B2BSaaS-продукт",
      );
    }
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

    const ctype = dl.headers.get("content-type") || "";
    // Если ответ — бинарь, это и есть файл 1С.
    if (!ctype.includes("application/json")) {
      const buf = Buffer.from(await dl.arrayBuffer());
      if (buf.length === 0) {
        debugEmpty(accountNumber, dateISO, "download:empty-body");
        return null;
      }
      return buf;
    }
    // Если JSON — внутри либо base64-контент, либо ссылка на скачивание.
    const body = (await dl.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) throw new BankApiError("Сбер вернул пустой JSON в /files/download");
    const b64 = (body.content || body.file || body.data || body.fileContent) as string | undefined;
    if (typeof b64 === "string" && b64.length > 0) {
      return Buffer.from(b64, "base64");
    }
    const link = (body.downloadLink || body.url || body.link) as string | undefined;
    if (typeof link === "string" && link.length > 0) {
      const path = link.startsWith("http") ? link.replace(cfg.baseUrl, "") : link;
      const r = await sberFetch(cfg.baseUrl, cfg, path, { method: "GET", headers: auth });
      if (!r.ok) throw new BankApiError(`Сбер: ссылка на файл вернула ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length === 0) {
        debugEmpty(accountNumber, dateISO, "download:link-empty");
        return null;
      }
      return buf;
    }
    throw new BankApiError(
      `Сбер /files/download вернул JSON без файла: ${JSON.stringify(body).slice(0, 200)}`,
    );
  }
  throw new BankApiError("Сбер не успел отдать файл, попробуйте позже");
}
