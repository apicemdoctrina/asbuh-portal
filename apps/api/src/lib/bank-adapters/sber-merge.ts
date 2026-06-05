import type { ParsedStatement } from "../statement-types.js";
import { BankConfigError } from "./types.js";

const MAX_DAYS = 366;

/** Список дней YYYY-MM-DD от start до end включительно (UTC). Лимит 366 дней (год + високосный). */
export function enumerateDays(start: string, end: string): string[] {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  if (e < s) throw new BankConfigError("Начало периода позже конца");
  const days: string[] = [];
  for (let d = s; d <= e; d = new Date(d.getTime() + 86400000)) {
    days.push(d.toISOString().slice(0, 10));
    if (days.length > MAX_DAYS) {
      throw new BankConfigError(`Слишком большой период (макс. ${MAX_DAYS} дней)`);
    }
  }
  return days;
}

/** YYYY-MM-DD → DD.MM.YYYY. */
function isoToRu(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}
function put(raw: Record<string, string>, key: string, val: string | null | undefined) {
  if (val) raw[key] = val;
}

/**
 * Слить дневные выписки одного счёта в одну за период.
 * Операции объединяются как есть (raw уже из настоящего 1С-файла Сбера),
 * opening = первый день, closing = последний, hasClosing = у всех дней есть остаток.
 */
export function mergeDailyStatements(
  daily: ParsedStatement[],
  period: { accountNumber: string; start: string; end: string },
): ParsedStatement {
  const accRaw: Record<string, string> = {};
  put(accRaw, "РасчСчет", period.accountNumber);
  put(accRaw, "ДатаНачала", isoToRu(period.start));
  put(accRaw, "ДатаКонца", isoToRu(period.end));

  const headerRaw: Record<string, string> = {};
  put(headerRaw, "ВерсияФормата", "1.03");
  put(headerRaw, "Кодировка", "Windows");
  put(headerRaw, "Отправитель", daily[0]?.meta.sender || "Сбербанк");
  put(headerRaw, "ДатаНачала", isoToRu(period.start));
  put(headerRaw, "ДатаКонца", isoToRu(period.end));
  put(headerRaw, "РасчСчет", period.accountNumber);

  const accountsDaily = daily.map((d) => d.accounts[0]).filter(Boolean);
  const operations = accountsDaily.flatMap((a) => a.operations);
  const hasClosing = accountsDaily.length > 0 && accountsDaily.every((a) => a.hasClosing);
  const openingBalance = accountsDaily[0]?.openingBalance ?? 0;
  const closingBalance = hasClosing
    ? (accountsDaily[accountsDaily.length - 1]?.closingBalance ?? 0)
    : 0;

  put(accRaw, "НачальныйОстаток", openingBalance.toFixed(2));
  if (hasClosing) put(accRaw, "КонечныйОстаток", closingBalance.toFixed(2));

  return {
    meta: {
      formatVersion: "1.03",
      encoding: "win1251",
      sender: daily[0]?.meta.sender || "Сбербанк",
      dateStart: isoToRu(period.start),
      dateEnd: isoToRu(period.end),
      raw: headerRaw,
    },
    accounts: [
      {
        accountNumber: period.accountNumber,
        openingBalance,
        totalIn: 0,
        totalOut: 0,
        closingBalance,
        hasClosing,
        raw: accRaw,
        operations,
      },
    ],
  };
}
