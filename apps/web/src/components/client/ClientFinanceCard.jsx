import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Loader2 } from "lucide-react";
import { api } from "../../lib/api";
import { useApi } from "../../hooks/useApi.js";

const money = (n) =>
  Number(n).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ClientFinanceCard({ organizationId }) {
  // 403 → forbidden (публикация выключена), сетевая ошибка → карточку просто не показываем
  const { data, loading } = useApi(async () => {
    const res = await api(`/api/organizations/${organizationId}/finance`);
    if (res.ok) return { summary: (await res.json()).summary, forbidden: false };
    if (res.status === 403) return { summary: null, forbidden: true };
    return { summary: null, forbidden: false };
  }, [organizationId]);
  const summary = data?.summary ?? null;
  const forbidden = data?.forbidden ?? false;

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
          <Tooltip
            formatter={(v) => `${money(v)} ₽`}
            cursor={{ fill: "var(--color-muted)", fillOpacity: 0.5 }}
            contentStyle={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-line)",
              borderRadius: 12,
              color: "var(--color-heading)",
            }}
            labelStyle={{ color: "var(--color-body)" }}
          />
          <Legend />
          <Bar dataKey="in" name="Приход" fill="#10b981" />
          <Bar dataKey="out" name="Расход" fill="#ef4444" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
