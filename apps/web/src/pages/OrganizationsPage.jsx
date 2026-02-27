import { useState, useEffect, useCallback, useRef } from "react";
import { useDebouncedEffect } from "../hooks/useDebouncedEffect.js";
import { Link } from "react-router";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";

// ─── Labels ───────────────────────────────────────────────────────────────────

const TAX_SYSTEM_LABELS = {
  USN6: "УСН 6%",
  USN15: "УСН 15%",
  AUSN8: "АУСН 8%",
  AUSN20: "АУСН 20%",
  PSN: "ПСН",
  OSNO: "ОСНО",
  USN_NDS5: "НДС 5%",
  USN_NDS7: "НДС 7%",
  USN_NDS22: "НДС 22%",
};
const SERVICE_TYPE_LABELS = {
  ZERO: "Нулёвка",
  MINIMAL: "Минимальное",
  FULL: "Полное",
  HR: "Кадры",
  REPORTING: "Отчётность",
  HR_REPORTING: "Кадры+Отчётность",
  PARTIAL: "Частичное",
};
const REPORTING_CHANNEL_LABELS = { KONTUR: "Контур", SBIS: "СБИС", ASTRAL: "Астрал" };
const DIGITAL_SIGNATURE_LABELS = { NONE: "Нет", CLIENT: "У клиента", US: "У нас" };
const ORG_FORM_LABELS = { OOO: "ООО", IP: "ИП", NKO: "НКО", AO: "АО", PAO: "ПАО" };

const STATUS_LABELS = {
  active: "Активный",
  new: "Новый",
  liquidating: "В процессе ликвидации",
  left: "Ушёл",
  closed: "Закрылся",
  not_paying: "Не платит",
};

function statusBadge(status) {
  const map = {
    active: "bg-green-100 text-green-700",
    new: "bg-blue-100 text-blue-700",
    liquidating: "bg-amber-100 text-amber-700",
    left: "bg-slate-100 text-slate-500",
    closed: "bg-slate-100 text-slate-500",
    not_paying: "bg-red-100 text-red-700",
  };
  return map[status] || "bg-slate-100 text-slate-500";
}

function fmtMoney(val) {
  if (val == null) return "—";
  return Number(val).toLocaleString("ru-RU") + " ₽";
}

// ─── Column definitions ────────────────────────────────────────────────────────

const COLUMN_DEFS = [
  { key: "inn", label: "ИНН" },
  { key: "form", label: "Форма" },
  { key: "section", label: "Участок" },
  { key: "status", label: "Статус" },
  { key: "taxSystems", label: "Система Н/О" },
  { key: "employeeCount", label: "Сотрудников" },
  { key: "serviceType", label: "Тип обслуживания" },
  { key: "monthlyPayment", label: "Ежемес. платёж" },
  { key: "debtAmount", label: "Задолженность" },
  { key: "reportingChannel", label: "Отчётность" },
  { key: "digitalSignature", label: "ЭЦП" },
  { key: "digitalSignatureExpiry", label: "Срок ЭЦП" },
  { key: "hasCashRegister", label: "Касса" },
  { key: "members", label: "Ответственные" },
];

// Columns that support server-side sorting
const SORTABLE_COLS = new Set([
  "employeeCount",
  "monthlyPayment",
  "debtAmount",
  "form",
  "serviceType",
  "reportingChannel",
  "digitalSignatureExpiry",
]);

function SortIcon({ colKey, sortBy, sortOrder }) {
  if (sortBy !== colKey)
    return <ArrowUpDown size={13} className="ml-1 text-slate-300 inline-block" />;
  return sortOrder === "asc" ? (
    <ArrowUp size={13} className="ml-1 text-[#6567F1] inline-block" />
  ) : (
    <ArrowDown size={13} className="ml-1 text-[#6567F1] inline-block" />
  );
}

const DEFAULT_COLS = ["inn", "section", "status", "members"];
const STORAGE_KEY = "org_table_columns_v1";

function loadCols() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_COLS;
}

