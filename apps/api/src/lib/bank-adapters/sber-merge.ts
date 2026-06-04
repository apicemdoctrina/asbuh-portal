import { BankConfigError } from "./types.js";

const MAX_DAYS = 31;

/** Список дней YYYY-MM-DD от start до end включительно (UTC). Лимит 31 день. */
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
