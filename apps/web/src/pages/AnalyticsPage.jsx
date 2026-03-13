import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Users, Map, AlertTriangle, Loader2, TrendingUp, Clock } from "lucide-react";

const CATEGORY_LABELS = {
  REPORTING: "Отчётность",
  DOCUMENTS: "Документы",
  PAYMENT: "Оплата",
  OTHER: "Прочее",
};

const TABS = [
  { id: "workload", label: "Загрузка команды", icon: Users },
  { id: "sections", label: "Участки", icon: Map },
  { id: "bottlenecks", label: "Узкие места", icon: AlertTriangle },
];

const fmt = (n) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n);

function WorkloadBar({ value, max }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  let color = "bg-emerald-500";
  if (pct > 75) color = "bg-red-500";
  else if (pct > 50) color = "bg-amber-400";
  return (
    <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function MarginBadge({ margin }) {
  if (margin >= 40) return <span className="text-emerald-600 font-semibold">{margin}%</span>;
  if (margin >= 20) return <span className="text-amber-600 font-semibold">{margin}%</span>;
  if (margin > 0) return <span className="text-red-500 font-semibold">{margin}%</span>;
  return <span className="text-red-600 font-bold">{margin}%</span>;
}

export default function AnalyticsPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("workload");

  useEffect(() => {
    let cancelled = false;
    async function fetch() {
      try {
        const res = await api("/api/management/analytics");
        if (!res.ok) throw new Error("Не удалось загрузить аналитику");
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetch();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!hasRole("admin") && !hasRole("manager")) {
    return <div className="text-red-600 text-sm">Нет доступа</div>;
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );

  if (error) return <div className="text-red-600 text-sm">{error}</div>;
  if (!data) return null;

  const maxOpen = Math.max(...data.workload.map((w) => w.openTasks), 1);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Аналитика</h1>
        <p className="text-sm text-slate-500 mt-1">
          Загрузка команды, маржинальность участков и узкие места
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          icon={Users}
          label="Сотрудников"
          value={data.workload.length}
          color="bg-[#6567F1]/10 text-[#6567F1]"
        />
        {isAdmin && data.sectionProfitability && (
          <SummaryCard
            icon={Map}
            label="Участков"
            value={data.sectionProfitability.length}
            color="bg-emerald-500/10 text-emerald-600"
          />
        )}
        <SummaryCard
          icon={AlertTriangle}
          label="Просрочено задач"
          value={data.bottlenecks.totalOverdue}
          color={
            data.bottlenecks.totalOverdue > 0
              ? "bg-red-500/10 text-red-600"
              : "bg-emerald-500/10 text-emerald-600"
          }
        />
        <SummaryCard
          icon={Clock}
          label="Сред. выполнение"
          value={
            data.bottlenecks.avgCompletionDays != null
              ? `${data.bottlenecks.avgCompletionDays} дн.`
              : "—"
          }
          color="bg-amber-500/10 text-amber-600"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white rounded-xl p-1 border border-slate-200 shadow-sm w-fit">
        {TABS.filter((t) => t.id !== "sections" || isAdmin).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-[#6567F1] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "workload" && (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">Загрузка команды</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Активные задачи, просрочки и продуктивность за последние 30 дней
            </p>
          </div>
          {data.workload.length === 0 ? (
            <div className="px-6 py-8 text-center text-slate-400 text-sm">
              Нет сотрудников с задачами
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Сотрудник</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 hidden sm:table-cell">
                      Роль
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-slate-500 hidden md:table-cell">
                      Орг-ции
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-slate-500">Активные</th>
                    <th className="text-center px-4 py-3 font-medium text-slate-500">Просрочено</th>
                    <th className="text-center px-4 py-3 font-medium text-slate-500 hidden md:table-cell">
                      Выполнено (30д)
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">
                      Ср. время
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">
                      Нагрузка
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.workload.map((w) => (
                    <tr key={w.userId} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-slate-900">{w.name}</td>
                      <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">
                        {w.roles
                          .map(
                            (r) =>
                              ({ admin: "Админ", manager: "Менеджер", accountant: "Бухгалтер" })[
                                r
                              ] || r,
                          )
                          .join(", ")}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600 hidden md:table-cell">
                        {w.orgCount || "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold ${
                            w.openTasks > 10
                              ? "bg-red-100 text-red-700"
                              : w.openTasks > 5
                                ? "bg-amber-100 text-amber-700"
                                : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {w.openTasks}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {w.overdueTasks > 0 ? (
                          <span className="inline-block min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                            {w.overdueTasks}
                          </span>
                        ) : (
                          <span className="text-slate-300">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600 hidden md:table-cell">
                        {w.doneLast30d}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600 hidden lg:table-cell">
                        {w.avgCompletionDays != null ? `${w.avgCompletionDays} дн.` : "—"}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <WorkloadBar value={w.openTasks} max={maxOpen} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "sections" && isAdmin && data.sectionProfitability && (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">Маржинальность участков</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Выручка vs ФОТ сотрудников участка (активные организации)
            </p>
          </div>
          {data.sectionProfitability.length === 0 ? (
            <div className="px-6 py-8 text-center text-slate-400 text-sm">Нет участков</div>
          ) : (
            <>
              {/* Visual bars */}
              <div className="px-6 py-4 space-y-3 border-b border-slate-100">
                {data.sectionProfitability.map((s) => {
                  const maxRev = Math.max(...data.sectionProfitability.map((x) => x.revenue), 1);
                  const revPct = (s.revenue / maxRev) * 100;
                  const payPct = (s.payroll / maxRev) * 100;
                  return (
                    <div key={s.sectionId}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-700">
                          №{s.number}
                          {s.name ? ` — ${s.name}` : ""}
                        </span>
                        <MarginBadge margin={s.margin} />
                      </div>
                      <div className="flex gap-1 items-center">
                        <div className="flex-1 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <div className="h-2.5 bg-[#6567F1]/20 rounded-full overflow-hidden flex-1">
                              <div
                                className="h-full bg-[#6567F1] rounded-full"
                                style={{ width: `${revPct}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-500 w-24 text-right tabular-nums">
                              {fmt(s.revenue)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-2.5 bg-red-100 rounded-full overflow-hidden flex-1">
                              <div
                                className="h-full bg-red-400 rounded-full"
                                style={{ width: `${payPct}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-500 w-24 text-right tabular-nums">
                              {fmt(s.payroll)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center gap-4 pt-2 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-2 rounded bg-[#6567F1]" /> Выручка
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-2 rounded bg-red-400" /> ФОТ
                  </span>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Участок</th>
                      <th className="text-center px-4 py-3 font-medium text-slate-500">Орг-ций</th>
                      <th className="text-right px-4 py-3 font-medium text-slate-500">Выручка</th>
                      <th className="text-right px-4 py-3 font-medium text-slate-500 hidden sm:table-cell">
                        ФОТ
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-slate-500 hidden md:table-cell">
                        Прибыль
                      </th>
                      <th className="text-center px-4 py-3 font-medium text-slate-500">Маржа</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sectionProfitability.map((s) => (
                      <tr
                        key={s.sectionId}
                        className="border-b border-slate-50 hover:bg-slate-50/50"
                      >
                        <td className="px-4 py-3 font-medium text-slate-900">
                          №{s.number}
                          {s.name ? ` — ${s.name}` : ""}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-600">{s.orgCount}</td>
                        <td className="px-4 py-3 text-right text-slate-900 font-medium tabular-nums">
                          {fmt(s.revenue)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 tabular-nums hidden sm:table-cell">
                          {fmt(s.payroll)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                          <span className={s.profit >= 0 ? "text-emerald-600" : "text-red-600"}>
                            {s.profit >= 0 ? "+" : ""}
                            {fmt(s.profit)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <MarginBadge margin={s.margin} />
                        </td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr className="bg-slate-50 font-semibold">
                      <td className="px-4 py-3 text-slate-700">Итого</td>
                      <td className="px-4 py-3 text-center text-slate-700">
                        {data.sectionProfitability.reduce((s, x) => s + x.orgCount, 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-900 tabular-nums">
                        {fmt(data.sectionProfitability.reduce((s, x) => s + x.revenue, 0))}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700 tabular-nums hidden sm:table-cell">
                        {fmt(data.sectionProfitability.reduce((s, x) => s + x.payroll, 0))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                        {(() => {
                          const total =
                            data.sectionProfitability.reduce((s, x) => s + x.revenue, 0) -
                            data.sectionProfitability.reduce((s, x) => s + x.payroll, 0);
                          return (
                            <span className={total >= 0 ? "text-emerald-600" : "text-red-600"}>
                              {total >= 0 ? "+" : ""}
                              {fmt(total)}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {(() => {
                          const totalRev = data.sectionProfitability.reduce(
                            (s, x) => s + x.revenue,
                            0,
                          );
                          const totalPay = data.sectionProfitability.reduce(
                            (s, x) => s + x.payroll,
                            0,
                          );
                          const m =
                            totalRev > 0
                              ? Math.round(((totalRev - totalPay) / totalRev) * 1000) / 10
                              : 0;
                          return <MarginBadge margin={m} />;
                        })()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "bottlenecks" && (
        <div className="space-y-6">
          {/* Overdue by category */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">Просрочки по категориям</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Незавершённые задачи с истёкшим дедлайном
              </p>
            </div>
            {data.bottlenecks.byCategory.length === 0 ? (
              <div className="px-6 py-8 text-center text-emerald-500 text-sm flex items-center justify-center gap-2">
                <TrendingUp size={16} /> Просроченных задач нет
              </div>
            ) : (
              <div className="px-6 py-4 space-y-3">
                {data.bottlenecks.byCategory.map((c) => {
                  const maxCount = Math.max(...data.bottlenecks.byCategory.map((x) => x.count), 1);
                  const pct = (c.count / maxCount) * 100;
                  return (
                    <div key={c.category}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-700">
                          {CATEGORY_LABELS[c.category] || c.category}
                        </span>
                        <span className="text-sm font-bold text-red-600">{c.count}</span>
                      </div>
                      <div className="h-2.5 bg-red-50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-red-400 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Overdue by section */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">Просрочки по участкам</h2>
            </div>
            {data.bottlenecks.bySection.length === 0 ? (
              <div className="px-6 py-8 text-center text-emerald-500 text-sm flex items-center justify-center gap-2">
                <TrendingUp size={16} /> Просроченных задач нет
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Участок</th>
                      <th className="text-center px-4 py-3 font-medium text-slate-500">
                        Просрочено
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bottlenecks.bySection.map((s) => (
                      <tr
                        key={s.sectionId}
                        className="border-b border-slate-50 hover:bg-slate-50/50"
                      >
                        <td className="px-4 py-3 font-medium text-slate-900">
                          №{s.number}
                          {s.name ? ` — ${s.name}` : ""}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-block min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                            {s.count}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Average completion time by category */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">
                Среднее время выполнения по категориям
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">За последние 90 дней</p>
            </div>
            {data.bottlenecks.avgByCategory.length === 0 ? (
              <div className="px-6 py-8 text-center text-slate-400 text-sm">
                Нет завершённых задач за период
              </div>
            ) : (
              <div className="px-6 py-4 space-y-3">
                {data.bottlenecks.avgByCategory.map((c) => {
                  const maxDays = Math.max(
                    ...data.bottlenecks.avgByCategory.map((x) => x.avgDays),
                    1,
                  );
                  const pct = (c.avgDays / maxDays) * 100;
                  return (
                    <div key={c.category}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-700">
                          {CATEGORY_LABELS[c.category] || c.category}
                          <span className="text-xs text-slate-400 ml-2">({c.count} задач)</span>
                        </span>
                        <span className="text-sm font-bold text-slate-900 flex items-center gap-1">
                          <Clock size={12} className="text-slate-400" />
                          {c.avgDays} дн.
                        </span>
                      </div>
                      <div className="h-2.5 bg-amber-50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function SummaryCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-5">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={18} />
        </div>
        <div>
          <p className="text-xl font-bold text-slate-900">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