function renderCell(colKey, org) {
  switch (colKey) {
    case "inn":
      return org.inn || "—";
    case "form":
      return ORG_FORM_LABELS[org.form] || "—";
    case "section":
      return org.section ? `№${org.section.number}` : "—";
    case "taxSystems":
      return org.taxSystems?.length
        ? org.taxSystems.map((k) => TAX_SYSTEM_LABELS[k] || k).join(", ")
        : "—";
    case "employeeCount":
      return org.employeeCount ?? "—";
    case "serviceType":
      return SERVICE_TYPE_LABELS[org.serviceType] || "—";
    case "monthlyPayment":
      return fmtMoney(org.monthlyPayment);
    case "debtAmount":
      return fmtMoney(org.debtAmount);
    case "reportingChannel":
      return REPORTING_CHANNEL_LABELS[org.reportingChannel] || "—";
    case "digitalSignature":
      return DIGITAL_SIGNATURE_LABELS[org.digitalSignature] || "—";
    case "digitalSignatureExpiry": {
      if (!org.digitalSignatureExpiry) return "—";
      const date = new Date(org.digitalSignatureExpiry);
      const daysLeft = Math.ceil((date - Date.now()) / 86400000);
      const label = date.toLocaleDateString("ru-RU");
      if (daysLeft < 0) return { __expiry: true, label, cls: "text-red-600 font-medium" };
      if (daysLeft <= 30)
        return {
          __expiry: true,
          label: `${label} (${daysLeft} дн.)`,
          cls: "text-amber-600 font-medium",
        };
      return { __expiry: true, label, cls: "text-slate-600" };
    }
    case "hasCashRegister":
      return org.hasCashRegister ? "Да" : "Нет";
    case "members":
      return org.members?.length
        ? org.members.map((m) => `${m.user.lastName} ${m.user.firstName[0]}.`).join(", ")
        : "—";
    default:
      return "—";
  }
}

// ─── Column picker dropdown ────────────────────────────────────────────────────

