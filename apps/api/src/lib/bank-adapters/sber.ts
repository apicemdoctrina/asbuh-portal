import { parseStatement } from "../statement-parser.js";
import type { ParsedStatement } from "../statement-types.js";
import type { BankAdapter, FetchContext } from "./types.js";
import { getSberConfig } from "./sber-mtls.js";
import { refreshAccessToken, fetchDailyFile } from "./sber-client.js";
import { enumerateDays, mergeDailyStatements } from "./sber-merge.js";

export const sberAdapter: BankAdapter = {
  provider: "sber",
  async fetchStatement(ctx: FetchContext): Promise<ParsedStatement> {
    const cfg = getSberConfig(); // BankConfigError, если не настроено
    const days = enumerateDays(ctx.start, ctx.end); // BankConfigError при >31

    const { accessToken, refreshToken } = await refreshAccessToken(ctx.credential, cfg);
    if (refreshToken && refreshToken !== ctx.credential) {
      await ctx.saveCredential(refreshToken);
    }

    // Параллельный fetch с ограниченным пулом, чтобы не вылетать в таймаут nginx
    // на длинных периодах и не задушить Сбер. CONCURRENCY=6 — компромисс по нагрузке.
    const CONCURRENCY = 6;
    const daily: ParsedStatement[] = [];
    let cursor = 0;
    async function worker(): Promise<void> {
      while (cursor < days.length) {
        const i = cursor++;
        const file = await fetchDailyFile(accessToken, ctx.accountNumber, days[i], cfg);
        if (file) daily.push(parseStatement(file));
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, days.length) }, worker));

    return mergeDailyStatements(daily, {
      accountNumber: ctx.accountNumber,
      start: ctx.start,
      end: ctx.end,
    });
  },
};
