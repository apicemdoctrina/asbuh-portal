import { useState, useEffect, useCallback, Fragment } from "react";
import { useNavigate, Link } from "react-router";
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
  MessageSquare,
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

function TransactionsTab({ onOrgClick }) {
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
                <th className="text-left px-4 py-3 font-medium text-slate-500 w-[100px]">Дата</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 w-[100px]">Сумма</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 min-w-[220px]">
                  Плательщик
                </th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 w-[120px]">ИНН</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 min-w-[280px]">
                  Назначение
                </th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 min-w-[180px]">
                  Организация
                </th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 w-[100px]">Статус</th>
                <th className="px-4 py-3 w-[60px]"></th>
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
                  <td className="px-4 py-3">{tx.payerName || "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{tx.payerInn || "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{tx.purpose || "—"}</td>
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
                      <button
                        onClick={() => onOrgClick(tx.organization.id)}
                        className="text-[#6567F1] text-xs hover:underline text-left"
                      >
                        {tx.organization.name}
                      </button>
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

function NoteCell({ orgId, initialNote }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(initialNote || "");
  const [saved, setSaved] = useState(initialNote || "");

  async function handleSave() {
    await api(`/api/payments/org/${orgId}/note`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    setSaved(note);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") {
              setNote(saved);
              setEditing(false);
            }
          }}
          autoFocus
          className="px-2 py-1 border border-slate-200 rounded text-xs w-full min-w-[120px] focus:outline-none focus:ring-1 focus:ring-[#6567F1]/30"
        />
        <button onClick={handleSave} className="text-green-600 hover:text-green-700">
          <Check size={14} />
        </button>
        <button
          onClick={() => {
            setNote(saved);
            setEditing(false);
          }}
          className="text-slate-400 hover:text-slate-600"
        >
          <XIcon size={14} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="flex items-center gap-1 text-xs text-slate-400 hover:text-[#6567F1] transition-colors max-w-[200px] text-left"
      title={saved || "Добавить примечание"}
    >
      {saved ? (
        <span className="text-slate-500 truncate">{saved}</span>
      ) : (
        <>
          <MessageSquare size={12} />
          <span>примечание</span>
        </>
      )}
    </button>
  );
}

