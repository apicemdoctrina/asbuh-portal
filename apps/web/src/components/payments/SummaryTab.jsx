import { useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../../lib/api.js";
import { useApi } from "../../hooks/useApi.js";
import { MONTHS, fmt } from "./paymentsConstants.js";

/** Monthly totals of incoming payments. */
export default function SummaryTab() {
  const [period, setPeriod] = useState("all");

  const { data: monthsData, loading } = useApi(async () => {
    const res = await api(`/api/payments/summary?year=${period}`);
    const d = res.ok ? await res.json() : { months: [] };
    return d.months || [];
  }, [period]);
  const data = monthsData ?? [];

  const totalAll = data.reduce((s, m) => s + m.total, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="px-3 py-2 border border-line rounded-lg text-sm bg-surface"
        >
          <option value="all">Весь период</option>
          <option value="2025">2025</option>
          <option value="2026">2026</option>
        </select>
        <div className="text-sm text-subtle">
          Итого за период: <span className="font-bold text-heading">{fmt(totalAll)}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-subtle">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {data.map((m) => (
            <div
              key={`${m.year || ""}-${m.month}`}
              className={`bg-surface rounded-xl border p-4 ${m.total > 0 ? "border-green-200 dark:border-green-500/30" : "border-line"}`}
            >
              <div className="text-sm text-subtle mb-1">
                {m.year ? `${MONTHS[m.month]} ${m.year}` : MONTHS[m.month]}
              </div>
              <div
                className={`text-lg font-bold ${m.total > 0 ? "text-green-600 dark:text-green-300" : "text-subtle"}`}
              >
                {m.total > 0 ? fmt(m.total) : "—"}
              </div>
              <div className="text-xs text-subtle mt-1">
                {m.count > 0 ? `${m.count} платежей` : "нет платежей"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
