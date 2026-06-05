import type { ParsedStatement } from "../statement-types.js";

export interface FetchContext {
  accountNumber: string;
  accountId: string | null;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  credential: string; // расшифрованный apiToken (Точка: JWT/bearer | Сбер: refresh_token)
  /** Персист ротированного токена (Сбер). Точка не вызывает. */
  saveCredential: (next: string) => Promise<void>;
}

export interface BankAdapter {
  provider: string;
  fetchStatement(ctx: FetchContext): Promise<ParsedStatement>;
}

/** Доступ не настроен (нет токена и т.п.) → 422 на роуте. */
export class BankConfigError extends Error {}

/** Банк отклонил запрос / таймаут → 502 на роуте. */
export class BankApiError extends Error {}
