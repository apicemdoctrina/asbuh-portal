import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Settings,
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  FileSpreadsheet,
  Check,
  Clock,
  AlertCircle,
  Ban,
  Search,
} from "lucide-react";

const FREQUENCY_LABELS = { MONTHLY: "Ежемесячно", QUARTERLY: "Ежеквартально", YEARLY: "Ежегодно" };
const FREQUENCY_SHORT = { MONTHLY: "Мес.", QUARTERLY: "Кв.", YEARLY: "Год" };
const FREQUENCY_OPTIONS = ["QUARTERLY", "MONTHLY", "YEARLY"];

const STATUS_OPTIONS = [
  { value: "NOT_SUBMITTED", label: "Не сдана", icon: Clock, color: "bg-muted text-subtle" },
  {
    value: "SUBMITTED",
    label: "Сдана",
    icon: Check,
    color: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
  },
  {
    value: "ACCEPTED",
    label: "Принята",
    icon: Check,
    color: "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300",
  },
  {
    value: "REJECTED",
    label: "Отклонена",
    icon: AlertCircle,
    color: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
  },
  { value: "NOT_APPLICABLE", label: "—", icon: Ban, color: "bg-transparent text-subtle" },
];

const STATUS_MAP = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s]));

function periodLabel(frequency, period) {
  if (frequency === "MONTHLY") {
    const months = [
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
    return months[period] || `${period}`;
  }
  if (frequency === "QUARTERLY") return `${period} квартал`;
  return "Год";
}

function getPeriods(frequency) {
  if (frequency === "MONTHLY") return Array.from({ length: 12 }, (_, i) => i + 1);
  if (frequency === "QUARTERLY") return [1, 2, 3, 4];
  return [0];
}

function getCurrentPeriod(frequency) {
  const now = new Date();
  if (frequency === "MONTHLY") return now.getMonth() + 1;
  if (frequency === "QUARTERLY") return Math.ceil((now.getMonth() + 1) / 3);
  return 0;
}

// ─── Status Cell ───
function StatusCell({ entry, orgId, rtId, year, period, canEdit, onUpdate, compact = true }) {
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const status = entry?.status || "NOT_SUBMITTED";
  const info = STATUS_MAP[status];
  const isNA = status === "NOT_APPLICABLE";

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  async function handleSelect(next) {
    setOpen(false);
    if (!canEdit || saving || next === status) return;
    setSaving(true);
    try {
      const res = await api("/api/reporting/entry", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: orgId,
          reportTypeId: rtId,
          year,
          period,
          status: next,
        }),
      });
      if (res.ok) onUpdate(orgId, rtId, await res.json());
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  if (saving) {
    return (
      <div className="w-full h-full flex items-center justify-center py-1.5">
        <Loader2 size={14} className="animate-spin text-subtle" />
      </div>
    );
  }

  const labelCls = compact ? "hidden xl:inline" : "inline";

  // Read-only
  if (!canEdit) {
    if (isNA)
      return <div className="w-full text-center text-subtle text-base font-medium py-1.5">—</div>;
    const Icon = info.icon;
    return (
      <div
        className={`w-full flex items-center justify-center gap-1 text-xs font-medium rounded-md px-2 py-1.5 ${info.color}`}
      >
        <Icon size={14} />
        <span className={labelCls}>{info.label}</span>
      </div>
    );
  }

  // Editable
  const Icon = isNA ? null : info.icon;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-center gap-1 text-xs font-medium rounded-md px-2 py-1.5 transition-colors ${
          isNA ? "text-subtle hover:text-subtle" : `${info.color} hover:opacity-80`
        }`}
      >
        {isNA ? (
          "—"
        ) : (
          <>
            <Icon size={14} />
            <span className={labelCls}>{info.label}</span>
          </>
        )}
      </button>

      {open && (
        <div className="absolute z-50 top-full right-0 mt-1 w-44 bg-surface rounded-xl shadow-xl border border-line py-1 animate-in fade-in zoom-in-95 duration-100">
          {STATUS_OPTIONS.map((opt) => {
            const OptIcon = opt.icon;
            const active = opt.value === status;
            return (
              <button
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                  active ? "bg-canvas font-semibold" : "hover:bg-canvas"
                }`}
              >
                <span
                  className={`flex items-center justify-center w-5 h-5 rounded-md ${opt.color}`}
                >
                  <OptIcon size={12} />
                </span>
                <span className="text-body">
                  {opt.value === "NOT_APPLICABLE" ? "Не применимо" : opt.label}
                </span>
                {active && <Check size={12} className="ml-auto text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Report Types Manager Modal ───
function ReportTypesModal({ onClose, onSaved }) {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null); // null = closed, {} = new/edit

  useEffect(() => {
    loadTypes();
  }, []);

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function loadTypes() {
    setLoading(true);
    try {
      const res = await api("/api/reporting/types");
      if (res.ok) setTypes(await res.json());
    } catch {
      /* */
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    const method = form.id ? "PUT" : "POST";
    const url = form.id ? `/api/reporting/types/${form.id}` : "/api/reporting/types";
    const res = await api(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        code: form.code,
        frequency: form.frequency,
        order: Number(form.order) || 0,
        isActive: form.isActive !== false,
      }),
    });
    if (res.ok) {
      setForm(null);
      loadTypes();
      onSaved?.();
    }
  }

  async function handleDelete(id) {
    if (!confirm("Удалить тип отчёта?")) return;
    const res = await api(`/api/reporting/types/${id}`, { method: "DELETE" });
    if (res.ok) {
      loadTypes();
      onSaved?.();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:bg-black/30 sm:p-4">
      <div className="bg-surface w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[80vh] rounded-t-3xl sm:rounded-2xl shadow-2xl border-x border-t sm:border border-line flex flex-col animate-slide-up sm:animate-none">
        {/* Drag handle (mobile only) */}
        <div className="sm:hidden pt-2 pb-1 flex justify-center shrink-0">
          <div className="w-10 h-1 rounded-full bg-line" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 pt-2 sm:pt-4 pb-3 sm:pb-4 border-b border-line shrink-0">
          <h2 className="text-base sm:text-lg font-semibold text-heading">Типы отчётов</h2>
          <button
            onClick={onClose}
            className="p-2 -mr-1 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors"
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-subtle">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {types.map((t) => (
                <div
                  key={t.id}
                  className="flex items-start gap-2 p-3 rounded-lg border border-line transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-heading break-words leading-snug">
                      {t.name}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span className="text-[11px] text-subtle bg-muted rounded px-1.5 py-0.5 font-mono">
                        {t.code}
                      </span>
                      <span
                        className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${t.isActive ? "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300" : "bg-muted text-subtle"}`}
                      >
                        {t.isActive ? "Активен" : "Выключен"}
                      </span>
                      <span className="text-[11px] text-subtle">
                        {FREQUENCY_LABELS[t.frequency]} · №{t.order}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => setForm({ ...t })}
                      className="p-2 rounded-lg text-subtle hover:text-primary hover:bg-primary/5 transition-colors"
                      aria-label="Редактировать"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="p-2 rounded-lg text-subtle hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors"
                      aria-label="Удалить"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add / Edit form */}
          {form !== null && (
            <div className="mt-4 p-4 rounded-xl border-2 border-primary/20 bg-primary/5 space-y-3">
              <h3 className="text-sm font-semibold text-heading">
                {form.id ? "Редактировать" : "Новый тип"}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  className="border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Название"
                  value={form.name || ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <input
                  className="border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Код (уникальный)"
                  value={form.code || ""}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
                <select
                  className="border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={form.frequency || "QUARTERLY"}
                  onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                >
                  {FREQUENCY_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {FREQUENCY_LABELS[f]}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  className="border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Порядок"
                  value={form.order ?? 0}
                  onChange={(e) => setForm({ ...form, order: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-body">
                <input
                  type="checkbox"
                  checked={form.isActive !== false}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="rounded border-line"
                />
                Активен
              </label>
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white text-sm font-medium shadow-lg shadow-[#6567F1]/30 transition-all"
                >
                  <Save size={14} />
                  Сохранить
                </button>
                <button
                  onClick={() => setForm(null)}
                  className="px-4 py-2 rounded-lg text-sm text-body hover:bg-muted transition-colors"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-line px-6 py-3">
          <button
            onClick={() =>
              setForm({
                name: "",
                code: "",
                frequency: "QUARTERLY",
                order: types.length + 1,
                isActive: true,
              })
            }
            className="flex items-center gap-1.5 text-sm text-primary font-medium hover:text-[#4547D1] transition-colors"
          >
            <Plus size={16} />
            Добавить тип
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───
export default function ReportingPage() {
  const { hasPermission, hasRole } = useAuth();
  const canEdit = hasPermission("reporting", "edit");
  const isAdmin = hasRole("admin") || hasRole("supervisor");

  const [frequency, setFrequency] = useState("QUARTERLY");
  const [year, setYear] = useState(new Date().getFullYear());
  const [period, setPeriod] = useState(getCurrentPeriod("QUARTERLY"));

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showTypes, setShowTypes] = useState(false);
  const [sectionFilter, setSectionFilter] = useState("");
  const [search, setSearch] = useState("");
  const [onlyProblems, setOnlyProblems] = useState(false);

  const periods = getPeriods(frequency);

  const fetchMatrix = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(
        `/api/reporting/matrix?year=${year}&period=${period}&frequency=${frequency}`,
      );
      if (res.ok) setData(await res.json());
    } catch {
      /* */
    } finally {
      setLoading(false);
    }
  }, [year, period, frequency]);

  useEffect(() => {
    fetchMatrix();
  }, [fetchMatrix]);

  // When frequency changes, reset period to current
  useEffect(() => {
    setPeriod(getCurrentPeriod(frequency));
  }, [frequency]);

  function handleEntryUpdate(orgId, rtId, updated) {
    setData((prev) => ({
      ...prev,
      entries: { ...prev.entries, [`${orgId}_${rtId}`]: updated },
    }));
  }

  function handlePrevPeriod() {
    if (frequency === "YEARLY") {
      setYear((y) => y - 1);
    } else {
      const min = periods[0];
      if (period <= min) {
        setPeriod(periods[periods.length - 1]);
        setYear((y) => y - 1);
      } else {
        setPeriod((p) => p - 1);
      }
    }
  }

  function handleNextPeriod() {
    if (frequency === "YEARLY") {
      setYear((y) => y + 1);
    } else {
      const max = periods[periods.length - 1];
      if (period >= max) {
        setPeriod(periods[0]);
        setYear((y) => y + 1);
      } else {
        setPeriod((p) => p + 1);
      }
    }
  }

  // Unique sections from orgs
  const sections = data
    ? (() => {
        const map = new Map();
        data.organizations?.forEach((o) => {
          if (o.section && !map.has(o.section.id)) map.set(o.section.id, o.section);
        });
        return [...map.values()].sort((a, b) => a.number - b.number);
      })()
    : [];

  // Filter organizations by section, search query, and "only problems"
  const searchNorm = search.trim().toLowerCase();
  const filteredOrgs = (() => {
    let list =
      data?.organizations?.filter((o) => !sectionFilter || o.section?.id === sectionFilter) ?? [];
    if (searchNorm) {
      list = list.filter((o) => {
        const name = (o.name || "").toLowerCase();
        const inn = (o.inn || "").toLowerCase();
        return name.includes(searchNorm) || inn.includes(searchNorm);
      });
    }
    if (onlyProblems && data) {
      list = list.filter((o) => {
        for (const rt of data.reportTypes || []) {
          const key = `${o.id}_${rt.id}`;
          const applicable = data.applicability?.[key] !== false;
          if (!applicable) continue;
          const status = data.entries[key]?.status || "NOT_SUBMITTED";
          if (status === "NOT_SUBMITTED" || status === "REJECTED") return true;
        }
        return false;
      });
    }
    return list;
  })();

  // Stats (based on filtered orgs)
  const stats = data
    ? (() => {
        const orgIds = new Set(filteredOrgs.map((o) => o.id));
        const entries = Object.values(data.entries).filter((e) => orgIds.has(e.organizationId));
        // Count only applicable cells
        let applicableCount = 0;
        for (const org of filteredOrgs) {
          for (const rt of data.reportTypes || []) {
            if (data.applicability?.[`${org.id}_${rt.id}`] !== false) applicableCount++;
          }
        }
        const submitted = entries.filter((e) => e.status === "SUBMITTED").length;
        const accepted = entries.filter((e) => e.status === "ACCEPTED").length;
        const rejected = entries.filter((e) => e.status === "REJECTED").length;
        const notSubmitted = applicableCount - submitted - accepted - rejected;
        return { total: applicableCount, submitted, accepted, rejected, notSubmitted };
      })()
    : null;

  return (
    <div>
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-heading">Трекер отчётности</h1>
          <p className="text-xs sm:text-sm text-subtle mt-0.5 sm:mt-1">
            Контроль сдачи отчётов по организациям
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowTypes(true)}
            className="self-start flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-primary/20 text-primary text-sm font-medium hover:bg-primary/5 transition-colors"
          >
            <Settings size={16} />
            Типы отчётов
          </button>
        )}
      </div>

      {/* Filters bar */}
      <div className="bg-surface rounded-2xl shadow-lg border border-line p-3 sm:p-4 mb-4 sm:mb-6">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          {/* Frequency tabs — короткие подписи на мобилке */}
          <div className="flex bg-muted rounded-lg p-0.5">
            {FREQUENCY_OPTIONS.map((f) => (
              <button
                key={f}
                onClick={() => setFrequency(f)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                  frequency === f
                    ? "bg-surface text-primary shadow-sm"
                    : "text-subtle hover:text-body"
                }`}
              >
                <span className="sm:hidden">{FREQUENCY_SHORT[f]}</span>
                <span className="hidden sm:inline">{FREQUENCY_LABELS[f]}</span>
              </button>
            ))}
          </div>

          {/* Period navigation */}
          <div className="flex items-center gap-0.5 sm:gap-1">
            <button
              onClick={handlePrevPeriod}
              className="p-2 sm:p-1.5 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors"
              aria-label="Предыдущий период"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-semibold text-heading min-w-[110px] sm:min-w-[140px] text-center">
              {periodLabel(frequency, period)} {year}
            </div>
            <button
              onClick={handleNextPeriod}
              className="p-2 sm:p-1.5 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors"
              aria-label="Следующий период"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Year quick select */}
          <select
            className="border border-line rounded-lg px-2 sm:px-3 py-1.5 text-xs sm:text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="Год"
          >
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          {/* Section filter — admin/supervisor only */}
          {isAdmin && sections.length > 1 && (
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              className="border border-line rounded-lg px-2 sm:px-3 py-1.5 text-xs sm:text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-auto"
              aria-label="Участок"
            >
              <option value="">Все участки</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  №{s.number}
                  {s.name ? ` — ${s.name}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Search + problem filter — для длинных списков организаций */}
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-line">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Найти организацию по названию или ИНН..."
              className="w-full pl-9 pr-9 py-2 sm:py-1.5 border border-line rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-subtle hover:text-body"
                aria-label="Очистить поиск"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOnlyProblems((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium border transition-colors ${
              onlyProblems
                ? "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30"
                : "bg-surface text-body border-line hover:bg-muted"
            }`}
            aria-pressed={onlyProblems}
          >
            <AlertCircle size={14} />
            Только с пропусками
          </button>
        </div>

        {/* Stats badges — отдельной строкой, переносятся */}
        {stats && (
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-3 pt-3 border-t border-line">
            <span className="text-[11px] sm:text-xs px-2 py-1 rounded-full bg-muted text-body">
              Всего: {stats.total}
            </span>
            <span className="text-[11px] sm:text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300">
              Принято: {stats.accepted}
            </span>
            <span className="text-[11px] sm:text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300">
              Сдано: {stats.submitted}
            </span>
            <span className="text-[11px] sm:text-xs px-2 py-1 rounded-full bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300">
              Отклонено: {stats.rejected}
            </span>
            {stats.notSubmitted > 0 && (
              <span className="text-[11px] sm:text-xs px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300">
                Не сдано: {stats.notSubmitted}
              </span>
            )}
            <span className="ml-auto text-[11px] sm:text-xs text-subtle">
              Показано: {filteredOrgs.length}
              {data?.organizations?.length > filteredOrgs.length &&
                ` из ${data.organizations.length}`}
            </span>
          </div>
        )}
      </div>

      {/* Matrix table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-subtle">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : !data || filteredOrgs.length === 0 ? (
        <div className="bg-surface rounded-2xl shadow-lg border border-line p-8 sm:p-12 text-center">
          <FileSpreadsheet size={48} className="mx-auto text-subtle mb-4" />
          <h3 className="text-lg font-semibold text-body mb-1">
            {search || onlyProblems ? "Ничего не найдено" : "Нет организаций"}
          </h3>
          <p className="text-sm text-subtle">
            {search || onlyProblems
              ? "Попробуйте изменить запрос или снять фильтр"
              : "Для выбранного периода нет доступных организаций"}
          </p>
          {(search || onlyProblems) && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setOnlyProblems(false);
              }}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-primary border-2 border-primary/20 hover:bg-primary/5 transition-colors"
            >
              <X size={14} />
              Сбросить фильтры
            </button>
          )}
        </div>
      ) : data.reportTypes?.length === 0 ? (
        <div className="bg-surface rounded-2xl shadow-lg border border-line p-12 text-center">
          <FileSpreadsheet size={48} className="mx-auto text-subtle mb-4" />
          <h3 className="text-lg font-semibold text-body mb-1">Нет типов отчётов</h3>
          <p className="text-sm text-subtle">
            Добавьте типы отчётов с частотой &laquo;{FREQUENCY_LABELS[frequency]}&raquo;
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: card-per-org */}
          <div className="md:hidden space-y-3">
            {filteredOrgs.map((org) => (
              <div
                key={org.id}
                className="bg-surface rounded-2xl shadow-sm border border-line overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-line bg-canvas/40">
                  <div className="font-semibold text-heading break-words" title={org.name}>
                    {org.name}
                  </div>
                  <div className="text-xs text-subtle flex items-center gap-2 mt-0.5">
                    {org.inn && <span className="tabular-nums">ИНН {org.inn}</span>}
                  </div>
                </div>
                <ul className="divide-y divide-line">
                  {data.reportTypes.map((rt) => {
                    const key = `${org.id}_${rt.id}`;
                    const entry = data.entries[key];
                    const applicable = data.applicability?.[key] !== false;
                    const effectiveEntry =
                      entry || (!applicable ? { status: "NOT_APPLICABLE" } : null);
                    return (
                      <li key={rt.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="text-sm text-body flex-1 min-w-0 truncate">{rt.name}</span>
                        <div className="shrink-0 min-w-[110px]">
                          <StatusCell
                            entry={effectiveEntry}
                            orgId={org.id}
                            rtId={rt.id}
                            year={data.year}
                            period={data.period}
                            canEdit={canEdit}
                            onUpdate={handleEntryUpdate}
                            compact={false}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          {/* Desktop / tablet: matrix table */}
          <div className="hidden md:block bg-surface rounded-2xl shadow-lg border border-line overflow-hidden">
            <div className="overflow-auto max-h-[calc(100vh-260px)]">
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-body sticky top-0 left-0 bg-canvas z-30 min-w-[200px] border-b border-line">
                      Организация
                    </th>
                    {data.reportTypes.map((rt) => (
                      <th
                        key={rt.id}
                        className="text-center px-2 py-3 font-medium text-body min-w-[100px] sticky top-0 bg-canvas z-20 border-b border-line"
                      >
                        <div className="text-xs leading-tight">{rt.name}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredOrgs.map((org, idx) => (
                    <tr key={org.id} className={idx % 2 === 0 ? "bg-surface" : "bg-canvas/50"}>
                      <td className="px-4 py-2 sticky left-0 z-10 bg-inherit border-b border-line">
                        <div
                          className="font-medium text-heading truncate max-w-[240px]"
                          title={org.name}
                        >
                          {org.name}
                        </div>
                        <div className="text-xs text-subtle flex items-center gap-2">
                          {org.inn && <span>ИНН {org.inn}</span>}
                        </div>
                      </td>
                      {data.reportTypes.map((rt) => {
                        const key = `${org.id}_${rt.id}`;
                        const entry = data.entries[key];
                        const applicable = data.applicability?.[key] !== false;
                        const effectiveEntry =
                          entry || (!applicable ? { status: "NOT_APPLICABLE" } : null);
                        return (
                          <td key={rt.id} className="px-1.5 py-1.5 border-b border-line">
                            <StatusCell
                              entry={effectiveEntry}
                              orgId={org.id}
                              rtId={rt.id}
                              year={data.year}
                              period={data.period}
                              canEdit={canEdit}
                              onUpdate={handleEntryUpdate}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Report Types Manager */}
      {showTypes && <ReportTypesModal onClose={() => setShowTypes(false)} onSaved={fetchMatrix} />}
    </div>
  );
}
