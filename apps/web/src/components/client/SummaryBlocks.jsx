import { Banknote, CalendarClock, MessageSquare } from "lucide-react";

function Block({ icon: Icon, label, value, hint, valueClass }) {
  return (
    <div className="bg-surface rounded-2xl shadow-lg border border-line p-4">
      <div className="flex items-center gap-2 text-subtle text-xs">
        <Icon size={14} /> {label}
      </div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${valueClass ?? "text-heading"}`}>
        {value}
      </div>
      {hint && <div className="text-xs text-subtle mt-0.5">{hint}</div>}
    </div>
  );
}

export default function SummaryBlocks({ summary }) {
  const debtValue = summary.debt > 0 ? `${summary.debt.toLocaleString("ru-RU")} ₽` : "0 ₽";
  const debtClass =
    summary.debt > 0 ? "text-red-600 dark:text-red-300" : "text-emerald-600 dark:text-emerald-300";

  const next = summary.nextDeadline;
  const nextValue = next
    ? new Date(next.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
    : "—";
  const nextHint = next ? next.label : "нет ближайших отчётов";

  return (
    <div className="flex flex-col gap-3">
      <Block
        icon={Banknote}
        label="Долг"
        value={debtValue}
        valueClass={debtClass}
        hint={summary.debt === 0 ? "оплата в срок" : undefined}
      />
      <Block icon={CalendarClock} label="Ближайший срок" value={nextValue} hint={nextHint} />
      <Block
        icon={MessageSquare}
        label="Открытых обращений"
        value={summary.openTickets}
        hint={summary.openTickets === 0 ? "все вопросы закрыты" : undefined}
      />
    </div>
  );
}
