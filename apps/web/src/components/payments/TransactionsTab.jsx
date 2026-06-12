import { useState } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Check,
  X as XIcon,
  Link2,
  EyeOff,
  Loader2,
  Filter,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { useApi, jsonFetcher } from "../../hooks/useApi.js";
import { MATCH_STATUS_LABELS, MATCH_STATUS_COLORS, fmt } from "./paymentsConstants.js";

/** Bank transactions list with search, match-status filter and manual matching. */
export default function TransactionsTab({ onOrgClick }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [matchFilter, setMatchFilter] = useState("");
  const [matchingId, setMatchingId] = useState(null);
  const [matchOrgId, setMatchOrgId] = useState("");
  const limit = 50;

  const {
    data,
    loading,
    refetch: fetchTx,
  } = useApi(
    jsonFetcher(() => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (matchFilter) params.set("matchStatus", matchFilter);
      return api(`/api/payments/transactions?${params}`);
    }),
    [page, search, matchFilter],
  );
  const transactions = data?.transactions ?? [];
  const total = data?.total ?? 0;

  const { data: orgsData } = useApi(async () => {
    const res = await api("/api/organizations?limit=1000");
    const d = res.ok ? await res.json() : { organizations: [] };
    return d.organizations || [];
  }, []);
  const orgs = orgsData ?? [];

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
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            type="text"
            placeholder="Поиск по плательщику, ИНН, назначению..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-80 pl-9 pr-4 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <div className="relative">
          <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <select
            value={matchFilter}
            onChange={(e) => {
              setMatchFilter(e.target.value);
              setPage(1);
            }}
            className="pl-9 pr-4 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
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
        <div className="flex items-center justify-center py-16 text-subtle">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-subtle text-sm py-8 text-center">Транзакции не найдены</div>
      ) : (
        <div className="bg-surface rounded-2xl shadow-lg border border-line overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas/50">
                <th className="text-left px-4 py-3 font-medium text-subtle w-[100px]">Дата</th>
                <th className="text-left px-4 py-3 font-medium text-subtle w-[100px]">Сумма</th>
                <th className="text-left px-4 py-3 font-medium text-subtle min-w-[220px]">
                  Плательщик
                </th>
                <th className="text-left px-4 py-3 font-medium text-subtle w-[120px]">ИНН</th>
                <th className="text-left px-4 py-3 font-medium text-subtle min-w-[280px]">
                  Назначение
                </th>
                <th className="text-left px-4 py-3 font-medium text-subtle min-w-[180px]">
                  Организация
                </th>
                <th className="text-left px-4 py-3 font-medium text-subtle w-[100px]">Статус</th>
                <th className="px-4 py-3 w-[60px]"></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-line hover:bg-canvas/50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {new Date(tx.date).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-medium text-green-600 dark:text-green-300">
                    +{fmt(tx.amount)}
                  </td>
                  <td className="px-4 py-3">{tx.payerName || "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{tx.payerInn || "—"}</td>
                  <td className="px-4 py-3 text-subtle">{tx.purpose || "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {matchingId === tx.id ? (
                      <div className="flex items-center gap-1">
                        <select
                          value={matchOrgId}
                          onChange={(e) => setMatchOrgId(e.target.value)}
                          className="px-2 py-1 border border-line rounded text-xs bg-surface max-w-[180px]"
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
                          className="p-1 text-green-600 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-500/15 rounded"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => {
                            setMatchingId(null);
                            setMatchOrgId("");
                          }}
                          className="p-1 text-subtle hover:bg-muted rounded"
                        >
                          <XIcon size={14} />
                        </button>
                      </div>
                    ) : tx.organization ? (
                      <button
                        onClick={() => onOrgClick(tx.organization.id)}
                        className="text-primary text-xs hover:underline text-left"
                      >
                        {tx.organization.name}
                      </button>
                    ) : (
                      <span className="text-subtle text-xs">—</span>
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
                            className="p-1 text-primary hover:bg-primary/10 rounded"
                            title="Привязать"
                          >
                            <Link2 size={14} />
                          </button>
                          <button
                            onClick={() => handleIgnore(tx.id)}
                            className="p-1 text-subtle hover:bg-muted rounded"
                            title="Игнорировать"
                          >
                            <EyeOff size={14} />
                          </button>
                        </>
                      )}
                      {(tx.matchStatus === "AUTO" || tx.matchStatus === "MANUAL") && (
                        <button
                          onClick={() => handleUnmatch(tx.id)}
                          className="p-1 text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 rounded"
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
          <span className="text-sm text-subtle">
            {(page - 1) * limit + 1}–{Math.min(page * limit, total)} из {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="p-2 rounded-lg border border-line text-body hover:bg-canvas disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-body">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="p-2 rounded-lg border border-line text-body hover:bg-canvas disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
