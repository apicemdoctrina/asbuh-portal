import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Loader2 } from "lucide-react";
import { api } from "../../lib/api";

const money = (n) =>
  Number(n).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ClientFinanceCard({ organizationId }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const res = await api(`/api/organizations/${organizationId}/finance`);
        if (!active) return;
        if (res.ok) setSummary((await res.json()).summary);
        else if (res.status === 403) setForbidden(true);
      } catch {
        // сеть недоступна — карточку просто не показываем
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [organizationId]);

  if (forbidden) return null; // публикация выключена — секции нет
  if (loading) {
    return (
      <div className="bg-surface rounded-2xl border border-line p-6 flex justify-center text-subtle">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }
  if (!summary || summary.count === 0) return null;

  return (
    <div className="bg-surface rounded-2xl shadow-lg border border-line p-6">
      <h3 className="text-lg font-semibold text-heading mb-4">Финансы</h3>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <div className="text-xs text-subtle">Приход</div>
          <div className="text-lg font-bold text-emerald-600 dark:text-emerald-300">
            {money(summary.totals.in)} ₽
          </div>
        </div>
        <div>
          <div className="text-xs text-subtle">Расход</div>
          <div className="text-lg font-bold text-red-600 dark:text-red-300">
            {money(summary.totals.out)} ₽
          </div>
        </div>
        <div>
          <div className="text-xs text-subtle">Сальдо</div>
          <div className="text-lg font-bold text-heading">{money(summary.totals.net)} ₽</div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={summary.byMonth}>
          <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
          <YAxis stroke="#94a3b8" fontSize={12} />
          <Tooltip formatter={(v) => `${money(v)} ₽`} />
          <Legend />
          <Bar dataKey="in" name="Приход" fill="#10b981" />
          <Bar dataKey="out" name="Расход" fill="#ef4444" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
