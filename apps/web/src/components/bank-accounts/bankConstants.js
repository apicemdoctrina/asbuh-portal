export const money = (n) =>
  Number(n).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** YYYY-MM-DD для <input type=date>. */
export function isoDay(d) {
  return new Date(d).toISOString().slice(0, 10);
}

/** «1 мая 2026» — человекочитаемый формат для списков выписок. */
export function ruDay(d) {
  return new Date(d).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function firstDayOfMonth() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`;
}

export const BANKS = [
  {
    name: "Сбербанк",
    bg: "bg-green-100 dark:bg-green-500/15",
    text: "text-green-700 dark:text-green-300",
  },
  { name: "БСПБ", bg: "bg-rose-100 dark:bg-rose-500/15", text: "text-rose-700 dark:text-rose-300" },
  { name: "ВТБ", bg: "bg-blue-100 dark:bg-blue-500/15", text: "text-blue-700 dark:text-blue-300" },
  { name: "ЭТБ", bg: "bg-cyan-100 dark:bg-cyan-500/15", text: "text-cyan-700 dark:text-cyan-300" },
  { name: "Альфа", bg: "bg-red-100 dark:bg-red-500/15", text: "text-red-700 dark:text-red-300" },
  {
    name: "Т-Банк",
    bg: "bg-yellow-100 dark:bg-yellow-500/15",
    text: "text-yellow-700 dark:text-yellow-300",
  },
  {
    name: "ПСБ",
    bg: "bg-indigo-100 dark:bg-indigo-500/15",
    text: "text-indigo-700 dark:text-indigo-300",
  },
  {
    name: "Точка",
    bg: "bg-orange-100 dark:bg-orange-500/15",
    text: "text-orange-700 dark:text-orange-300",
  },
  { name: "РСБ", bg: "bg-teal-100 dark:bg-teal-500/15", text: "text-teal-700 dark:text-teal-300" },
  { name: "Открытие", bg: "bg-sky-100 dark:bg-sky-500/15", text: "text-sky-700 dark:text-sky-300" },
  { name: "ГазПромБанк", bg: "bg-line", text: "text-body" },
  {
    name: "Локо",
    bg: "bg-purple-100 dark:bg-purple-500/15",
    text: "text-purple-700 dark:text-purple-300",
  },
  {
    name: "Авангард",
    bg: "bg-amber-100 dark:bg-amber-500/15",
    text: "text-amber-700 dark:text-amber-300",
  },
];

const BANK_STYLE = Object.fromEntries(BANKS.map((b) => [b.name, { bg: b.bg, text: b.text }]));

export function bankBadgeCls(name) {
  const s = BANK_STYLE[name];
  if (s) return `${s.bg} ${s.text}`;
  return "bg-muted text-body";
}

export const API_PROVIDER_LABELS = { tochka: "Точка", sber: "Сбер", alfa: "Альфа", email: "Email" };

// Банк однозначно определяет провайдера API — не дёргаем юзера лишним вопросом.
export const BANK_TO_PROVIDER = { Сбербанк: "sber", Альфа: "alfa", Точка: "tochka" };

// Старые счета могут иметь apiProvider=null в БД — выводим из bankName.
export function effectiveProvider(acc) {
  return acc.apiProvider || BANK_TO_PROVIDER[acc.bankName] || null;
}

export const SECRET_DISPLAY_DURATION = 30_000;
