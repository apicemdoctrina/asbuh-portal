import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Plus, Search, ChevronLeft, ChevronRight, Filter } from "lucide-react";

export default function OrganizationsPage() {
  const { hasPermission } = useAuth();
  const [organizations, setOrganizations] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createInn, setCreateInn] = useState("");
  const [createForm, setCreateForm] = useState("");
  const [createSection, setCreateSection] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  const limit = 50;

  // Load sections for filter/create dropdown
  useEffect(() => {
    if (hasPermission("section", "view")) {
      api("/api/sections?limit=100")
        .then((res) => (res.ok ? res.json() : { sections: [] }))
        .then((data) => setSections(data.sections || []))
        .catch(() => {});
    }
  }, [hasPermission]);

  const fetchOrganizations = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (sectionId) params.set("sectionId", sectionId);
      const res = await api(`/api/organizations?${params}`);
      if (!res.ok) throw new Error("Failed to load organizations");
      const data = await res.json();
      setOrganizations(data.organizations);
      setTotal(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, sectionId]);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  const totalPages = Math.ceil(total / limit);

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError("");
    setCreating(true);
    try {
      const res = await api("/api/organizations", {
        method: "POST",
        body: JSON.stringify({
          name: createName,
          inn: createInn || undefined,
          form: createForm || undefined,
          sectionId: createSection || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create organization");
      }
      setShowCreate(false);
      setCreateName("");
      setCreateInn("");
      setCreateForm("");
      setCreateSection("");
      setPage(1);
      fetchOrganizations();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  const STATUS_LABELS = {
    active: "Активный",
    new: "Новый",
    liquidating: "В процессе ликвидации",
    left: "Ушёл",
    closed: "Закрылся",
    not_paying: "Не платит",
  };

  const statusBadge = (status) => {
    const map = {
      active: "bg-green-100 text-green-700",
      new: "bg-blue-100 text-blue-700",
      liquidating: "bg-amber-100 text-amber-700",
      left: "bg-slate-100 text-slate-500",
      closed: "bg-slate-100 text-slate-500",
      not_paying: "bg-red-100 text-red-700",
    };
    return map[status] || "bg-slate-100 text-slate-500";
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Организации</h1>
        {hasPermission("organization", "create") && (
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all"
          >
            <Plus size={16} />
            Создать организацию
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск по названию или ИНН..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-72 pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
          />
        </div>
        <div className="relative">
          <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] bg-white"
          >
            <option value="">Все статусы</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {sections.length > 0 && (
          <select
            value={sectionId}
            onChange={(e) => {
              setSectionId(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] bg-white"
          >
            <option value="">Все участки</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                №{s.number} {s.name || ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      {loading ? (
        <div className="text-slate-400 text-sm">Загрузка...</div>
      ) : organizations.length === 0 ? (
        <div className="text-slate-400 text-sm">Организации не найдены</div>
      ) : (
        <>
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Название</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">ИНН</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Участок</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Статус</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Участники</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((org) => (
                  <tr key={org.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <Link
                        to={`/organizations/${org.id}`}
                        className="text-[#6567F1] hover:underline"
                      >
                        {org.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{org.inn || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {org.section ? `№${org.section.number}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(org.status)}`}
                      >
                        {STATUS_LABELS[org.status] || org.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{org._count?.members ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
            <h2 className="text-lg font-bold text-slate-900 mb-4">Новая организация</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Название *</label>
                <input
                  type="text"
                  required
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ИНН</label>
                <input
                  type="text"
                  value={createInn}
                  onChange={(e) => setCreateInn(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Форма собственности
                </label>
                <select
                  value={createForm}
                  onChange={(e) => setCreateForm(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] bg-white"
                >
                  <option value="">Не указано</option>
                  <option value="OOO">ООО</option>
                  <option value="IP">ИП</option>
                  <option value="NKO">НКО</option>
                  <option value="AO">АО</option>
                  <option value="PAO">ПАО</option>
                </select>
              </div>
              {sections.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Участок</label>
                  <select
                    value={createSection}
                    onChange={(e) => setCreateSection(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] bg-white"
                  >
                    <option value="">Без участка</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        №{s.number} {s.name || ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
