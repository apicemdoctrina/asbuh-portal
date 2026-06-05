import fs from "node:fs";
import path from "node:path";
import { parseStatement } from "../statement-parser.js";
import type { ParsedStatement } from "../statement-types.js";
import type { BankAdapter, FetchContext } from "./types.js";
import { getSberConfig } from "./sber-mtls.js";
import { refreshAccessToken, fetchDailyFile } from "./sber-client.js";
import { enumerateDays, mergeDailyStatements } from "./sber-merge.js";

/**
 * Считает суммарное число операций в распарсенной выписке. Нужно для DEBUG-логов:
 * если bytes>0, а ops=0 — банк отдал валидный «пустой» 1С-файл (шапка без секций
 * СекцияДокумент) или парсер не распознал формат.
 */
function countOps(p: ParsedStatement): number {
  return p.accounts.reduce((s, a) => s + a.operations.length, 0);
}

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
    const dump = process.env.DEBUG_SBER === "dump";
    async function worker(): Promise<void> {
      while (cursor < days.length) {
        const i = cursor++;
        const file = await fetchDailyFile(accessToken, ctx.accountNumber, days[i], cfg);
        if (file) {
          const parsed = parseStatement(file);
          if (process.env.DEBUG_SBER) {
            console.warn(
              `[sber] day acc=${ctx.accountNumber} date=${days[i]} bytes=${file.length} ops=${countOps(parsed)}`,
            );
          }
          if (dump) {
            // Сохраняем сырой 1С-файл, чтобы вручную глянуть глазами / прогнать парсер.
            // DEBUG_SBER=dump только на одной отладочной выгрузке — иначе диск засрётся.
            const fn = path.join("/tmp", `sber-${ctx.accountNumber}-${days[i]}.txt`);
            try {
              fs.writeFileSync(fn, file);
            } catch (e) {
              console.warn(`[sber] dump failed ${fn}: ${(e as Error).message}`);
            }
          }
          daily.push(parsed);
        }
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
