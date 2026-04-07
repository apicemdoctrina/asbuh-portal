import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import {
  DollarSign,
  Loader2,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  RotateCcw,
  Plus,
  Trash2,
} from "lucide-react";

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
  const [showAddForm, setShowAddForm] = useState(false);
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

  async function handleIgnore(txId) {
    await api(`/api/payments/transactions/${txId}/ignore`, { method: "PUT" });
    fetchTx();
  }

  async function handleUnignore(txId) {
    await api(`/api/payments/transactions/${txId}/unignore`, { method: "PUT" });
    fetchTx();
  }

  async function handleDeleteManual(txId) {
    await api(`/api/payments/transactions/${txId}/manual`, { method: "DELETE" });
    fetchTx();
  }

  async function handleAddManual({ date, amount, payerName, purpose }) {
    const res = await api("/api/payments/transactions/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        amount,
        organizationId: organizationId || null,
        payerName,
        purpose,
      }),
    });
    if (res.ok) {
      setShowAddForm(false);
      fetchTx();
    }
  }

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
        <div className="flex items-center gap-3">
          {total > 0 && (
            <div className="text-sm text-slate-500">
              Итого на странице:{" "}
              <span className="font-semibold text-slate-700">{fmtMoney(totalAmount)}</span>
            </div>
          )}
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#6567F1] border border-[#6567F1]/20 rounded-lg hover:bg-[#6567F1]/5 transition-colors"
          >
            <Plus size={14} />
            Добавить
          </button>
        </div>
      </div>

      {showAddForm && (
        <ManualTxForm onSubmit={handleAddManual} onCancel={() => setShowAddForm(false)} />
      )}

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
                  <th className="text-right px-4 py-3 font-medium text-slate-500"></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const badge = STATUS_BADGE[tx.matchStatus] || STATUS_BADGE.UNMATCHED;
                  return (
                    <tr
                      key={tx.id}
                      className={`border-b border-slate-50 hover:bg-slate-50/50 ${tx.matchStatus === "IGNORED" ? "opacity-50" : ""}`}
                    >
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
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                        {tx.isManual && (
                          <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                            Ручная
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {tx.isManual && (
                            <button
                              onClick={() => handleDeleteManual(tx.id)}
                              title="Удалить"
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                          {tx.matchStatus === "IGNORED" ? (
                            <button
                              onClick={() => handleUnignore(tx.id)}
                              title="Вернуть в учёт"
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-[#6567F1] hover:bg-[#6567F1]/5 rounded-lg transition-colors"
                            >
                              <RotateCcw size={13} />
                              Вернуть
                            </button>
                          ) : (
                            <button
                              onClick={() => handleIgnore(tx.id)}
                              title="Не учитывать"
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            >
                              <EyeOff size={13} />
                              Игнорировать
                            </button>
                          )}
                        </div>
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

function ManualTxForm({ onSubmit, onCancel }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [payerName, setPayerName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!date || !amount) return;
    setSaving(true);
    try {
      await onSubmit({ date, amount, payerName, purpose });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="px-6 py-4 bg-slate-50 border-b border-slate-200 space-y-3"
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Дата</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Сумма</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Плательщик</label>
          <input
            type="text"
            value={payerName}
            onChange={(e) => setPayerName(e.target.value)}
            placeholder="Наличные, карта..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Назначение</label>
          <input
            type="text"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="Оплата за..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !amount || !date}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white rounded-lg text-sm font-medium shadow-lg shadow-[#6567F1]/30 hover:from-[#5557E1] hover:to-[#4547D1] disabled:opacity-50"
        >
          <Plus size={14} />
          Добавить транзакцию
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}
