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
} from "lucide-react";

const FREQUENCY_LABELS = { MONTHLY: "Ежемесячно", QUARTERLY: "Ежеквартально", YEARLY: "Ежегодно" };
const FREQUENCY_OPTIONS = ["QUARTERLY", "MONTHLY", "YEARLY"];

const STATUS_OPTIONS = [
  { value: "NOT_SUBMITTED", label: "Не сдана", icon: Clock, color: "bg-slate-100 text-slate-500" },
  { value: "SUBMITTED", label: "Сдана", icon: Check, color: "bg-blue-100 text-blue-700" },
  { value: "ACCEPTED", label: "Принята", icon: Check, color: "bg-green-100 text-green-700" },
  { value: "REJECTED", label: "Отклонена", icon: AlertCircle, color: "bg-red-100 text-red-700" },
  { value: "NOT_APPLICABLE", label: "—", icon: Ban, color: "bg-transparent text-slate-300" },
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
function StatusCell({ entry, orgId, rtId, year, period, canEdit, onUpdate }) {
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
        <Loader2 size={14} className="animate-spin text-slate-400" />
      </div>
    );
  }

  // Read-only
  if (!canEdit) {
    if (isNA)
      return (
        <div className="w-full text-center text-slate-300 text-base font-medium py-1.5">—</div>
      );
    const Icon = info.icon;
    return (
      <div
        className={`w-full flex items-center justify-center gap-1 text-xs font-medium rounded-md px-1 py-1.5 ${info.color}`}
      >
        <Icon size={14} />
        <span className="hidden xl:inline">{info.label}</span>
      </div>
    );
  }

  // Editable
  const Icon = isNA ? null : info.icon;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-center gap-1 text-xs font-medium rounded-md px-1 py-1.5 transition-colors ${
          isNA ? "text-slate-300 hover:text-slate-400" : `${info.color} hover:opacity-80`
        }`}
      >
        {isNA ? (
          "—"
        ) : (
          <>
            <Icon size={14} />
            <span className="hidden xl:inline">{info.label}</span>
          </>
        )}
      </button>

      {open && (
        <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 w-40 bg-white rounded-xl shadow-xl border border-slate-200 py-1 animate-in fade-in zoom-in-95 duration-100">
          {STATUS_OPTIONS.map((opt) => {
            const OptIcon = opt.icon;
            const active = opt.value === status;
            return (
              <button
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                  active ? "bg-slate-50 font-semibold" : "hover:bg-slate-50"
                }`}
              >
                <span
                  className={`flex items-center justify-center w-5 h-5 rounded-md ${opt.color}`}
                >
                  <OptIcon size={12} />
                </span>
                <span className="text-slate-700">
                  {opt.value === "NOT_APPLICABLE" ? "Не применимо" : opt.label}
                </span>
                {active && <Check size={12} className="ml-auto text-[#6567F1]" />}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Типы отчётов</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {types.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{t.name}</span>
                      <span className="text-xs text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">
                        {t.code}
                      </span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${t.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400"}`}
                      >
                        {t.isActive ? "Активен" : "Выключен"}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {FREQUENCY_LABELS[t.frequency]} · Порядок: {t.order}
                    </div>
                  </div>
                  <button
                    onClick={() => setForm({ ...t })}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-[#6567F1] hover:bg-[#6567F1]/5 transition-colors"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add / Edit form */}
          {form !== null && (
            <div className="mt-4 p-4 rounded-xl border-2 border-[#6567F1]/20 bg-[#6567F1]/5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">
                {form.id ? "Редактировать" : "Новый тип"}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30"
                  placeholder="Название"
                  value={form.name || ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <input
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30"
                  placeholder="Код (уникальный)"
                  value={form.code || ""}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
                <select
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30"
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
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30"
                  placeholder="Порядок"
                  value={form.order ?? 0}
                  onChange={(e) => setForm({ ...form, order: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isActive !== false}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="rounded border-slate-300"
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
                  className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-3">
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
            className="flex items-center gap-1.5 text-sm text-[#6567F1] font-medium hover:text-[#4547D1] transition-colors"
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

  // Filter organizations by section
  const filteredOrgs =
    data?.organizations?.filter((o) => !sectionFilter || o.section?.id === sectionFilter) ?? [];

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Трекер отчётности</h1>
          <p className="text-sm text-slate-500 mt-1">Контроль сдачи отчётов по организациям</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => setShowTypes(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-[#6567F1]/20 text-[#6567F1] text-sm font-medium hover:bg-[#6567F1]/5 transition-colors"
            >
              <Settings size={16} />
              Типы отчётов
            </button>
          )}
        </div>
      </div>

      {/* Filters bar */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          {/* Frequency tabs */}
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            {FREQUENCY_OPTIONS.map((f) => (
              <button
                key={f}
                onClick={() => setFrequency(f)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  frequency === f
                    ? "bg-white text-[#6567F1] shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {FREQUENCY_LABELS[f]}
              </button>
            ))}
          </div>

          {/* Period navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevPeriod}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="px-3 py-1.5 text-sm font-semibold text-slate-900 min-w-[140px] text-center">
              {periodLabel(frequency, period)} {year}
            </div>
            <button
              onClick={handleNextPeriod}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Year quick select */}
          <select
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
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
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30"
            >
              <option value="">Все участки</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  §{s.number}
                  {s.name ? ` — ${s.name}` : ""}
                </option>
              ))}
            </select>
          )}

          {/* Stats badges */}
          {stats && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                Всего: {stats.total}
              </span>
              <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                Принято: {stats.accepted}
              </span>
              <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                Сдано: {stats.submitted}
              </span>
              <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">
                Отклонено: {stats.rejected}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Matrix table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : !data || filteredOrgs.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-12 text-center">
          <FileSpreadsheet size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-1">Нет организаций</h3>
          <p className="text-sm text-slate-500">Для выбранного периода нет доступных организаций</p>
        </div>
      ) : data.reportTypes?.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-12 text-center">
          <FileSpreadsheet size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-1">Нет типов отчётов</h3>
          <p className="text-sm text-slate-500">
            Добавьте типы отчётов с частотой &laquo;{FREQUENCY_LABELS[frequency]}&raquo;
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 sticky left-0 bg-slate-50 z-10 min-w-[200px]">
                    Организация
                  </th>
                  {data.reportTypes.map((rt) => (
                    <th
                      key={rt.id}
                      className="text-center px-2 py-3 font-medium text-slate-600 min-w-[100px]"
                    >
                      <div className="text-xs leading-tight">{rt.name}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredOrgs.map((org, idx) => (
                  <tr
                    key={org.id}
                    className={`border-b border-slate-100 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}
                  >
                    <td className="px-4 py-2 sticky left-0 z-10 bg-inherit">
                      <div
                        className="font-medium text-slate-900 truncate max-w-[240px]"
                        title={org.name}
                      >
                        {org.name}
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-2">
                        {org.inn && <span>ИНН {org.inn}</span>}
                        {org.section && (
                          <span className="text-[#6567F1]">§{org.section.number}</span>
                        )}
                      </div>
                    </td>
                    {data.reportTypes.map((rt) => {
                      const key = `${org.id}_${rt.id}`;
                      const entry = data.entries[key];
                      const applicable = data.applicability?.[key] !== false;
                      return (
                        <td key={rt.id} className="px-1.5 py-1.5">
                          {applicable ? (
                            <StatusCell
                              entry={entry}
                              orgId={org.id}
                              rtId={rt.id}
                              year={data.year}
                              period={data.period}
                              canEdit={canEdit}
                              onUpdate={handleEntryUpdate}
                            />
                          ) : (
                            <div className="w-full text-center text-slate-300 text-base font-medium py-1.5">
                              —
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report Types Manager */}
      {showTypes && <ReportTypesModal onClose={() => setShowTypes(false)} onSaved={fetchMatrix} />}
    </div>
  );
}
