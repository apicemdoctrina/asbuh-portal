import { Check, Clock, AlertCircle, Ban } from "lucide-react";

export const FREQUENCY_LABELS = {
  MONTHLY: "Ежемесячно",
  QUARTERLY: "Ежеквартально",
  YEARLY: "Ежегодно",
};
export const FREQUENCY_SHORT = { MONTHLY: "Мес.", QUARTERLY: "Кв.", YEARLY: "Год" };
export const FREQUENCY_OPTIONS = ["QUARTERLY", "MONTHLY", "YEARLY"];

export const STATUS_OPTIONS = [
  { value: "NOT_SUBMITTED", label: "Не сдана", icon: Clock, color: "bg-muted text-subtle" },
  {
    value: "SUBMITTED",
    label: "Сдана",
    icon: Check,
    color: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
  },
  {
    value: "ACCEPTED",
    label: "Принята",
    icon: Check,
    color: "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300",
  },
  {
    value: "REJECTED",
    label: "Отклонена",
    icon: AlertCircle,
    color: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
  },
  { value: "NOT_APPLICABLE", label: "—", icon: Ban, color: "bg-transparent text-subtle" },
];

export const STATUS_MAP = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s]));

export function periodLabel(frequency, period) {
  if (frequency === "MONTHLY") {
    const months = [
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
    return months[period] || `${period}`;
  }
  if (frequency === "QUARTERLY") return `${period} квартал`;
  return "Год";
}

export function getPeriods(frequency) {
  if (frequency === "MONTHLY") return Array.from({ length: 12 }, (_, i) => i + 1);
  if (frequency === "QUARTERLY") return [1, 2, 3, 4];
  return [0];
}

export function getCurrentPeriod(frequency) {
  const now = new Date();
  if (frequency === "MONTHLY") return now.getMonth() + 1;
  if (frequency === "QUARTERLY") return Math.ceil((now.getMonth() + 1) / 3);
  return 0;
}
