import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import {
  TrendingUp,
  DollarSign,
  Users,
  BarChart2,
  Percent,
  AlertCircle,
  RefreshCw,
  UserPlus,
  Map,
  Wallet,
  CreditCard,
  Banknote,
} from "lucide-react";
import {
  BarChart,
  Bar,
  Line,
  Area,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  MONTHS_RU,
  fmt,
  fmtShort,
  MarginBadge,
  calcGrowth,
  KpiCard,
  ExpensesBlock,
  IncomeBlock,
  tooltipStyle,
  tooltipLabelStyle,
  tooltipItemStyle,
  chartGridStroke,
  chartCursorFill,
} from "./ManagementPage.jsx";

export default function FinancePage() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();

  const [dashboard, setDashboard] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [sectionProfitability, setSectionProfitability] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!hasRole("admin") && !hasRole("supervisor")) {
      navigate("/");
      return;
    }
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, snapsRes, expsRes, incsRes, analyticsRes] = await Promise.all([
        api("/api/management/dashboard"),
        api("/api/management/snapshots"),
        api("/api/management/expenses"),
        api("/api/management/incomes"),
        api("/api/management/analytics"),
      ]);
      if (!dashRes.ok) throw new Error("Ошибка загрузки данных");
      const [dash, snaps, exps, incs, analytics] = await Promise.all([
        dashRes.json(),
        snapsRes.ok ? snapsRes.json() : Promise.resolve([]),
        expsRes.ok ? expsRes.json() : Promise.resolve([]),
        incsRes.ok ? incsRes.json() : Promise.resolve([]),
        analyticsRes.ok ? analyticsRes.json() : Promise.resolve(null),
      ]);
      setDashboard(dash);
      setSnapshots(snaps);
      setExpenses(exps);
      setIncomes(incs);
      setSectionProfitability(analytics?.sectionProfitability ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function reloadDashboard() {
    const res = await api("/api/management/dashboard");
    if (res.ok) setDashboard(await res.json());
  }

  async function captureSnapshot() {
    setCapturing(true);
    try {
      const res = await api("/api/management/snapshots/capture", { method: "POST" });
      if (!res.ok) throw new Error("Не удалось обновить снимок");
      const [snapsRes, dashRes] = await Promise.all([
        api("/api/management/snapshots"),
        api("/api/management/dashboard"),
      ]);
      const [snaps, dash] = await Promise.all([snapsRes.json(), dashRes.json()]);
      setSnapshots(snaps);
      setDashboard(dash);
    } catch (e) {
      alert(e.message);
    } finally {
      setCapturing(false);
    }
  }

  async function handleAddExpense(data) {
    const res = await api("/api/management/expenses", {
      method: "POST",
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Ошибка добавления расхода");
    const created = await res.json();
    setExpenses((prev) => [...prev, created]);
    await reloadDashboard();
  }

  async function handleDeleteExpense(id) {
    await api(`/api/management/expenses/${id}`, { method: "DELETE" });
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    await reloadDashboard();
  }

  async function handleUpdateExpense(id, data) {
    const res = await api(`/api/management/expenses/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Ошибка обновления расхода");
    const updated = await res.json();
    setExpenses((prev) => prev.map((e) => (e.id === id ? updated : e)));
    await reloadDashboard();
  }

  async function handleAddIncome(data) {
    const res = await api("/api/management/incomes", {
      method: "POST",
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Ошибка добавления дохода");
    const created = await res.json();
    setIncomes((prev) => [created, ...prev]);
    await reloadDashboard();
  }

  async function handleDeleteIncome(id) {
    await api(`/api/management/incomes/${id}`, { method: "DELETE" });
    setIncomes((prev) => prev.filter((i) => i.id !== id));
    await reloadDashboard();
  }

  async function handleUpdateIncome(id, data) {
    const res = await api(`/api/management/incomes/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Ошибка обновления дохода");
    const updated = await res.json();
    setIncomes((prev) => prev.map((i) => (i.id === id ? updated : i)));
    await reloadDashboard();
  }

  if (loading)
    return (
      <div className="flex items-center justify-center h-64 text-subtle text-sm">Загрузка...</div>
    );
  if (error)
    return (
      <div className="flex items-center gap-2 text-red-500 dark:text-red-400 p-4 text-sm">
        <AlertCircle size={18} />
        {error}
      </div>
    );
  if (!dashboard) return null;

  const prevSnap = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const growths = prevSnap
    ? {
        revenue: calcGrowth(dashboard.revenue.total, Number(prevSnap.totalRevenue)),
        profit: calcGrowth(dashboard.profit.gross, Number(prevSnap.grossProfit)),
        payroll: calcGrowth(dashboard.payroll.total, Number(prevSnap.payrollTotal)),
        margin: dashboard.profit.margin - Number(prevSnap.margin),
        avgCheck: calcGrowth(dashboard.revenue.avgCheck, Number(prevSnap.avgCheck)),
      }
    : {};

  const histData = snapshots.map((s) => ({
    label: `${MONTHS_RU[s.month - 1]} '${String(s.year).slice(2)}`,
    revenue: Number(s.totalRevenue),
    profit: Number(s.grossProfit),
    payroll: Number(s.payrollTotal),
    expenses: Number(s.recurringExpenses),
    margin: Number(s.margin),
    orgCount: s.orgCount,
    clientsNew: s.clientsNew,
  }));

  const orgFormChartData = dashboard.byOrgForm
    .filter((d) => d.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);
  const recurringExpenses = expenses.filter((e) => e.type === "RECURRING");
  const oneTimeExpenses = expenses.filter((e) => e.type === "ONE_TIME");
  const grossPositive = dashboard.profit.gross >= 0;
  const hasHistory = histData.length > 1;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-heading">Финансы</h1>
          {prevSnap && (
            <p className="text-xs text-subtle mt-0.5">
              Сравнение с {MONTHS_RU[prevSnap.month - 1]} {prevSnap.year}
            </p>
          )}
        </div>
        <button
          onClick={captureSnapshot}
          disabled={capturing}
          className="self-start flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg text-sm font-medium shadow-lg shadow-[#6567F1]/30 disabled:opacity-50 transition-all"
        >
          <RefreshCw size={15} className={capturing ? "animate-spin" : ""} />
          {capturing ? "Обновление..." : "Обновить снимок"}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <KpiCard
          icon={DollarSign}
          label="Выручка"
          value={fmt(dashboard.revenue.total)}
          sub={`${dashboard.revenue.orgCount} орг.`}
          growth={growths.revenue}
        />
        <KpiCard
          icon={BarChart2}
          label="Ср. чек"
          value={fmt(dashboard.revenue.avgCheck)}
          sub={`${dashboard.revenue.orgsWithPayment} с оплатой`}
          growth={growths.avgCheck}
        />
        <KpiCard
          icon={Users}
          label="ФОТ"
          value={fmt(dashboard.payroll.total)}
          sub={`${dashboard.payroll.staffCount} сотр.`}
          growth={growths.payroll}
        />
        <KpiCard
          icon={TrendingUp}
          label="Прибыль"
          value={fmt(dashboard.profit.gross)}
          sub="После ФОТ и пост. расходов"
          positive={grossPositive}
          growth={growths.profit}
        />
        <div className="col-span-2 md:col-span-1 lg:col-span-1">
          <KpiCard
            icon={Percent}
            label="Маржа"
            value={`${dashboard.profit.margin.toFixed(1)}%`}
            positive={grossPositive}
            growth={growths.margin}
            absoluteGrowth
          />
        </div>
      </div>

      {/* Clients KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard icon={Users} label="Активных клиентов" value={dashboard.clients.active} />
        <KpiCard
          icon={UserPlus}
          label="Новых в этом месяце"
          value={dashboard.clients.new}
          positive={dashboard.clients.new > 0}
        />
        <KpiCard
          icon={DollarSign}
          label="Пост. расходы"
          value={fmt(dashboard.expenses.recurringTotal)}
        />
        <KpiCard
          icon={DollarSign}
          label="Разовые доходы"
          value={fmt(dashboard.incomes.total)}
          positive={dashboard.incomes.total > 0}
        />
      </div>

      {/* Payment destinations */}
      {dashboard.byPaymentDest && (
        <div className="bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-4">
            <Wallet size={18} className="text-primary" />
            <h2 className="text-base font-semibold text-heading">Куда поступают платежи</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {[
              {
                key: "BANK_TOCHKA",
                label: "Банк (Точка)",
                icon: Banknote,
                color: "text-emerald-600 dark:text-emerald-300",
                bg: "bg-emerald-50 dark:bg-emerald-500/15",
                ring: "hover:ring-emerald-300",
                link: "/payments",
              },
              {
                key: "CARD",
                label: "Карта",
                icon: CreditCard,
                color: "text-blue-600 dark:text-blue-300",
                bg: "bg-blue-50 dark:bg-blue-500/15",
                ring: "hover:ring-blue-300",
                link: "/payments?tab=cashcard",
              },
              {
                key: "CASH",
                label: "Наличные",
                icon: DollarSign,
                color: "text-amber-600 dark:text-amber-300",
                bg: "bg-amber-50 dark:bg-amber-500/15",
                ring: "hover:ring-amber-300",
                link: "/payments?tab=cashcard",
              },
            ].map(({ key, label, icon: Icon, color, bg, ring, link }) => {
              const item = dashboard.byPaymentDest.find((d) => d.destination === key);
              const revenue = item?.revenue ?? 0;
              const count = item?.count ?? 0;
              return (
                <div
                  key={key}
                  className={`${bg} rounded-xl p-3 sm:p-4 cursor-pointer hover:ring-2 ${ring} transition-all flex sm:block items-center gap-3`}
                  onClick={() => navigate(link)}
                >
                  <div
                    className={`shrink-0 p-2 rounded-lg bg-white/50 dark:bg-white/5 sm:bg-transparent sm:dark:bg-transparent sm:p-0 ${color}`}
                  >
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex sm:block items-baseline justify-between gap-2 sm:mb-2">
                      <span className="text-sm font-medium text-body">{label}</span>
                      <span className="text-xs text-subtle sm:hidden">{count} орг.</span>
                    </div>
                    <div className={`text-base sm:text-lg font-bold tabular-nums ${color}`}>
                      {revenue.toLocaleString("ru-RU")} ₽
                    </div>
                    <div className="hidden sm:block text-xs text-subtle mt-1">{count} орг.</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Debt block */}
      {dashboard.debt.total > 0 && (
        <div className="bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle size={18} className="text-red-500 dark:text-red-400" />
            <h2 className="text-base font-semibold text-heading">
              Долг клиентов:{" "}
              <span className="text-red-500 dark:text-red-400">{fmt(dashboard.debt.total)}</span>
            </h2>
          </div>
          {dashboard.debt.topDebtors.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-subtle border-b border-line">
                    <th className="pb-2 font-medium">Организация</th>
                    <th className="pb-2 font-medium text-right">Долг</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {dashboard.debt.topDebtors.map((d) => (
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
      )}

      {/* Charts row — current period */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="relative bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-5 overflow-hidden">
          <div
            className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-40 dark:opacity-30 blur-3xl"
            style={{
              background: "radial-gradient(circle, #a855f7 0%, transparent 70%)",
            }}
          />
          <h2 className="relative text-base font-semibold text-heading mb-4">Динамика выручки</h2>
          {histData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-subtle text-sm">
              Данные появятся после первого сохранения снимка
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={histData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity={0.95} />
                    <stop offset="50%" stopColor="#6567F1" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#6567F1" stopOpacity={0.55} />
                  </linearGradient>
                  <filter id="revGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feFlood floodColor="#6567F1" floodOpacity="0.55" />
                    <feComposite in2="blur" operator="in" result="glow" />
                    <feMerge>
                      <feMergeNode in="glow" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <filter id="revGlowHover" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="8" result="blur" />
                    <feFlood floodColor="#a855f7" floodOpacity="0.9" />
                    <feComposite in2="blur" operator="in" result="glow" />
                    <feMerge>
                      <feMergeNode in="glow" />
                      <feMergeNode in="glow" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={fmtShort}
                  width={52}
                />
                <Tooltip
                  formatter={(v) => [fmt(v), "Выручка"]}
                  contentStyle={tooltipStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                  cursor={chartCursorFill}
                />
                <Bar
                  dataKey="revenue"
                  fill="url(#revGrad)"
                  radius={[8, 8, 0, 0]}
                  filter="url(#revGlow)"
                  animationDuration={900}
                  animationEasing="ease-out"
                  activeBar={{ filter: "url(#revGlowHover)", fill: "url(#revGrad)" }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="relative bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-5 overflow-hidden">
          <div
            className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-40 dark:opacity-30 blur-3xl"
            style={{ background: "radial-gradient(circle, #06b6d4 0%, transparent 70%)" }}
          />
          <h2 className="relative text-base font-semibold text-heading mb-4">
            Структура по форме организации
          </h2>
          {orgFormChartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-subtle text-sm">
              Нет данных
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={orgFormChartData}
                layout="vertical"
                margin={{ top: 4, right: 14, left: 4, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="orgFormGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#5557E1" stopOpacity={0.55} />
                    <stop offset="50%" stopColor="#6567F1" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.95} />
                  </linearGradient>
                  <filter id="orgFormGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feFlood floodColor="#06b6d4" floodOpacity="0.55" />
                    <feComposite in2="blur" operator="in" result="glow" />
                    <feMerge>
                      <feMergeNode in="glow" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <filter id="orgFormGlowHover" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="8" result="blur" />
                    <feFlood floodColor="#06b6d4" floodOpacity="0.9" />
                    <feComposite in2="blur" operator="in" result="glow" />
                    <feMerge>
                      <feMergeNode in="glow" />
                      <feMergeNode in="glow" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={fmtShort}
                />
                <YAxis
                  type="category"
                  dataKey="form"
                  tick={{ fontSize: 12, fill: "#475569" }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                <Tooltip
                  formatter={(v, _n, props) => [
                    `${fmt(v)} (${props.payload.count} орг.)`,
                    "Выручка",
                  ]}
                  contentStyle={tooltipStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                  cursor={chartCursorFill}
                />
                <Bar
                  dataKey="revenue"
                  fill="url(#orgFormGrad)"
                  radius={[0, 8, 8, 0]}
                  filter="url(#orgFormGlow)"
                  animationDuration={900}
                  animationEasing="ease-out"
                  activeBar={{ filter: "url(#orgFormGlowHover)", fill: "url(#orgFormGrad)" }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Historical analytics */}
      {hasHistory && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-heading border-t border-line pt-4">
            История показателей
          </h2>

          <div className="relative bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-5 overflow-hidden">
            <div
              className="pointer-events-none absolute -top-12 -right-12 w-56 h-56 rounded-full opacity-40 dark:opacity-30 blur-3xl"
              style={{ background: "radial-gradient(circle, #10b981 0%, transparent 70%)" }}
            />
            <div
              className="pointer-events-none absolute -bottom-16 -left-16 w-56 h-56 rounded-full opacity-30 dark:opacity-25 blur-3xl"
              style={{ background: "radial-gradient(circle, #a855f7 0%, transparent 70%)" }}
            />
            <h3 className="relative text-sm font-semibold text-body mb-4">Выручка и прибыль</h3>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={histData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="rpRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#6567F1" stopOpacity={0.5} />
                  </linearGradient>
                  <linearGradient id="rpProfitGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                  <filter id="rpRevGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feFlood floodColor="#6567F1" floodOpacity="0.55" />
                    <feComposite in2="blur" operator="in" result="glow" />
                    <feMerge>
                      <feMergeNode in="glow" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <filter id="rpRevGlowHover" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="8" result="blur" />
                    <feFlood floodColor="#a855f7" floodOpacity="0.9" />
                    <feComposite in2="blur" operator="in" result="glow" />
                    <feMerge>
                      <feMergeNode in="glow" />
                      <feMergeNode in="glow" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <filter id="rpProfitGlow" x="-20%" y="-50%" width="140%" height="200%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feFlood floodColor="#10b981" floodOpacity="0.75" />
                    <feComposite in2="blur" operator="in" result="glow" />
                    <feMerge>
                      <feMergeNode in="glow" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={fmtShort}
                  width={52}
                />
                <Tooltip
                  formatter={(v, name) => [fmt(v), name === "revenue" ? "Выручка" : "Прибыль"]}
                  contentStyle={tooltipStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                  cursor={chartCursorFill}
                />
                <Legend
                  formatter={(v) => (v === "revenue" ? "Выручка" : "Прибыль")}
                  iconSize={10}
                  wrapperStyle={{ fontSize: 12 }}
                />
                <Bar
                  dataKey="revenue"
                  fill="url(#rpRevGrad)"
                  radius={[8, 8, 0, 0]}
                  filter="url(#rpRevGlow)"
                  animationDuration={900}
                  activeBar={{ filter: "url(#rpRevGlowHover)", fill: "url(#rpRevGrad)" }}
                />
                <Line
                  dataKey="profit"
                  stroke="url(#rpProfitGrad)"
                  strokeWidth={2.5}
                  filter="url(#rpProfitGlow)"
                  dot={{ r: 3, fill: "#10b981", stroke: "#fff", strokeWidth: 1 }}
                  activeDot={{
                    r: 6,
                    fill: "#10b981",
                    stroke: "#10b981",
                    strokeOpacity: 0.4,
                    strokeWidth: 8,
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="relative bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-5 overflow-hidden">
              <div
                className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-40 dark:opacity-30 blur-3xl"
                style={{ background: "radial-gradient(circle, #f59e0b 0%, transparent 70%)" }}
              />
              <h3 className="relative text-sm font-semibold text-body mb-4">
                Выручка vs ФОТ vs Расходы
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={histData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="vsRevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a855f7" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#6567F1" stopOpacity={0.55} />
                    </linearGradient>
                    <linearGradient id="vsPayGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.55} />
                    </linearGradient>
                    <linearGradient id="vsExpGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fb7185" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#f87171" stopOpacity={0.55} />
                    </linearGradient>
                    {[
                      { id: "vsRevGlow", color: "#6567F1" },
                      { id: "vsPayGlow", color: "#f59e0b" },
                      { id: "vsExpGlow", color: "#f87171" },
                    ].map(({ id, color }) => (
                      <filter key={id} id={id} x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="2.5" result="blur" />
                        <feFlood floodColor={color} floodOpacity="0.6" />
                        <feComposite in2="blur" operator="in" result="glow" />
                        <feMerge>
                          <feMergeNode in="glow" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    ))}
                    {[
                      { id: "vsRevGlowHover", color: "#a855f7" },
                      { id: "vsPayGlowHover", color: "#fbbf24" },
                      { id: "vsExpGlowHover", color: "#fb7185" },
                    ].map(({ id, color }) => (
                      <filter key={id} id={id} x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="7" result="blur" />
                        <feFlood floodColor={color} floodOpacity="0.9" />
                        <feComposite in2="blur" operator="in" result="glow" />
                        <feMerge>
                          <feMergeNode in="glow" />
                          <feMergeNode in="glow" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={fmtShort}
                    width={52}
                  />
                  <Tooltip
                    formatter={(v, name) => [
                      fmt(v),
                      name === "revenue" ? "Выручка" : name === "payroll" ? "ФОТ" : "Пост. расходы",
                    ]}
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                    cursor={chartCursorFill}
                  />
                  <Legend
                    formatter={(v) =>
                      v === "revenue" ? "Выручка" : v === "payroll" ? "ФОТ" : "Пост. расходы"
                    }
                    iconSize={10}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Bar
                    dataKey="revenue"
                    fill="url(#vsRevGrad)"
                    radius={[6, 6, 0, 0]}
                    filter="url(#vsRevGlow)"
                    activeBar={{ filter: "url(#vsRevGlowHover)", fill: "url(#vsRevGrad)" }}
                  />
                  <Bar
                    dataKey="payroll"
                    fill="url(#vsPayGrad)"
                    radius={[6, 6, 0, 0]}
                    filter="url(#vsPayGlow)"
                    activeBar={{ filter: "url(#vsPayGlowHover)", fill: "url(#vsPayGrad)" }}
                  />
                  <Bar
                    dataKey="expenses"
                    fill="url(#vsExpGrad)"
                    radius={[6, 6, 0, 0]}
                    filter="url(#vsExpGlow)"
                    activeBar={{ filter: "url(#vsExpGlowHover)", fill: "url(#vsExpGrad)" }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="relative bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-5 overflow-hidden">
              <div
                className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-40 dark:opacity-30 blur-3xl"
                style={{ background: "radial-gradient(circle, #a855f7 0%, transparent 70%)" }}
              />
              <h3 className="relative text-sm font-semibold text-body mb-4">Маржинальность %</h3>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={histData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="marginLineGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#a855f7" />
                      <stop offset="100%" stopColor="#6567F1" />
                    </linearGradient>
                    <linearGradient id="marginAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6567F1" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#6567F1" stopOpacity={0} />
                    </linearGradient>
                    <filter id="marginGlow" x="-20%" y="-50%" width="140%" height="200%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feFlood floodColor="#a855f7" floodOpacity="0.75" />
                      <feComposite in2="blur" operator="in" result="glow" />
                      <feMerge>
                        <feMergeNode in="glow" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v.toFixed(0)}%`}
                    width={44}
                  />
                  <Tooltip
                    formatter={(v) => [`${Number(v).toFixed(1)}%`, "Маржа"]}
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                  />
                  <Area
                    dataKey="margin"
                    stroke="none"
                    fill="url(#marginAreaGrad)"
                    isAnimationActive={false}
                  />
                  <Line
                    dataKey="margin"
                    stroke="url(#marginLineGrad)"
                    strokeWidth={2.5}
                    filter="url(#marginGlow)"
                    dot={{ r: 3, fill: "#6567F1", stroke: "#fff", strokeWidth: 1 }}
                    activeDot={{
                      r: 6,
                      fill: "#a855f7",
                      stroke: "#a855f7",
                      strokeOpacity: 0.4,
                      strokeWidth: 8,
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="relative bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-5 overflow-hidden">
            <div
              className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-40 dark:opacity-30 blur-3xl"
              style={{ background: "radial-gradient(circle, #06b6d4 0%, transparent 70%)" }}
            />
            <h3 className="relative text-sm font-semibold text-body mb-4">Клиентская база</h3>
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={histData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="newClientsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.5} />
                  </linearGradient>
                  <linearGradient id="orgCountLineGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#a855f7" />
                    <stop offset="100%" stopColor="#6567F1" />
                  </linearGradient>
                  <filter id="newClientsGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2.5" result="blur" />
                    <feFlood floodColor="#06b6d4" floodOpacity="0.55" />
                    <feComposite in2="blur" operator="in" result="glow" />
                    <feMerge>
                      <feMergeNode in="glow" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <filter id="newClientsGlowHover" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="7" result="blur" />
                    <feFlood floodColor="#22d3ee" floodOpacity="0.9" />
                    <feComposite in2="blur" operator="in" result="glow" />
                    <feMerge>
                      <feMergeNode in="glow" />
                      <feMergeNode in="glow" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <filter id="orgCountGlow" x="-20%" y="-50%" width="140%" height="200%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feFlood floodColor="#6567F1" floodOpacity="0.7" />
                    <feComposite in2="blur" operator="in" result="glow" />
                    <feMerge>
                      <feMergeNode in="glow" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                  allowDecimals={false}
                />
                <Tooltip
                  formatter={(v, name) => [
                    v,
                    name === "orgCount" ? "Активных клиентов" : "Новых за месяц",
                  ]}
                  contentStyle={tooltipStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                  cursor={chartCursorFill}
                />
                <Legend
                  formatter={(v) => (v === "orgCount" ? "Активных клиентов" : "Новых за месяц")}
                  iconSize={10}
                  wrapperStyle={{ fontSize: 12 }}
                />
                <Bar
                  dataKey="clientsNew"
                  fill="url(#newClientsGrad)"
                  radius={[6, 6, 0, 0]}
                  filter="url(#newClientsGlow)"
                  activeBar={{ filter: "url(#newClientsGlowHover)", fill: "url(#newClientsGrad)" }}
                />
                <Line
                  dataKey="orgCount"
                  stroke="url(#orgCountLineGrad)"
                  strokeWidth={2.5}
                  filter="url(#orgCountGlow)"
                  dot={{ r: 3, fill: "#6567F1", stroke: "#fff", strokeWidth: 1 }}
                  activeDot={{
                    r: 6,
                    fill: "#a855f7",
                    stroke: "#a855f7",
                    strokeOpacity: 0.4,
                    strokeWidth: 8,
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-body mb-4">Таблица истории</h3>

            {/* Mobile: card list per period */}
            <div className="sm:hidden -mx-4 divide-y divide-line border-t border-line">
              {[...snapshots].reverse().map((s) => {
                const gross = Number(s.grossProfit);
                const isPos = gross >= 0;
                return (
                  <div key={s.id} className="px-4 py-3">
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-sm font-semibold text-heading">
                        {MONTHS_RU[s.month - 1]} {s.year}
                      </span>
                      <span
                        className={`text-xs font-medium ${isPos ? "text-emerald-600 dark:text-emerald-300" : "text-red-500 dark:text-red-400"}`}
                      >
                        {Number(s.margin).toFixed(1)}% маржа
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <div className="text-subtle">Выручка</div>
                      <div className="text-right text-heading tabular-nums">
                        {fmt(Number(s.totalRevenue))}
                      </div>
                      <div className="text-subtle">ФОТ</div>
                      <div className="text-right tabular-nums text-amber-600 dark:text-amber-300">
                        {fmt(Number(s.payrollTotal))}
                      </div>
                      <div className="text-subtle">Пост. расходы</div>
                      <div className="text-right tabular-nums text-red-400">
                        {fmt(Number(s.recurringExpenses))}
                      </div>
                      <div className="text-subtle">Прибыль</div>
                      <div
                        className={`text-right font-medium tabular-nums ${isPos ? "text-emerald-600 dark:text-emerald-300" : "text-red-500 dark:text-red-400"}`}
                      >
                        {fmt(gross)}
                      </div>
                      <div className="text-subtle">Клиентов</div>
                      <div className="text-right text-body tabular-nums">
                        {s.orgCount}{" "}
                        <span className="text-primary">
                          {s.clientsNew > 0 ? `(+${s.clientsNew})` : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* sm+: full table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-subtle border-b border-line">
                    <th className="pb-2 font-medium pr-4">Период</th>
                    <th className="pb-2 font-medium text-right pr-4">Выручка</th>
                    <th className="pb-2 font-medium text-right pr-4">ФОТ</th>
                    <th className="pb-2 font-medium text-right pr-4">Пост. расходы</th>
                    <th className="pb-2 font-medium text-right pr-4">Прибыль</th>
                    <th className="pb-2 font-medium text-right pr-4">Маржа</th>
                    <th className="pb-2 font-medium text-right pr-4">Клиентов</th>
                    <th className="pb-2 font-medium text-right">Новых</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...snapshots].reverse().map((s) => {
                    const gross = Number(s.grossProfit);
                    const isPos = gross >= 0;
                    return (
                      <tr key={s.id} className="hover:bg-canvas transition-colors">
                        <td className="py-2.5 pr-4 text-body font-medium whitespace-nowrap">
                          {MONTHS_RU[s.month - 1]} {s.year}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-heading">
                          {fmt(Number(s.totalRevenue))}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-amber-600 dark:text-amber-300">
                          {fmt(Number(s.payrollTotal))}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-red-400">
                          {fmt(Number(s.recurringExpenses))}
                        </td>
                        <td
                          className={`py-2.5 pr-4 text-right font-medium ${isPos ? "text-emerald-600 dark:text-emerald-300" : "text-red-500 dark:text-red-400"}`}
                        >
                          {fmt(gross)}
                        </td>
                        <td
                          className={`py-2.5 pr-4 text-right ${isPos ? "text-emerald-600 dark:text-emerald-300" : "text-red-500 dark:text-red-400"}`}
                        >
                          {Number(s.margin).toFixed(1)}%
                        </td>
                        <td className="py-2.5 pr-4 text-right text-body">{s.orgCount}</td>
                        <td className="py-2.5 text-right text-primary">+{s.clientsNew}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Section profitability */}
      {sectionProfitability.length > 0 && (
        <div className="bg-surface rounded-2xl shadow-lg border border-line overflow-hidden">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-line flex items-center gap-2">
            <Map size={16} className="text-subtle shrink-0" />
            <h2 className="text-sm sm:text-base font-semibold text-heading">
              Маржинальность участков
            </h2>
            <span className="hidden sm:inline text-xs text-subtle ml-1">
              Выручка vs ФОТ (активные организации)
            </span>
          </div>
          <div className="relative px-4 sm:px-6 py-4 space-y-3 border-b border-line overflow-hidden">
            <div
              className="pointer-events-none absolute -top-12 -right-12 w-56 h-56 rounded-full opacity-30 dark:opacity-25 blur-3xl"
              style={{ background: "radial-gradient(circle, #a855f7 0%, transparent 70%)" }}
            />
            <div
              className="pointer-events-none absolute -bottom-16 -left-16 w-56 h-56 rounded-full opacity-25 dark:opacity-20 blur-3xl"
              style={{ background: "radial-gradient(circle, #fb7185 0%, transparent 70%)" }}
            />
            {sectionProfitability.map((s) => {
              const maxRev = Math.max(...sectionProfitability.map((x) => x.revenue), 1);
              const revPct = (s.revenue / maxRev) * 100;
              const payPct = (s.payroll / maxRev) * 100;
              return (
                <div key={s.sectionId} className="relative group">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-body">
                      №{s.number}
                      {s.name ? ` — ${s.name}` : ""}
                    </span>
                    <MarginBadge margin={s.margin} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 bg-primary/10 dark:bg-primary/15 rounded-full overflow-visible flex-1 relative">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${revPct}%`,
                            background:
                              "linear-gradient(90deg, #a855f7 0%, #6567F1 60%, #06b6d4 100%)",
                            boxShadow:
                              "0 0 8px rgba(101,103,241,0.55), 0 0 16px rgba(168,85,247,0.35)",
                          }}
                        />
                      </div>
                      <span className="text-xs text-subtle w-20 sm:w-24 text-right tabular-nums">
                        {fmt(s.revenue)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 bg-red-100/60 dark:bg-red-500/10 rounded-full overflow-visible flex-1 relative">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${payPct}%`,
                            background:
                              "linear-gradient(90deg, #fbbf24 0%, #fb7185 60%, #ef4444 100%)",
                            boxShadow:
                              "0 0 8px rgba(251,113,133,0.55), 0 0 16px rgba(239,68,68,0.35)",
                          }}
                        />
                      </div>
                      <span className="text-xs text-subtle w-20 sm:w-24 text-right tabular-nums">
                        {fmt(s.payroll)}
                      </span>
                    </div>
                  </div>
                  <div
                    className="pointer-events-none absolute inset-x-0 -inset-y-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                      background:
                        "linear-gradient(90deg, rgba(168,85,247,0.06) 0%, rgba(101,103,241,0.06) 50%, rgba(6,182,212,0.06) 100%)",
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/50">
                  <th className="text-left px-4 py-3 font-medium text-subtle">Участок</th>
                  <th className="text-center px-4 py-3 font-medium text-subtle">Орг-ций</th>
                  <th className="text-right px-4 py-3 font-medium text-subtle">Выручка</th>
                  <th className="text-right px-4 py-3 font-medium text-subtle hidden sm:table-cell">
                    ФОТ
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-subtle hidden md:table-cell">
                    Прибыль
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-subtle">Маржа</th>
                </tr>
              </thead>
              <tbody>
                {sectionProfitability.map((s) => (
                  <tr key={s.sectionId} className="border-b border-line hover:bg-canvas/50">
                    <td className="px-4 py-3 font-medium text-heading">
                      №{s.number}
                      {s.name ? ` — ${s.name}` : ""}
                    </td>
                    <td className="px-4 py-3 text-center text-body">{s.orgCount}</td>
                    <td className="px-4 py-3 text-right text-heading font-medium tabular-nums">
                      {fmt(s.revenue)}
                    </td>
                    <td className="px-4 py-3 text-right text-body tabular-nums hidden sm:table-cell">
                      {fmt(s.payroll)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                      <span
                        className={
                          s.profit >= 0
                            ? "text-emerald-600 dark:text-emerald-300"
                            : "text-red-600 dark:text-red-300"
                        }
                      >
                        {s.profit >= 0 ? "+" : ""}
                        {fmt(s.profit)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <MarginBadge margin={s.margin} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Expenses & Incomes */}
      <div className="bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-5">
        <h2 className="text-base font-semibold text-heading mb-4 sm:mb-5">Расходы и доходы</h2>
        <div className="flex gap-6 sm:gap-8 flex-col sm:flex-row">
          <ExpensesBlock
            title="Постоянные расходы"
            type="RECURRING"
            expenses={recurringExpenses}
            onAdd={handleAddExpense}
            onDelete={handleDeleteExpense}
            onUpdate={handleUpdateExpense}
          />
          <div className="hidden sm:block w-px bg-muted self-stretch" />
          <ExpensesBlock
            title="Разовые расходы"
            type="ONE_TIME"
            expenses={oneTimeExpenses}
            onAdd={handleAddExpense}
            onDelete={handleDeleteExpense}
            onUpdate={handleUpdateExpense}
          />
          <div className="hidden sm:block w-px bg-muted self-stretch" />
          <IncomeBlock
            incomes={incomes}
            onAdd={handleAddIncome}
            onDelete={handleDeleteIncome}
            onUpdate={handleUpdateIncome}
          />
        </div>
      </div>
    </div>
  );
}
