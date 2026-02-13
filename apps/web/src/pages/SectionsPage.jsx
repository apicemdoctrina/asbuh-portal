import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Plus, Search, ChevronLeft, ChevronRight } from "lucide-react";

export default function SectionsPage() {
  const { hasPermission } = useAuth();
  const [sections, setSections] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [createNumber, setCreateNumber] = useState("");
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  const limit = 50;

  const fetchSections = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      const res = await api(`/api/sections?${params}`);
      if (!res.ok) throw new Error("Failed to load sections");
      const data = await res.json();
      setSections(data.sections);
      setTotal(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  const totalPages = Math.ceil(total / limit);

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError("");
    setCreating(true);
    try {
      const res = await api("/api/sections", {
        method: "POST",
        body: JSON.stringify({
          number: Number(createNumber),
          name: createName || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create section");
      }
      setShowCreate(false);
      setCreateNumber("");
      setCreateName("");
      setPage(1);
      fetchSections();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Участки</h1>
        {hasPermission("section", "create") && (
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all"
          >
            <Plus size={16} />
            Создать участок
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Поиск по номеру или названию..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-full sm:w-80 pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
        />
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      {loading ? (
        <div className="text-slate-400 text-sm">Загрузка...</div>
      ) : sections.length === 0 ? (
        <div className="text-slate-400 text-sm">Участки не найдены</div>
      ) : (
        <>
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left px-4 py-3 font-medium text-slate-500">№</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Название</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Участники</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Организации</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((s) => (
                  <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-900">{s.number}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <Link to={`/sections/${s.id}`} className="text-[#6567F1] hover:underline">
                        {s.name || "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s._count?.members ?? 0}</td>
                    <td className="px-4 py-3 text-slate-600">{s._count?.organizations ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-slate-500">
                Показано {(page - 1) * limit + 1}–{Math.min(page * limit, total)} из {total}
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm text-slate-600">
                  {page} / {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Новый участок</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Номер участка *
                </label>
                <input
                  type="number"
                  required
                  value={createNumber}
                  onChange={(e) => setCreateNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Название</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                />
              </div>
              {createError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{createError}</div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(false);
                    setCreateError("");
                  }}
                  className="px-4 py-2 border-2 border-[#6567F1]/20 text-[#6567F1] hover:bg-[#6567F1]/5 rounded-lg text-sm font-medium transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50"
                >
                  {creating ? "Создание..." : "Создать"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
