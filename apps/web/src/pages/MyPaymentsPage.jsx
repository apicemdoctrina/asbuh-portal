import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import { api } from "../lib/api.js";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Check,
  X as XIcon,
  Loader2,
  Plus,
  Banknote,
} from "lucide-react";

function fmt(val) {
  if (val == null) return "\u2014";
  return Number(val).toLocaleString("ru-RU") + " \u20BD";
}

export default function MyPaymentsPage() {
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const limit = 50;

  // Add payment form
  const [showAdd, setShowAdd] = useState(false);
  const [orgs, setOrgs] = useState([]);
  const [addForm, setAddForm] = useState({
    organizationId: "",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    purpose: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchTx = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      const res = await api(`/api/payments/my-transactions?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTransactions(data.transactions);
      setTotal(data.total);
    } catch {
      /* */
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchTx();
  }, [fetchTx]);

  useEffect(() => {
    api("/api/organizations?limit=1000")
      .then((r) => (r.ok ? r.json() : { organizations: [] }))
      .then((d) => setOrgs(d.organizations || []))
      .catch(() => {});
  }, []);

  async function handleAdd() {
    if (!addForm.organizationId || !addForm.amount || !addForm.date) return;
    setSaving(true);
    try {
      const res = await api("/api/payments/my-transactions/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: addForm.organizationId,
          amount: Number(addForm.amount),
          date: addForm.date,
          purpose: addForm.purpose || "Оплата нал/карта",
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Ошибка");
        return;
      }
      setShowAdd(false);
      setAddForm({
        organizationId: "",
        amount: "",
        date: new Date().toISOString().slice(0, 10),
        purpose: "",
      });
      fetchTx();
    } catch {
      alert("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Оплаты по моим организациям</h1>
          <p className="text-sm text-slate-500 mt-1">Транзакции организаций из ваших участков</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white rounded-lg text-sm font-medium shadow-lg shadow-[#6567F1]/30 hover:from-[#5557E1] hover:to-[#4547D1]"
        >
          <Plus size={16} />
          Внести оплату
        </button>
      </div>

      {/* Add payment form */}
      {showAdd && (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">Новая оплата</h3>
            <button
              onClick={() => setShowAdd(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <XIcon size={16} />
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Организация</label>
              <select
                value={addForm.organizationId}
                onChange={(e) => setAddForm({ ...addForm, organizationId: e.target.value })}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white min-w-[200px] focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
              >
                <option value="">Выбрать...</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Сумма</label>
              <input
                type="number"
                placeholder="0"
                value={addForm.amount}
                onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })}
                className="w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Дата</label>
              <input
                type="date"
                value={addForm.date}
                onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Комментарий</label>
              <input
                type="text"
                placeholder="Необязательно"
                value={addForm.purpose}
                onChange={(e) => setAddForm({ ...addForm, purpose: e.target.value })}
                className="w-48 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={saving || !addForm.organizationId || !addForm.amount}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white rounded-lg text-sm font-medium shadow-sm hover:from-[#5557E1] hover:to-[#4547D1] disabled:opacity-50"
            >
              <Check size={14} />
              Сохранить
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Поиск по плательщику, назначению..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-full sm:w-80 pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
        />
      </div>

      {/* Table */}
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
                <th className="text-left px-4 py-3 font-medium text-slate-500 min-w-[180px]">
                  Организация
                </th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 min-w-[180px]">
                  Плательщик
                </th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 min-w-[250px]">
                  Назначение
                </th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 w-[80px]">Тип</th>
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
                  <td className="px-4 py-3">
                    {tx.organization ? (
                      <Link
                        to={`/organizations/${tx.organization.id}`}
                        className="text-[#6567F1] hover:underline"
                      >
                        {tx.organization.name}
                      </Link>
                    ) : (
                      <span className="text-slate-400">{"\u2014"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{tx.payerName || "\u2014"}</td>
                  <td className="px-4 py-3 text-slate-500">{tx.purpose || "\u2014"}</td>
                  <td className="px-4 py-3">
                    {tx.isManual ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                        <Banknote size={12} />
                        Ручная
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        Банк
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">
            {(page - 1) * limit + 1}\u2013{Math.min(page * limit, total)} из {total}
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
