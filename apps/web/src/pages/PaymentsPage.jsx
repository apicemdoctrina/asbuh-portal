import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import {
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Check,
  X as XIcon,
  Link2,
  EyeOff,
  Loader2,
  AlertCircle,
  DollarSign,
  TrendingUp,
  Clock,
  Filter,
  Calculator,
} from "lucide-react";

const MATCH_STATUS_LABELS = {
  UNMATCHED: "Не сопоставлен",
  AUTO: "Авто",
  MANUAL: "Вручную",
  IGNORED: "Игнорируется",
};
const MATCH_STATUS_COLORS = {
  UNMATCHED: "bg-amber-100 text-amber-700",
  AUTO: "bg-green-100 text-green-700",
  MANUAL: "bg-blue-100 text-blue-700",
  IGNORED: "bg-slate-100 text-slate-500",
};

const PERIOD_STATUS_LABELS = {
  PENDING: "Ожидание",
  PAID: "Оплачено",
  PARTIAL: "Частично",
  OVERDUE: "Просрочено",
};
const PERIOD_STATUS_COLORS = {
  PENDING: "bg-slate-100 text-slate-600",
  PAID: "bg-green-100 text-green-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  OVERDUE: "bg-red-100 text-red-700",
};

const MONTHS = [
  "",
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

function fmt(val) {
  if (val == null) return "—";
  return Number(val).toLocaleString("ru-RU") + " ₽";
}

// ─── Tab: Transactions ───────────────────────────────────────────────────────

function TransactionsTab() {
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [matchFilter, setMatchFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState([]);
  const [matchingId, setMatchingId] = useState(null);
  const [matchOrgId, setMatchOrgId] = useState("");
  const limit = 50;

  const fetchTx = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (matchFilter) params.set("matchStatus", matchFilter);
      const res = await api(`/api/payments/transactions?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTransactions(data.transactions);
      setTotal(data.total);
    } catch {
      /* */
    } finally {
      setLoading(false);
    }
  }, [page, search, matchFilter]);

  useEffect(() => {
    fetchTx();
  }, [fetchTx]);

  useEffect(() => {
    api("/api/organizations?limit=1000")
      .then((r) => (r.ok ? r.json() : { organizations: [] }))
      .then((d) => setOrgs(d.organizations || []))
      .catch(() => {});
  }, []);

  async function handleMatch(txId) {
    if (!matchOrgId) return;
    await api(`/api/payments/transactions/${txId}/match`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: matchOrgId }),
    });
    setMatchingId(null);
    setMatchOrgId("");
    fetchTx();
  }

  async function handleIgnore(txId) {
    await api(`/api/payments/transactions/${txId}/ignore`, { method: "PUT" });
    fetchTx();
  }

  async function handleUnmatch(txId) {
    await api(`/api/payments/transactions/${txId}/match`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: null }),
    });
    fetchTx();
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск по плательщику, ИНН, назначению..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-80 pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
          />
        </div>
        <div className="relative">
          <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={matchFilter}
            onChange={(e) => {
              setMatchFilter(e.target.value);
              setPage(1);
            }}
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] bg-white"
          >
            <option value="">Все статусы</option>
            {Object.entries(MATCH_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-slate-400 text-sm py-8 text-center">Транзакции не найдены</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-4 py-3 font-medium text-slate-500">Дата</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">Сумма</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">Плательщик</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">ИНН</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">Назначение</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">Организация</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">Статус</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {new Date(tx.date).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-medium text-green-600">
                    +{fmt(tx.amount)}
                  </td>
                  <td className="px-4 py-3 max-w-[200px] truncate">{tx.payerName || "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{tx.payerInn || "—"}</td>
                  <td className="px-4 py-3 max-w-[250px] truncate text-slate-500">
                    {tx.purpose || "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {matchingId === tx.id ? (
                      <div className="flex items-center gap-1">
                        <select
                          value={matchOrgId}
                          onChange={(e) => setMatchOrgId(e.target.value)}
                          className="px-2 py-1 border border-slate-200 rounded text-xs bg-white max-w-[180px]"
                          autoFocus
                        >
                          <option value="">Выбрать...</option>
                          {orgs.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleMatch(tx.id)}
                          className="p-1 text-green-600 hover:bg-green-50 rounded"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => {
                            setMatchingId(null);
                            setMatchOrgId("");
                          }}
                          className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                        >
                          <XIcon size={14} />
                        </button>
                      </div>
                    ) : tx.organization ? (
                      <span className="text-[#6567F1] text-xs">{tx.organization.name}</span>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${MATCH_STATUS_COLORS[tx.matchStatus]}`}
                    >
                      {MATCH_STATUS_LABELS[tx.matchStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      {tx.matchStatus === "UNMATCHED" && (
                        <>
                          <button
                            onClick={() => {
                              setMatchingId(tx.id);
                              setMatchOrgId("");
                            }}
                            className="p-1 text-[#6567F1] hover:bg-[#6567F1]/10 rounded"
                            title="Привязать"
                          >
                            <Link2 size={14} />
                          </button>
                          <button
                            onClick={() => handleIgnore(tx.id)}
                            className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                            title="Игнорировать"
                          >
                            <EyeOff size={14} />
                          </button>
                        </>
                      )}
                      {(tx.matchStatus === "AUTO" || tx.matchStatus === "MANUAL") && (
                        <button
                          onClick={() => handleUnmatch(tx.id)}
                          className="p-1 text-red-400 hover:bg-red-50 rounded"
                          title="Отвязать"
                        >
                          <XIcon size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">
            {(page - 1) * limit + 1}–{Math.min(page * limit, total)} из {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-slate-600">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Reconciliation ─────────────────────────────────────────────────────

function ReconciliationTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [statusFilter, setStatusFilter] = useState("");
  const [periods, setPeriods] = useState([]);
  const [summary, setSummary] = useState({ expected: 0, received: 0, debt: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const limit = 50;

  const fetchPeriods = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
        page: String(page),
        limit: String(limit),
      });
      if (statusFilter) params.set("status", statusFilter);
      const res = await api(`/api/payments/reconciliation?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPeriods(data.periods);
      setTotal(data.total);
      setSummary(data.summary);
    } catch {
      /* */
    } finally {
      setLoading(false);
    }
  }, [year, month, statusFilter, page]);

  useEffect(() => {
    fetchPeriods();
  }, [fetchPeriods]);

  async function handleReconcile() {
    setReconciling(true);
    try {
      await api("/api/payments/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month }),
      });
      fetchPeriods();
    } catch {
      /* */
    } finally {
      setReconciling(false);
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
        <select
          value={month}
          onChange={(e) => {
            setMonth(Number(e.target.value));
            setPage(1);
          }}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
        >
          {MONTHS.slice(1).map((m, i) => (
            <option key={i + 1} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => {
            setYear(Number(e.target.value));
            setPage(1);
          }}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
        >
          {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
        >
          <option value="">Все статусы</option>
          {Object.entries(PERIOD_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button
          onClick={handleReconcile}
          disabled={reconciling}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white rounded-lg text-sm font-medium shadow-lg shadow-[#6567F1]/30 hover:from-[#5557E1] hover:to-[#4547D1] disabled:opacity-50"
        >
          <Calculator size={16} className={reconciling ? "animate-spin" : ""} />
          Пересчитать
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <DollarSign size={14} />
            Ожидалось
          </div>
          <div className="text-lg font-bold text-slate-900">{fmt(summary.expected)}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <TrendingUp size={14} />
            Поступило
          </div>
          <div className="text-lg font-bold text-green-600">{fmt(summary.received)}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <AlertCircle size={14} />
            Задолженность
          </div>
          <div
            className={`text-lg font-bold ${summary.debt > 0 ? "text-red-600" : "text-slate-900"}`}
          >
            {fmt(summary.debt)}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : periods.length === 0 ? (
        <div className="text-slate-400 text-sm py-8 text-center">
          Нет данных. Нажмите «Пересчитать» для создания сверки.
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-4 py-3 font-medium text-slate-500">Организация</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">ИНН</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500">Ожидалось</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500">Поступило</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500">Долг</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">Статус</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-slate-900">{p.organization?.name}</td>
                  <td className="px-4 py-3 text-slate-500">{p.organization?.inn || "—"}</td>
                  <td className="px-4 py-3 text-right">{fmt(p.expected)}</td>
                  <td className="px-4 py-3 text-right text-green-600 font-medium">
                    {fmt(p.received)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-medium ${Number(p.debtAmount) > 0 ? "text-red-600" : "text-slate-400"}`}
                  >
                    {Number(p.debtAmount) > 0 ? fmt(p.debtAmount) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${PERIOD_STATUS_COLORS[p.status]}`}
                    >
                      {PERIOD_STATUS_LABELS[p.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">
            {(page - 1) * limit + 1}–{Math.min(page * limit, total)} из {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-slate-600">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Monthly Summary ────────────────────────────────────────────────────

function SummaryTab() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api(`/api/payments/summary?year=${year}`)
      .then((r) => (r.ok ? r.json() : { months: [] }))
      .then((d) => setData(d.months || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [year]);

  const totalYear = data.reduce((s, m) => s + m.total, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
        >
          {[
            new Date().getFullYear() - 1,
            new Date().getFullYear(),
            new Date().getFullYear() + 1,
          ].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <div className="text-sm text-slate-500">
          Итого за год: <span className="font-bold text-slate-900">{fmt(totalYear)}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {data.map((m) => (
            <div
              key={m.month}
              className={`bg-white rounded-xl border p-4 ${m.total > 0 ? "border-green-200" : "border-slate-200"}`}
            >
              <div className="text-sm text-slate-500 mb-1">{MONTHS[m.month]}</div>
              <div
                className={`text-lg font-bold ${m.total > 0 ? "text-green-600" : "text-slate-300"}`}
              >
                {m.total > 0 ? fmt(m.total) : "—"}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {m.count > 0 ? `${m.count} платежей` : "нет платежей"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const { hasRole } = useAuth();
  const [tab, setTab] = useState("reconciliation");
  const [syncing, setSyncing] = useState(false);
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    api("/api/payments/accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setAccounts(d))
      .catch(() => {});
  }, []);

  async function handleSync() {
    if (accounts.length === 0) {
      alert("Нет подключённых банковских счетов");
      return;
    }
    setSyncing(true);
    try {
      const res = await api("/api/payments/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: accounts[0].id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Ошибка синхронизации");
        return;
      }
      alert(
        `Импортировано: ${data.imported}, пропущено: ${data.skipped}, сопоставлено: ${data.matched}`,
      );
    } catch {
      alert("Ошибка синхронизации");
    } finally {
      setSyncing(false);
    }
  }

  if (!hasRole("admin") && !hasRole("supervisor")) {
    return <div className="text-slate-400 text-center py-16">Нет доступа</div>;
  }

  const tabs = [
    { key: "reconciliation", label: "Сверка", icon: Calculator },
    { key: "transactions", label: "Транзакции", icon: DollarSign },
    { key: "summary", label: "По месяцам", icon: Clock },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">Поступления</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white rounded-lg text-sm font-medium shadow-lg shadow-[#6567F1]/30 hover:from-[#5557E1] hover:to-[#4547D1] disabled:opacity-50"
          >
            <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
            Синхронизировать
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === key
                ? "bg-white text-[#6567F1] shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {tab === "transactions" && <TransactionsTab />}
      {tab === "reconciliation" && <ReconciliationTab />}
      {tab === "summary" && <SummaryTab />}
    </div>
  );
}
