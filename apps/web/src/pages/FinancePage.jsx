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
} from "lucide-react";
import { MONTHS_RU, fmt, calcGrowth, KpiCard } from "../components/finance/financeShared.jsx";
import ExpensesBlock from "../components/finance/ExpensesBlock.jsx";
import IncomeBlock from "../components/finance/IncomeBlock.jsx";
import { RevenueHistoryChart, OrgFormChart } from "../components/finance/FinanceCharts.jsx";
import FinanceHistorySection from "../components/finance/FinanceHistorySection.jsx";
import SectionProfitabilityBlock from "../components/finance/SectionProfitabilityBlock.jsx";
import PaymentDestCards from "../components/finance/PaymentDestCards.jsx";
import DebtBlock from "../components/finance/DebtBlock.jsx";

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

      <PaymentDestCards byPaymentDest={dashboard.byPaymentDest} />

      <DebtBlock debt={dashboard.debt} />

      {/* Charts row — current period */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RevenueHistoryChart histData={histData} />
        <OrgFormChart data={orgFormChartData} />
      </div>

      {hasHistory && <FinanceHistorySection histData={histData} snapshots={snapshots} />}

      <SectionProfitabilityBlock sectionProfitability={sectionProfitability} />

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