function ColumnPicker({ visibleCols, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function toggle(key) {
    const next = visibleCols.includes(key)
      ? visibleCols.filter((k) => k !== key)
      : [...visibleCols, key];
    onChange(next);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
          open
            ? "border-[#6567F1] text-[#6567F1] bg-[#6567F1]/5"
            : "border-slate-200 text-slate-600 hover:bg-slate-50"
        }`}
      >
        <SlidersHorizontal size={15} />
        Столбцы
        {visibleCols.length !== DEFAULT_COLS.length && (
          <span className="ml-0.5 bg-[#6567F1] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
            {visibleCols.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-xl p-3 w-52">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2 px-1">
            Название — всегда
          </p>
          <div className="space-y-0.5">
            {COLUMN_DEFS.map(({ key, label }) => (
              <label
                key={key}
                className="flex items-center gap-2.5 px-1 py-1 rounded-lg hover:bg-slate-50 cursor-pointer text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={visibleCols.includes(key)}
                  onChange={() => toggle(key)}
                  className="w-4 h-4 rounded border-slate-300 text-[#6567F1] focus:ring-[#6567F1]/30"
                />
                {label}
              </label>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex gap-2">
            <button
              onClick={() => onChange(COLUMN_DEFS.map((c) => c.key))}
              className="flex-1 text-xs text-[#6567F1] hover:underline text-center"
            >
              Все
            </button>
            <button
              onClick={() => onChange(DEFAULT_COLS)}
              className="flex-1 text-xs text-slate-500 hover:underline text-center"
            >
              По умолчанию
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function OrganizationsPage() {
  const { hasPermission } = useAuth();
  const [organizations, setOrganizations] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [archiveMode, setArchiveMode] = useState(false);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [visibleCols, setVisibleCols] = useState(loadCols);
  const [taxSystem, setTaxSystem] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [sortOrder, setSortOrder] = useState("asc");

  function handleColsChange(next) {
    setVisibleCols(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createInn, setCreateInn] = useState("");
  const [createForm, setCreateForm] = useState("");
  const [createSection, setCreateSection] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  const limit = 50;

  useEffect(() => {
    if (hasPermission("section", "view")) {
      api("/api/sections?limit=100")
        .then((res) => (res.ok ? res.json() : { sections: [] }))
        .then((data) => setSections(data.sections || []))
        .catch(() => {});
    }
  }, [hasPermission]);

  function handleSort(field) {
    if (sortBy === field) {
      if (sortOrder === "asc") {
        setSortOrder("desc");
      } else {
        setSortBy("");
        setSortOrder("asc");
      }
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setPage(1);
  }

  const fetchOrganizations = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (taxSystem) params.set("taxSystem", taxSystem);
      if (sortBy) {
        params.set("sortBy", sortBy);
        params.set("sortOrder", sortOrder);
      }
      if (archiveMode) {
        params.set("archived", "true");
      } else {
        if (statusFilter) params.set("status", statusFilter);
        if (sectionId) params.set("sectionId", sectionId);
      }
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
  }, [page, search, taxSystem, sortBy, sortOrder, statusFilter, sectionId, archiveMode]);

  useDebouncedEffect(fetchOrganizations, [fetchOrganizations]);

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
      await fetchOrganizations();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Организации</h1>
        {hasPermission("organization", "create") && !archiveMode && (
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
      <div className="flex flex-col sm:flex-row gap-3 mb-6 flex-wrap">
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
        {!archiveMode && (
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
              {Object.entries(STATUS_LABELS)
                .filter(([k]) => k !== "left" && k !== "closed")
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
          </div>
        )}
        {!archiveMode && (
          <select
            value={taxSystem}
            onChange={(e) => {
              setTaxSystem(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] bg-white"
          >
            <option value="">Все системы Н/О</option>
            {Object.entries(TAX_SYSTEM_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        )}
        <select
          value={archiveMode ? "__archive__" : sectionId}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__archive__") {
              setArchiveMode(true);
              setSectionId("");
              setStatusFilter("");
            } else {
              setArchiveMode(false);
              setSectionId(v);
            }
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
          <option value="__archive__">Архив</option>
        </select>

        <div className="sm:ml-auto">
          <ColumnPicker visibleCols={visibleCols} onChange={handleColsChange} />
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      {loading ? (
        <div className="text-slate-400 text-sm">Загрузка...</div>
      ) : organizations.length === 0 ? (
        <div className="text-slate-400 text-sm">Организации не найдены</div>
      ) : (
        <>
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-4 py-3 font-medium text-slate-400 whitespace-nowrap text-right w-10">
                    №
                  </th>
                  <th
                    className="text-left px-4 py-3 font-medium text-slate-500 whitespace-nowrap cursor-pointer select-none hover:text-slate-700"
                    onClick={() => handleSort("name")}
                  >
                    Название
                    <SortIcon colKey="name" sortBy={sortBy} sortOrder={sortOrder} />
                  </th>
                  {COLUMN_DEFS.filter((c) => visibleCols.includes(c.key)).map((col) => (
                    <th
                      key={col.key}
                      className={`text-left px-4 py-3 font-medium text-slate-500 whitespace-nowrap ${SORTABLE_COLS.has(col.key) ? "cursor-pointer select-none hover:text-slate-700" : ""}`}
                      onClick={SORTABLE_COLS.has(col.key) ? () => handleSort(col.key) : undefined}
                    >
                      {col.label}
                      {SORTABLE_COLS.has(col.key) && (
                        <SortIcon colKey={col.key} sortBy={sortBy} sortOrder={sortOrder} />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {organizations.map((org, i) => (
                  <tr key={org.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-slate-400 text-sm text-right tabular-nums whitespace-nowrap">
                      {(page - 1) * limit + i + 1}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                      <Link
                        to={`/organizations/${org.id}`}
                        className="text-[#6567F1] hover:underline"
                      >
                        {org.name}
                      </Link>
                    </td>
                    {COLUMN_DEFS.filter((c) => visibleCols.includes(c.key)).map((col) => (
                      <td key={col.key} className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {col.key === "status" ? (
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(org.status)}`}
                          >
                            {STATUS_LABELS[org.status] || org.status}
                          </span>
                        ) : col.key === "debtAmount" && org.debtAmount > 0 ? (
                          <span className="text-red-600 font-medium">
                            {fmtMoney(org.debtAmount)}
                          </span>
                        ) : (
                          (() => {
                            const val = renderCell(col.key, org);
                            if (val?.__expiry) return <span className={val.cls}>{val.label}</span>;
                            return val;
                          })()
                        )}
                      </td>
                    ))}
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
