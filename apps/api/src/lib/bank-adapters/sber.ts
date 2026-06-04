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

    const daily: ParsedStatement[] = [];
    for (const day of days) {
      const file = await fetchDailyFile(accessToken, ctx.accountNumber, day, cfg);
      if (file) daily.push(parseStatement(file));
    }

    return mergeDailyStatements(daily, {
      accountNumber: ctx.accountNumber,
      start: ctx.start,
      end: ctx.end,
    });
  },
};