function ReconciliationTab() {
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState({ expected: 0, received: 0, debt: 0, debtorCount: 0 });
  const [reconciling, setReconciling] = useState(false);
  const [done, setDone] = useState(false);
  const [filter, setFilter] = useState("all"); // all | debtors | paid

  async function handleReconcile() {
    setReconciling(true);
    try {
      const res = await api("/api/payments/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setResults(data.results);
      setSummary({
        expected: data.totalExpected,
        received: data.totalReceived,
        debt: data.totalDebt,
        debtorCount: data.debtorCount,
      });
      setDone(true);
    } catch {
      /* */
    } finally {
      setReconciling(false);
    }
  }

  const filtered = (() => {
    const base = results.filter((r) => {
      if (filter === "debtors") return r.groupId ? (r.groupDebt ?? 0) > 0 : r.debt > 0;
      if (filter === "paid") return r.groupId ? (r.groupDebt ?? 0) === 0 : r.debt === 0;
      return true;
    });
    // Sort alphabetically, then group: when an org has a group,
    // place all group members right after the first alphabetical member
    const sorted = [...base].sort((a, b) => a.orgName.localeCompare(b.orgName, "ru"));
    const grouped = [];
    const placed = new Set();
    for (const r of sorted) {
      if (placed.has(r.orgId)) continue;
      placed.add(r.orgId);
      grouped.push(r);
      if (r.groupId) {
        // Add remaining group members right after
        for (const g of sorted) {
          if (g.groupId === r.groupId && !placed.has(g.orgId)) {
            placed.add(g.orgId);
            grouped.push(g);
          }
        }
      }
    }
    return grouped;
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
        <button
          onClick={handleReconcile}
          disabled={reconciling}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white rounded-lg text-sm font-medium shadow-lg shadow-[#6567F1]/30 hover:from-[#5557E1] hover:to-[#4547D1] disabled:opacity-50"
        >
          <Calculator size={16} className={reconciling ? "animate-spin" : ""} />
          Пересчитать
        </button>
        {done && (
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
          >
            <option value="all">Все ({results.length})</option>
            <option value="debtors">Должники ({summary.debtorCount})</option>
            <option value="paid">Без долга ({results.length - summary.debtorCount})</option>
          </select>
        )}
        {done && (
          <span className="text-xs text-slate-400">Расчёт с 01.01.2025 по текущий месяц</span>
        )}
      </div>

      {done && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
                <AlertCircle size={14} />
                Должников
              </div>
              <div
                className={`text-lg font-bold ${summary.debtorCount > 0 ? "text-red-600" : "text-slate-900"}`}
              >
                {summary.debtorCount}
              </div>
            </div>
          </div>

          {/* Results table */}
          {filtered.length === 0 ? (
            <div className="text-slate-400 text-sm py-8 text-center">Нет данных</div>
          ) : (
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Организация</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-500">Ожидалось</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-500">Поступило</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-500">Долг</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Примечание</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    const isGroupStart =
                      r.groupId && (i === 0 || filtered[i - 1]?.groupId !== r.groupId);
                    const isInGroup = !!r.groupId;
                    const isGroupEnd =
                      r.groupId &&
                      (i === filtered.length - 1 || filtered[i + 1]?.groupId !== r.groupId);

                    return (
                      <Fragment key={r.orgId}>
                        {isGroupStart && (
                          <tr
                            key={`gh-${r.groupId}`}
                            className="bg-amber-50/80 border-b border-amber-200"
                          >
                            <td className="px-4 py-2 text-xs font-semibold text-amber-700">
                              <Link to={`/client-groups/${r.groupId}`} className="hover:underline">
                                {r.groupName || "Группа"}
                              </Link>
                              <span className="ml-2 text-amber-500 font-normal">
                                {filtered.filter((x) => x.groupId === r.groupId).length} орг.
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right text-xs font-semibold text-amber-700">
                              {fmt(r.groupExpected)}
                            </td>
                            <td className="px-4 py-2 text-right text-xs font-semibold text-green-700">
                              {fmt(r.groupReceived)}
                            </td>
                            <td
                              className={`px-4 py-2 text-right text-xs font-semibold ${r.groupDebt > 0 ? "text-red-600" : "text-amber-700"}`}
                            >
                              {r.groupDebt > 0 ? fmt(r.groupDebt) : "—"}
                            </td>
                            <td className="px-4 py-2"></td>
                          </tr>
                        )}
                        <tr
                          key={r.orgId}
                          className={`border-b hover:bg-slate-50/50 ${isInGroup ? "bg-amber-50/30 border-amber-100" : "border-slate-50"} ${isGroupEnd ? "border-b-2 border-b-amber-200" : ""}`}
                        >
                          <td className={`py-3 ${isInGroup ? "pl-8 pr-4" : "px-4"}`}>
                            <Link
                              to={`/organizations/${r.orgId}`}
                              className="font-medium text-[#6567F1] hover:underline"
                            >
                              {r.orgName}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isInGroup ? (
                              <span className="text-slate-400">{fmt(r.expected)}</span>
                            ) : (
                              fmt(r.expected)
                            )}
                          </td>
                          {isInGroup ? (
                            <>
                              <td className="px-4 py-3"></td>
                              <td className="px-4 py-3"></td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3 text-right text-green-600 font-medium">
                                {fmt(r.received)}
                              </td>
                              <td
                                className={`px-4 py-3 text-right font-medium ${r.debt > 0 ? "text-red-600" : "text-slate-400"}`}
                              >
                                {r.debt > 0 ? fmt(r.debt) : "—"}
                              </td>
                            </>
                          )}
                          <td className="px-4 py-3">
                            <NoteCell orgId={r.orgId} initialNote={r.paymentNote} />
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!done && !reconciling && (
        <div className="text-slate-400 text-sm py-8 text-center">
          Нажмите «Пересчитать» для сверки всех оплат с 01.01.2025
        </div>
      )}
    </div>
  );
}

// ─── Tab: Monthly Summary ────────────────────────────────────────────────────

function SummaryTab() {
  const [period, setPeriod] = useState("all");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api(`/api/payments/summary?year=${period}`)
      .then((r) => (r.ok ? r.json() : { months: [] }))
      .then((d) => setData(d.months || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  const totalAll = data.reduce((s, m) => s + m.total, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
        >
          <option value="all">Весь период</option>
          <option value="2025">2025</option>
          <option value="2026">2026</option>
        </select>
        <div className="text-sm text-slate-500">
          Итого за период: <span className="font-bold text-slate-900">{fmt(totalAll)}</span>
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
              key={`${m.year || ""}-${m.month}`}
              className={`bg-white rounded-xl border p-4 ${m.total > 0 ? "border-green-200" : "border-slate-200"}`}
            >
              <div className="text-sm text-slate-500 mb-1">
                {m.year ? `${MONTHS[m.month]} ${m.year}` : MONTHS[m.month]}
              </div>
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
  const navigate = useNavigate();
  const [tab, setTab] = useState("reconciliation");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [showSetup, setShowSetup] = useState(false);
  const [tochkaAccounts, setTochkaAccounts] = useState(null);
  const [loadingTochka, setLoadingTochka] = useState(false);
  const [syncPeriod, setSyncPeriod] = useState("all");

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await api("/api/payments/accounts");
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
      }
    } catch {
      /* */
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  async function handleFetchTochkaAccounts() {
    setLoadingTochka(true);
    try {
      const res = await api("/api/payments/tochka-accounts");
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Ошибка получения счетов из Точки");
        return;
      }
      setTochkaAccounts(await res.json());
    } catch {
      alert("Ошибка подключения к API Точки");
    } finally {
      setLoadingTochka(false);
    }
  }

  async function handleAddAccount(tochkaAcc) {
    try {
      const res = await api("/api/payments/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankName: "Точка",
          accountNumber: tochkaAcc.accountId,
        }),
      });
      if (!res.ok) {
        alert("Ошибка добавления счёта");
        return;
      }
      setShowSetup(false);
      setTochkaAccounts(null);
      fetchAccounts();
    } catch {
      alert("Ошибка");
    }
  }

  async function handleSync(dateFrom, dateTo) {
    if (accounts.length === 0) {
      setShowSetup(true);
      return;
    }
    setSyncing(true);
    setSyncResult(null);
    try {
      const body = { accountId: accounts[0].id };
      if (dateFrom) body.dateFrom = dateFrom;
      if (dateTo) body.dateTo = dateTo;
      const res = await api("/api/payments/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Ошибка синхронизации");
        return;
      }
      setSyncResult(data);
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
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Поступления</h1>
          {accounts.length > 0 && (
            <p className="text-sm text-slate-500 mt-1">
              Счёт: {accounts[0].accountNumber}
              {accounts[0].lastSyncAt && (
                <span className="ml-2">
                  · Последняя синхронизация:{" "}
                  {new Date(accounts[0].lastSyncAt).toLocaleString("ru-RU")}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {accounts.length === 0 && (
            <button
              onClick={() => setShowSetup(true)}
              className="inline-flex items-center gap-2 px-4 py-2 border-2 border-[#6567F1]/20 text-[#6567F1] rounded-lg text-sm font-medium hover:bg-[#6567F1]/5"
            >
              Подключить счёт
            </button>
          )}
          <select
            value={syncPeriod}
            onChange={(e) => setSyncPeriod(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
          >
            <option value="all">Весь период</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
          </select>
          <button
            onClick={() => {
              const today = new Date().toISOString().slice(0, 10);
              if (syncPeriod === "all") {
                handleSync("2025-01-01", today);
              } else {
                const y = Number(syncPeriod);
                handleSync(`${y}-01-01`, y === new Date().getFullYear() ? today : `${y}-12-31`);
              }
            }}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white rounded-lg text-sm font-medium shadow-lg shadow-[#6567F1]/30 hover:from-[#5557E1] hover:to-[#4547D1] disabled:opacity-50"
          >
            <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Загрузка из банка..." : "Синхронизировать"}
          </button>
        </div>
      </div>

      {/* Sync result banner */}
      {syncResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-green-700">
            Импортировано: <b>{syncResult.imported}</b>, пропущено: <b>{syncResult.skipped}</b>,
            сопоставлено: <b>{syncResult.matched}</b>
          </span>
          <button
            onClick={() => setSyncResult(null)}
            className="p-1 text-green-400 hover:text-green-600"
          >
            <XIcon size={14} />
          </button>
        </div>
      )}

      {/* Setup modal */}
      {showSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Подключение счёта Точка</h2>
              <button
                onClick={() => {
                  setShowSetup(false);
                  setTochkaAccounts(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <XIcon size={18} />
              </button>
            </div>

            {!tochkaAccounts ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  Нажмите кнопку чтобы загрузить список счетов из API Точки.
                </p>
                <button
                  onClick={handleFetchTochkaAccounts}
                  disabled={loadingTochka}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white rounded-lg text-sm font-medium shadow-lg shadow-[#6567F1]/30 hover:from-[#5557E1] hover:to-[#4547D1] disabled:opacity-50"
                >
                  {loadingTochka ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <RefreshCw size={16} />
                  )}
                  {loadingTochka ? "Загрузка..." : "Получить счета из Точки"}
                </button>
              </div>
            ) : tochkaAccounts.length === 0 ? (
              <p className="text-sm text-slate-500">Счетов не найдено. Проверьте JWT-токен.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-slate-600 mb-3">Выберите счёт для подключения:</p>
                {tochkaAccounts.map((acc) => (
                  <button
                    key={acc.accountId}
                    onClick={() => handleAddAccount(acc)}
                    className="w-full text-left p-3 border border-slate-200 rounded-lg hover:border-[#6567F1] hover:bg-[#6567F1]/5 transition-colors"
                  >
                    <div className="font-medium text-sm text-slate-900">{acc.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {acc.accountId} · {acc.currency} · {acc.status}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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

      {tab === "transactions" && (
        <TransactionsTab onOrgClick={(id) => navigate(`/organizations/${id}`)} />
      )}
      {tab === "reconciliation" && <ReconciliationTab />}
      {tab === "summary" && <SummaryTab />}
    </div>
  );
}
