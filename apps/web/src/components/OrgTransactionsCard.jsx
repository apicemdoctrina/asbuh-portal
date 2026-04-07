import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import { DollarSign, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

function fmtMoney(val) {
  if (val == null) return "—";
  return Number(val).toLocaleString("ru-RU") + " ₽";
}

function fmtDate(val) {
  if (!val) return "—";
  return new Date(val).toLocaleDateString("ru-RU");
}

const STATUS_BADGE = {
  AUTO: { label: "Авто", cls: "bg-green-100 text-green-700" },
  MANUAL: { label: "Вручную", cls: "bg-blue-100 text-blue-700" },
  UNMATCHED: { label: "Не привязана", cls: "bg-amber-100 text-amber-700" },
  IGNORED: { label: "Игнор", cls: "bg-slate-100 text-slate-500" },
};

/**
 * Shows bank transactions for a single org or a whole client group.
 * Pass either organizationId or clientGroupId (not both).
 * When showOrgName is true, the org name column is shown (useful for group view).
 */
export default function OrgTransactionsCard({
  organizationId,
  clientGroupId,
  showOrgName = false,
}) {
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const limit = 20;

  const fetchTx = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (organizationId) params.set("organizationId", organizationId);
      if (clientGroupId) params.set("clientGroupId", clientGroupId);
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
  }, [organizationId, clientGroupId, page]);

  useEffect(() => {
    fetchTx();
  }, [fetchTx]);

  const totalPages = Math.ceil(total / limit);
  const totalAmount = transactions.reduce((s, t) => s + Number(t.amount || 0), 0);

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign size={16} className="text-[#6567F1]" />
          <h2 className="text-base font-bold text-slate-900">Банковские транзакции</h2>
          {total > 0 && <span className="text-xs text-slate-400 ml-1">({total})</span>}
        </div>
        {total > 0 && (
          <div className="text-sm text-slate-500">
            Итого на странице:{" "}
            <span className="font-semibold text-slate-700">{fmtMoney(totalAmount)}</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-sm text-slate-400 text-center py-8">Транзакций нет</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Дата</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500">Сумма</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Плательщик</th>
                  {showOrgName && (
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Организация</th>
                  )}
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Назначение</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Статус</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const badge = STATUS_BADGE[tx.matchStatus] || STATUS_BADGE.UNMATCHED;
                  return (
                    <tr key={tx.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {fmtDate(tx.date)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-green-600 whitespace-nowrap">
                        {fmtMoney(tx.amount)}
                      </td>
                      <td
                        className="px-4 py-3 text-slate-700 max-w-[200px] truncate"
                        title={tx.payerName || ""}
                      >
                        {tx.payerName || "—"}
                        {tx.payerInn && (
                          <span className="text-slate-400 ml-1 text-xs">ИНН {tx.payerInn}</span>
                        )}
                      </td>
                      {showOrgName && (
                        <td className="px-4 py-3 text-slate-600">{tx.organization?.name || "—"}</td>
                      )}
                      <td
                        className="px-4 py-3 text-slate-500 max-w-[250px] truncate"
                        title={tx.purpose || ""}
                      >
                        {tx.purpose || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <span className="text-xs text-slate-400">
                Стр. {page} из {totalPages}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
