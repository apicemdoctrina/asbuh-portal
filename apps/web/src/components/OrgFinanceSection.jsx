import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext.jsx";

const money = (n) =>
  Number(n).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function OrgFinanceSection({ organizationId, financeVisibleToClient, onToggle }) {
  const { hasPermission } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    api(`/api/organizations/${organizationId}/finance?${qs.toString()}`).then(async (res) => {
      if (!active) return;
      if (res.ok) setData(await res.json());
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [organizationId, from, to]);

  const canEdit = hasPermission("organization", "edit");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-subtle">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  const s = data?.summary;
  const empty = !s || s.count === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <label className="text-xs text-subtle">
            С
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="block mt-0.5 rounded-md border border-line bg-surface text-body text-sm px-2 py-1"
            />
          </label>
          <label className="text-xs text-subtle">
            По
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="block mt-0.5 rounded-md border border-line bg-surface text-body text-sm px-2 py-1"
            />
          </label>
        </div>
        {canEdit && (
          <label className="flex items-center gap-2 text-sm text-body cursor-pointer">
            <input
              type="checkbox"
              checked={!!financeVisibleToClient}
              onChange={(e) => onToggle(e.target.checked)}
            />
            Показывать клиенту
          </label>
        )}
      </div>

      {empty ? (
        <div className="py-12 text-center text-subtle">Нет данных по выпискам</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-surface rounded-2xl border border-line p-4">
              <div className="text-xs text-subtle">Приход</div>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-300">
                {money(s.totals.in)} ₽
              </div>
            </div>
            <div className="bg-surface rounded-2xl border border-line p-4">
              <div className="text-xs text-subtle">Расход</div>
              <div className="text-xl font-bold text-red-600 dark:text-red-300">
                {money(s.totals.out)} ₽
              </div>
            </div>
            <div className="bg-surface rounded-2xl border border-line p-4">
              <div className="text-xs text-subtle">Сальдо</div>
              <div className="text-xl font-bold text-heading">{money(s.totals.net)} ₽</div>
            </div>
          </div>

          <div className="bg-surface rounded-2xl border border-line p-4">
            <div className="text-sm font-medium text-body mb-3">Динамика по месяцам</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={s.byMonth}>
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip formatter={(v) => `${money(v)} ₽`} />
                <Legend />
                <Bar dataKey="in" name="Приход" fill="#10b981" />
                <Bar dataKey="out" name="Расход" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TopList title="Топ по приходу" icon={TrendingUp} items={s.topIn} color="emerald" />
            <TopList title="Топ по расходу" icon={TrendingDown} items={s.topOut} color="red" />
          </div>

          <div className="bg-surface rounded-2xl border border-line overflow-hidden">
            <div className="px-4 py-3 border-b border-line text-sm font-medium text-body">
              Операции
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted text-subtle text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Дата</th>
                  <th className="px-4 py-2 font-medium">Контрагент</th>
                  <th className="px-4 py-2 font-medium">Назначение</th>
                  <th className="px-4 py-2 font-medium text-right">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((t) => (
                  <tr key={t.id} className="border-t border-line text-body">
                    <td className="px-4 py-2">{new Date(t.date).toLocaleDateString("ru-RU")}</td>
                    <td className="px-4 py-2">{t.counterparty || "—"}</td>
                    <td className="px-4 py-2 text-subtle">{t.purpose || ""}</td>
                    <td
                      className={`px-4 py-2 text-right ${
                        t.direction === "IN"
                          ? "text-emerald-600 dark:text-emerald-300"
                          : "text-red-600 dark:text-red-300"
                      }`}
                    >
                      {t.direction === "IN" ? "+" : "−"}
                      {money(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function TopList({ title, icon: Icon, items, color }) {
  const cls =
    color === "emerald"
      ? "text-emerald-600 dark:text-emerald-300"
      : "text-red-600 dark:text-red-300";
  return (
    <div className="bg-surface rounded-2xl border border-line p-4">
      <div className={`flex items-center gap-2 text-sm font-medium mb-3 ${cls}`}>
        <Icon size={16} /> {title}
      </div>
      {items.length === 0 ? (
        <div className="text-subtle text-sm">—</div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="flex justify-between text-sm">
              <span className="text-body truncate pr-2">{it.name}</span>
              <span className={`font-medium ${cls}`}>{money(it.sum)} ₽</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
