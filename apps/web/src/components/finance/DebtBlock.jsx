import { AlertCircle } from "lucide-react";
import { fmt } from "./financeShared.jsx";

/** Total client debt with top debtors table. */
export default function DebtBlock({ debt }) {
  if (!debt || debt.total <= 0) return null;

  return (
    <div className="bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <AlertCircle size={18} className="text-red-500 dark:text-red-400" />
        <h2 className="text-base font-semibold text-heading">
          Долг клиентов: <span className="text-red-500 dark:text-red-400">{fmt(debt.total)}</span>
        </h2>
      </div>
      {debt.topDebtors.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-subtle border-b border-line">
                <th className="pb-2 font-medium">Организация</th>
                <th className="pb-2 font-medium text-right">Долг</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {debt.topDebtors.map((d) => (
                <tr key={d.id}>
                  <td className="py-2 text-body">{d.name}</td>
                  <td className="py-2 text-right font-medium text-red-500 dark:text-red-400">
                    {fmt(d.debtAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
