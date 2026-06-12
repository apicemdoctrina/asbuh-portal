import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export const MONTHS_RU = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

export const fmt = (n) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n);

export const fmtShort = (n) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(Math.round(n));
};

export const ROLE_LABELS = { admin: "Администратор", manager: "Менеджер", accountant: "Бухгалтер" };

export function MarginBadge({ margin }) {
  if (margin >= 40)
    return <span className="text-emerald-600 dark:text-emerald-300 font-semibold">{margin}%</span>;
  if (margin >= 20)
    return <span className="text-amber-600 dark:text-amber-300 font-semibold">{margin}%</span>;
  if (margin > 0)
    return <span className="text-red-500 dark:text-red-400 font-semibold">{margin}%</span>;
  return <span className="text-red-600 dark:text-red-300 font-bold">{margin}%</span>;
}

export function calcGrowth(current, prev) {
  if (prev == null || prev === 0) return null;
  return ((current - prev) / Math.abs(prev)) * 100;
}

export const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid var(--color-line)",
  backgroundColor: "var(--color-surface)",
  color: "var(--color-heading)",
  fontSize: 12,
  boxShadow: "0 6px 16px -4px rgba(0,0,0,0.35)",
};
export const tooltipLabelStyle = { color: "var(--color-body)" };
export const tooltipItemStyle = { color: "var(--color-heading)" };

// Theme-agnostic chart accents (resolve as SVG attributes, so no CSS vars here):
// faint neutral grid + a soft primary "glow" cursor behind the hovered bar.
export const chartGridStroke = "rgba(148,163,184,0.25)";
export const chartCursorFill = { fill: "rgba(101,103,241,0.12)" };

export function GrowthBadge({ pct, absolute }) {
  if (pct == null) return null;
  const isZero = Math.abs(pct) < 0.5;
  const isPositive = pct > 0;
  if (isZero)
    return (
      <span className="text-xs text-subtle mt-0.5 flex items-center gap-0.5">
        <Minus size={10} /> 0%
      </span>
    );
  return (
    <span
      className={`text-xs mt-0.5 flex items-center gap-0.5 font-medium ${isPositive ? "text-emerald-600 dark:text-emerald-300" : "text-red-500 dark:text-red-400"}`}
    >
      {isPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {isPositive ? "+" : ""}
      {absolute ? `${pct.toFixed(1)} пп` : `${pct.toFixed(1)}%`}
    </span>
  );
}

export function KpiCard({ icon: Icon, label, value, sub, positive, growth, absoluteGrowth }) {
  const color =
    positive === undefined
      ? "text-primary"
      : positive
        ? "text-emerald-600 dark:text-emerald-300"
        : "text-red-500 dark:text-red-400";
  return (
    <div className="bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-subtle">{label}</span>
        <div className={`p-2 rounded-lg bg-canvas ${color}`}>
          <Icon size={18} />
        </div>
      </div>
      <div className={`text-lg sm:text-xl font-bold leading-tight ${color} break-words`}>
        {value}
      </div>
      <GrowthBadge pct={growth} absolute={absoluteGrowth} />
      {sub && <div className="text-xs text-subtle mt-1">{sub}</div>}
    </div>
  );
}
