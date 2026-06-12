export const MATCH_STATUS_LABELS = {
  UNMATCHED: "Не сопоставлен",
  AUTO: "Авто",
  MANUAL: "Вручную",
  IGNORED: "Игнорируется",
};
export const MATCH_STATUS_COLORS = {
  UNMATCHED: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
  AUTO: "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300",
  MANUAL: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
  IGNORED: "bg-muted text-subtle",
};

export const MONTHS = [
  "",
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

export const DEST_LABELS = { CARD: "Карта", CASH: "Наличные" };
export const DEST_COLORS = {
  CARD: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
  CASH: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

export function fmt(val) {
  if (val == null) return "—";
  return Number(val).toLocaleString("ru-RU") + " ₽";
}
