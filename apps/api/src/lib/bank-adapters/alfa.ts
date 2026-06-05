import type { ParsedStatement } from "../statement-types.js";
import type { BankAdapter, FetchContext } from "./types.js";
import { getAlfaConfig } from "./alfa-mtls.js";
import { refreshAccessToken, fetchDayTransactions } from "./alfa-client.js";
import { enumerateDays, mergeDailyStatements } from "./sber-merge.js";
import { parseAlfaDay } from "./alfa-parser.js";

export const alfaAdapter: BankAdapter = {
  provider: "alfa",
  async fetchStatement(ctx: FetchContext): Promise<ParsedStatement> {
    const cfg = getAlfaConfig();
    const days = enumerateDays(ctx.start, ctx.end);

    const { accessToken, refreshToken } = await refreshAccessToken(ctx.credential, cfg);
    if (refreshToken && refreshToken !== ctx.credential) {
      await ctx.saveCredential(refreshToken);
    }

    // Параллельный fetch с пулом — те же соображения, что для Сбера.
    const CONCURRENCY = 6;
    const daily: ParsedStatement[] = [];
    let cursor = 0;
    async function worker(): Promise<void> {
      while (cursor < days.length) {
        const i = cursor++;
        const day = days[i];
        const txs = await fetchDayTransactions(accessToken, ctx.accountNumber, day, cfg);
        if (txs.length > 0) daily.push(parseAlfaDay(ctx.accountNumber, day, txs));
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
