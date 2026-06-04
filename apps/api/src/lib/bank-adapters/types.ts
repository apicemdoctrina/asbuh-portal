import type { ParsedStatement } from "../statement-types.js";

export interface FetchOpts {
  token: string;
  accountNumber: string;
  accountId: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}

export interface BankAdapter {
  provider: string;
  fetchStatement(opts: FetchOpts): Promise<ParsedStatement>;
}

/** Доступ не настроен (нет токена и т.п.) → 422 на роуте. */
export class BankConfigError extends Error {}

/** Банк отклонил запрос / таймаут → 502 на роуте. */
export class BankApiError extends Error {}
