import { DollarSign, TrendingUp, AlertCircle } from "lucide-react";
import { fmt } from "./paymentsConstants.js";

/** Four summary cards (expected / received / debt / debtor count) shared by reconcile tabs. */
export default function ReconcileSummaryCards({ summary }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <div className="bg-surface rounded-xl border border-line p-4">
        <div className="flex items-center gap-2 text-sm text-subtle mb-1">
          <DollarSign size={14} />
          Ожидалось
        </div>
        <div className="text-lg font-bold text-heading">{fmt(summary.expected)}</div>
      </div>
      <div className="bg-surface rounded-xl border border-line p-4">
        <div className="flex items-center gap-2 text-sm text-subtle mb-1">
          <TrendingUp size={14} />
          Поступило
        </div>
        <div className="text-lg font-bold text-green-600 dark:text-green-300">
          {fmt(summary.received)}
        </div>
      </div>
      <div className="bg-surface rounded-xl border border-line p-4">
        <div className="flex items-center gap-2 text-sm text-subtle mb-1">
          <AlertCircle size={14} />
          Задолженность
        </div>
        <div
          className={`text-lg font-bold ${summary.debt > 0 ? "text-red-600 dark:text-red-300" : "text-heading"}`}
        >
          {fmt(summary.debt)}
        </div>
      </div>
      <div className="bg-surface rounded-xl border border-line p-4">
        <div className="flex items-center gap-2 text-sm text-subtle mb-1">
          <AlertCircle size={14} />
          Должников
        </div>
        <div
          className={`text-lg font-bold ${summary.debtorCount > 0 ? "text-red-600 dark:text-red-300" : "text-heading"}`}
        >
          {summary.debtorCount}
        </div>
      </div>
    </div>
  );
}
