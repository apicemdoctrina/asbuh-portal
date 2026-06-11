import { useState, useEffect, useCallback, useRef } from "react";
import { useDebouncedEffect } from "../hooks/useDebouncedEffect.js";
import { Link } from "react-router";
import { api } from "../lib/api.js";
import { fmtMoney } from "../lib/format.js";
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
  X,
  UserCheck,
  UserMinus,
  Loader2,
  Layers,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  Pencil,
  Trash2,
  Settings2,
  Building2,
  LinkIcon,
  Unlink,
  Banknote,
  Calculator,
  FileText,
  ShieldCheck,
  Receipt,
  Users as UsersIcon,
  CalendarClock,
  RefreshCw as RefreshIcon,
} from "lucide-react";
import SectionIcon from "../components/SectionIcon.jsx";

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
const PAYMENT_DEST_LABELS = {
  BANK_TOCHKA: "Банк (Точка)",
  CARD: "Карта",
  CASH: "Наличные",
  UNKNOWN: "Неизвестно",
};

const PAYMENT_FREQ_LABELS = {
  MONTHLY: "Ежемесячно",
  QUARTERLY: "Ежеквартально",
  SEMI_ANNUAL: "Раз в полгода",
};

// Статусы, для которых «Куда поступает платёж» = прочерк
const INACTIVE_STATUSES = new Set(["not_paying", "ceased", "left", "own", "closed", "blacklisted"]);

const STATUS_LABELS = {
  active: "Активный",
  new: "Новый",
  liquidating: "В процессе ликвидации",
  left: "Ушёл",
  closed: "Закрылся",
  not_paying: "Не платит",
  ceased: "Прекратили сотрудничество",
  own: "Наша организация",
  blacklisted: "Чёрный список",
};

function statusBadge(status) {
  const map = {
    active: "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300",
    new: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
    liquidating: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
    left: "bg-muted text-subtle",
    closed: "bg-muted text-subtle",
    not_paying: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
    blacklisted: "bg-slate-900 text-white",
  };
  return map[status] || "bg-muted text-subtle";
}

// ─── Column definitions ────────────────────────────────────────────────────────

const COLUMN_DEFS = [
  { key: "inn", label: "ИНН", editable: true, editType: "text" },
  { key: "form", label: "Форма", editable: true, editType: "select", options: ORG_FORM_LABELS },
  { key: "section", label: "Участок", editable: true, editType: "section" },
  { key: "status", label: "Статус", editable: true, editType: "select", options: STATUS_LABELS },
  {
    key: "taxSystems",
    label: "Система Н/О",
    editable: true,
    editType: "multiselect",
    options: TAX_SYSTEM_LABELS,
  },
  { key: "employeeCount", label: "Сотрудников", editable: true, editType: "number" },
  {
    key: "serviceType",
    label: "Тип обслуживания",
    editable: true,
    editType: "select",
    options: SERVICE_TYPE_LABELS,
  },
  { key: "monthlyPayment", label: "Ежемес. платёж", editable: true, editType: "number" },
  { key: "debtAmount", label: "Задолженность", editable: true, editType: "number" },
  {
    key: "paymentDestination",
    label: "Куда поступает платёж",
    editable: true,
    editType: "select",
    options: PAYMENT_DEST_LABELS,
  },
  {
    key: "paymentFrequency",
    label: "Частота оплаты",
    editable: true,
    editType: "select",
    options: PAYMENT_FREQ_LABELS,
  },
  { key: "serviceStartDate", label: "Начало обслуживания", editable: true, editType: "date" },
  {
    key: "reportingChannel",
    label: "Отчётность",
    editable: true,
    editType: "select",
    options: REPORTING_CHANNEL_LABELS,
  },
  {
    key: "digitalSignature",
    label: "ЭЦП",
    editable: true,
    editType: "select",
    options: DIGITAL_SIGNATURE_LABELS,
  },
  { key: "digitalSignatureExpiry", label: "Срок ЭЦП", editable: true, editType: "date" },
  { key: "hasCashRegister", label: "Касса", editable: true, editType: "boolean" },
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
  if (sortBy !== colKey) return <ArrowUpDown size={13} className="ml-1 text-subtle inline-block" />;
  return sortOrder === "asc" ? (
    <ArrowUp size={13} className="ml-1 text-primary inline-block" />
  ) : (
    <ArrowDown size={13} className="ml-1 text-primary inline-block" />
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
      return org.section ? <SectionIcon section={org.section} showNumber size={14} /> : "—";
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
    case "paymentDestination":
      if (INACTIVE_STATUSES.has(org.status)) return "—";
      return PAYMENT_DEST_LABELS[org.paymentDestination] || "—";
    case "paymentFrequency":
      return PAYMENT_FREQ_LABELS[org.paymentFrequency] || "—";
    case "serviceStartDate":
      return org.serviceStartDate
        ? new Date(org.serviceStartDate).toLocaleDateString("ru-RU")
        : "—";
    case "reportingChannel":
      return REPORTING_CHANNEL_LABELS[org.reportingChannel] || "—";
    case "digitalSignature":
      return DIGITAL_SIGNATURE_LABELS[org.digitalSignature] || "—";
    case "digitalSignatureExpiry": {
      if (!org.digitalSignatureExpiry) return "—";
      const date = new Date(org.digitalSignatureExpiry);
      const daysLeft = Math.ceil((date - Date.now()) / 86400000);
      const label = date.toLocaleDateString("ru-RU");
      if (daysLeft < 0)
        return { __expiry: true, label, cls: "text-red-600 dark:text-red-300 font-medium" };
      if (daysLeft <= 30)
        return {
          __expiry: true,
          label: `${label} (${daysLeft} дн.)`,
          cls: "text-amber-600 dark:text-amber-300 font-medium",
        };
      return { __expiry: true, label, cls: "text-body" };
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

// ─── Inline editor ────────────────────────────────────────────────────────────

function InlineEditor({ col, org, sections, onSave, onCancel }) {
  const fieldKey = col.key === "section" ? "sectionId" : col.key;

  const getRawValue = () => {
    if (col.editType === "section") return org.section?.id || "";
    if (col.editType === "date") {
      if (!org[col.key]) return "";
      return new Date(org[col.key]).toISOString().slice(0, 10);
    }
    if (col.editType === "number") return org[col.key] ?? "";
    if (col.editType === "boolean") return !!org[col.key];
    if (col.editType === "multiselect") return org[col.key] || [];
    return org[col.key] ?? "";
  };

  const [value, setValue] = useState(getRawValue);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const save = () => {
    let payload;
    if (col.editType === "number") {
      payload = value === "" ? null : Number(value);
    } else if (col.editType === "boolean") {
      payload = value;
    } else if (col.editType === "date") {
      payload = value || null;
    } else if (col.editType === "section") {
      payload = value || null;
    } else if (col.editType === "select") {
      payload = value || null;
    } else if (col.editType === "multiselect") {
      payload = value;
    } else {
      payload = value || null;
    }
    onSave(fieldKey, payload);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
    if (e.key === "Escape") onCancel();
  };

  const cls =
    "w-full px-2 py-1 border border-primary rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-surface";

  if (col.editType === "boolean") {
    return (
      <select
        ref={inputRef}
        value={value ? "true" : "false"}
        onChange={(e) => {
          const next = e.target.value === "true";
          setValue(next);
        }}
        onKeyDown={handleKeyDown}
        onBlur={save}
        className={cls}
      >
        <option value="true">Да</option>
        <option value="false">Нет</option>
      </select>
    );
  }

  if (col.editType === "select") {
    return (
      <select
        ref={inputRef}
        value={value || ""}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={save}
        className={cls}
      >
        <option value="">—</option>
        {Object.entries(col.options).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    );
  }

  if (col.editType === "section") {
    return (
      <select
        ref={inputRef}
        value={value || ""}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={save}
        className={cls}
      >
        <option value="">—</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>
            №{s.number} {s.name || ""}
          </option>
        ))}
      </select>
    );
  }

  if (col.editType === "multiselect") {
    return (
      <div className="flex flex-wrap gap-1">
        {Object.entries(col.options).map(([k, v]) => (
          <label
            key={k}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs cursor-pointer border ${
              value.includes(k)
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-surface border-line text-subtle"
            }`}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={value.includes(k)}
              onChange={(e) => {
                if (e.target.checked) setValue([...value, k]);
                else setValue(value.filter((x) => x !== k));
              }}
              onKeyDown={handleKeyDown}
            />
            {v}
          </label>
        ))}
        <button
          onClick={save}
          className="px-2 py-0.5 rounded text-xs bg-primary text-white hover:bg-[#5557E1]"
        >
          ✓
        </button>
        <button
          onClick={onCancel}
          className="px-2 py-0.5 rounded text-xs bg-muted text-body hover:bg-line"
        >
          ✕
        </button>
      </div>
    );
  }

  if (col.editType === "date") {
    return (
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={save}
        className={cls}
      />
    );
  }

  // text / number
  return (
    <input
      ref={inputRef}
      type={col.editType === "number" ? "number" : "text"}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={save}
      className={cls}
      step={col.editType === "number" ? "any" : undefined}
    />
  );
}

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
            ? "border-primary text-primary bg-primary/5"
            : "border-line text-body hover:bg-canvas"
        }`}
      >
        <SlidersHorizontal size={15} />
        Столбцы
        {visibleCols.length !== DEFAULT_COLS.length && (
          <span className="ml-0.5 bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
            {visibleCols.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-surface border border-line rounded-xl shadow-xl p-3 w-52">
          <p className="text-[11px] font-semibold text-subtle uppercase tracking-wide mb-2 px-1">
            Название — всегда
          </p>
          <div className="space-y-0.5">
            {COLUMN_DEFS.map(({ key, label }) => (
              <label
                key={key}
                className="flex items-center gap-2.5 px-1 py-1 rounded-lg hover:bg-canvas cursor-pointer text-sm text-body"
              >
                <input
                  type="checkbox"
                  checked={visibleCols.includes(key)}
                  onChange={() => toggle(key)}
                  className="w-4 h-4 rounded border-line text-primary focus:ring-primary/30"
                />
                {label}
              </label>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-line flex gap-2">
            <button
              onClick={() => onChange(COLUMN_DEFS.map((c) => c.key))}
              className="flex-1 text-xs text-primary hover:underline text-center"
            >
              Все
            </button>
            <button
              onClick={() => onChange(DEFAULT_COLS)}
              className="flex-1 text-xs text-subtle hover:underline text-center"
            >
              По умолчанию
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Bulk assign/remove modal ──────────────────────────────────────────────────

function BulkModal({ mode, selectedIds, onClose, onSuccess }) {
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const endpoint =
      mode === "remove" ? "/api/organizations/bulk/members" : "/api/organizations/bulk/non-members";
    const fetchUsers = api(endpoint, {
      method: "POST",
      body: JSON.stringify({ organizationIds: [...selectedIds] }),
    });
    fetchUsers
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Ошибка загрузки"))))
      .then((d) => setAllUsers(Array.isArray(d) ? d : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit() {
    if (!selectedUser) return;
    setSubmitting(true);
    setError("");
    try {
      const endpoint =
        mode === "assign" ? "/api/organizations/bulk/assign" : "/api/organizations/bulk/remove";
      const res = await api(endpoint, {
        method: "POST",
        body: JSON.stringify({ organizationIds: [...selectedIds], userId: selectedUser.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка");
      }
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const title = mode === "assign" ? "Назначить ответственного" : "Снять ответственного";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-heading">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-subtle mb-1">
          Выбрано организаций: <span className="font-semibold text-body">{selectedIds.size}</span>
        </p>
        <p className="text-xs text-subtle mb-3">
          {mode === "remove"
            ? "Показаны только ответственные, закреплённые за выбранными организациями"
            : "Показаны только сотрудники, не закреплённые ни за одной из выбранных организаций"}
        </p>

        <div className="border border-line rounded-lg overflow-hidden mb-4 h-52 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full text-subtle">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : allUsers.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-subtle">
              Пользователи не найдены
            </div>
          ) : (
            allUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => setSelectedUser(u)}
                className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-b border-line last:border-0 ${
                  selectedUser?.id === u.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-canvas text-body"
                }`}
              >
                <div className="font-medium">
                  {u.lastName} {u.firstName} {u.middleName || ""}
                </div>
                <div className="text-xs text-subtle">{u.email}</div>
              </button>
            ))
          )}
        </div>

        {error && (
          <div className="mb-3 p-3 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border-2 border-primary/20 text-primary hover:bg-primary/5 rounded-lg text-sm font-medium transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedUser || submitting}
            className="px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50"
          >
            {submitting ? "Выполнение..." : title}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Org assign modal ──────────────────────────────────────────────────────────

function OrgAssignModal({ group, onClose, onChanged }) {
  const [allOrgs, setAllOrgs] = useState([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [search, setSearch] = useState("");
  const [working, setWorking] = useState(false); // id орги, над которой идёт запрос
  const [error, setError] = useState("");

  useEffect(() => {
    setLoadingOrgs(true);
    api("/api/organizations?limit=500")
      .then((r) => (r.ok ? r.json() : { organizations: [] }))
      .then((d) => setAllOrgs(d.organizations || []))
      .catch(() => {})
      .finally(() => setLoadingOrgs(false));
  }, []);

  const inGroup = allOrgs.filter((o) => o.clientGroup?.id === group.id);
  const q = search.toLowerCase();
  const available = allOrgs.filter(
    (o) =>
      o.clientGroup?.id !== group.id &&
      (o.name.toLowerCase().includes(q) || (o.inn || "").includes(q)),
  );

  async function assign(orgId) {
    setWorking(orgId);
    setError("");
    try {
      const res = await api(`/api/organizations/${orgId}`, {
        method: "PUT",
        body: JSON.stringify({ clientGroupId: group.id }),
      });
      if (!res.ok) throw new Error("Ошибка");
      setAllOrgs((prev) =>
        prev.map((o) =>
          o.id === orgId ? { ...o, clientGroup: { id: group.id, name: group.name } } : o,
        ),
      );
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  async function unassign(orgId) {
    setWorking(orgId);
    setError("");
    try {
      const res = await api(`/api/organizations/${orgId}`, {
        method: "PUT",
        body: JSON.stringify({ clientGroupId: null }),
      });
      if (!res.ok) throw new Error("Ошибка");
      setAllOrgs((prev) => prev.map((o) => (o.id === orgId ? { ...o, clientGroup: null } : o)));
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line shrink-0">
          <div>
            <h2 className="text-base font-bold text-heading">{group.name}</h2>
            <p className="text-xs text-subtle mt-0.5">Управление организациями группы</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {error && (
            <div className="p-2 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg text-xs">
              {error}
            </div>
          )}

          {/* В группе */}
          <div>
            <p className="text-xs font-semibold text-subtle uppercase tracking-wide mb-2">
              В группе ({inGroup.length})
            </p>
            {inGroup.length === 0 ? (
              <p className="text-sm text-subtle">Организаций нет</p>
            ) : (
              <div className="space-y-1">
                {inGroup.map((org) => (
                  <div
                    key={org.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-heading truncate">{org.name}</div>
                      {org.inn && <div className="text-xs text-subtle">{org.inn}</div>}
                    </div>
                    <button
                      disabled={working === org.id}
                      onClick={() => unassign(org.id)}
                      className="shrink-0 p-1.5 rounded-lg text-subtle hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors disabled:opacity-40"
                      title="Открепить"
                    >
                      {working === org.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Unlink size={14} />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Добавить */}
          <div>
            <p className="text-xs font-semibold text-subtle uppercase tracking-wide mb-2">
              Добавить организацию
            </p>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по названию или ИНН..."
                className="w-full pl-8 pr-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            {loadingOrgs ? (
              <div className="flex justify-center py-6 text-subtle">
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : available.length === 0 ? (
              <p className="text-sm text-subtle">
                {search ? "Ничего не найдено" : "Все организации уже в группах"}
              </p>
            ) : (
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {available.map((org) => (
                  <div
                    key={org.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-line hover:border-line hover:bg-canvas transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-heading truncate">{org.name}</div>
                      <div className="text-xs text-subtle">
                        {org.inn || ""}
                        {org.clientGroup && (
                          <span className="ml-2 text-amber-600 dark:text-amber-300">
                            ← {org.clientGroup.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      disabled={working === org.id}
                      onClick={() => assign(org.id)}
                      className="shrink-0 p-1.5 rounded-lg text-subtle hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                      title="Добавить в группу"
                    >
                      {working === org.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <LinkIcon size={14} />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Manage groups modal ───────────────────────────────────────────────────────

function ManageGroupsModal({ groups, onClose, onChanged }) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [assigningGroup, setAssigningGroup] = useState(null);

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await api("/api/client-groups", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Ошибка");
      }
      setNewName("");
      setNewDesc("");
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(g) {
    setEditingId(g.id);
    setEditName(g.name);
    setEditDesc(g.description || "");
    setError("");
  }

  async function handleSaveEdit(id) {
    if (!editName.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await api(`/api/client-groups/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Ошибка");
      }
      setEditingId(null);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(g) {
    const orgCount = g._count?.organizations ?? 0;
    const msg =
      orgCount > 0
        ? `Удалить группу «${g.name}»? ${orgCount} организаций будут откреплены.`
        : `Удалить группу «${g.name}»?`;
    if (!confirm(msg)) return;
    setSaving(true);
    setError("");
    try {
      const res = await api(`/api/client-groups/${g.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Ошибка удаления");
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line shrink-0">
          <h2 className="text-lg font-bold text-heading">Группы клиентов</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-2">
          {groups.length === 0 && (
            <p className="text-sm text-subtle text-center py-4">Групп пока нет</p>
          )}
          {groups.map((g) =>
            editingId === g.id ? (
              <div key={g.id} className="border border-primary/30 rounded-xl p-3 bg-primary/5">
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Название"
                  className="w-full px-3 py-1.5 border border-line rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                <input
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Описание (необязательно)"
                  className="w-full px-3 py-1.5 border border-line rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSaveEdit(g.id)}
                    disabled={saving || !editName.trim()}
                    className="px-3 py-1.5 bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white rounded-lg text-xs font-medium disabled:opacity-50"
                  >
                    Сохранить
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-3 py-1.5 border border-line text-body hover:bg-canvas rounded-lg text-xs font-medium"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={g.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-line hover:border-line hover:bg-canvas transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-heading truncate">{g.name}</div>
                  {g.description && (
                    <div className="text-xs text-subtle truncate">{g.description}</div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setAssigningGroup(g)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-subtle hover:text-primary hover:bg-primary/10 border border-line hover:border-primary/30 transition-colors"
                    title="Управление организациями"
                  >
                    <Building2 size={13} />
                    {g._count?.organizations != null ? g._count.organizations : ""}
                  </button>
                  <button
                    onClick={() => startEdit(g)}
                    className="p-1.5 rounded-lg text-subtle hover:text-primary hover:bg-primary/10 transition-colors"
                    title="Переименовать"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(g)}
                    className="p-1.5 rounded-lg text-subtle hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors"
                    title="Удалить"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ),
          )}
        </div>

        {/* Create form */}
        <div className="border-t border-line px-6 py-4 shrink-0">
          <p className="text-xs font-semibold text-subtle uppercase tracking-wide mb-3">
            Новая группа
          </p>
          {error && (
            <div className="mb-3 p-2 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg text-xs">
              {error}
            </div>
          )}
          <form onSubmit={handleCreate} className="flex flex-col gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Название *"
              required
              className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Описание (необязательно)"
              className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <button
              type="submit"
              disabled={saving || !newName.trim()}
              className="self-end px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-md shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50"
            >
              {saving ? "Сохранение..." : "Создать группу"}
            </button>
          </form>
        </div>
      </div>

      {assigningGroup && (
        <OrgAssignModal
          group={assigningGroup}
          onClose={() => setAssigningGroup(null)}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}

// ─── Grouped view ──────────────────────────────────────────────────────────────

function GroupedView({
  organizations,
  clientGroups,
  visibleCols,
  expandedGroups,
  setExpandedGroups,
  page,
  limit,
  total,
  totalPages,
  setPage,
}) {
  // Build map: groupId → orgs; null key = без группы
  const grouped = new Map();
  grouped.set(null, []);
  for (const g of clientGroups) grouped.set(g.id, []);
  for (const org of organizations) {
    const key = org.clientGroup?.id ?? null;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(org);
  }

  function toggle(key) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const groupList = clientGroups.filter((g) => (grouped.get(g.id) || []).length > 0);
  const ungrouped = grouped.get(null) || [];

  return (
    <>
      <div className="space-y-3">
        {groupList.map((g) => {
          const orgs = grouped.get(g.id) || [];
          const open = expandedGroups.has(g.id);
          return (
            <div
              key={g.id}
              className="bg-surface rounded-2xl shadow-lg border border-line overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-3.5 hover:bg-canvas/50 transition-colors">
                <div className="flex items-center gap-3">
                  <button onClick={() => toggle(g.id)} className="flex items-center gap-3">
                    <Layers size={16} className="text-primary shrink-0" />
                  </button>
                  <Link
                    to={`/client-groups/${g.id}`}
                    className="font-semibold text-primary text-sm hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {g.name}
                  </Link>
                  {g.description && (
                    <span className="text-xs text-subtle hidden sm:block">{g.description}</span>
                  )}
                </div>
                <button onClick={() => toggle(g.id)} className="flex items-center gap-2">
                  <span className="text-xs font-medium text-subtle bg-muted px-2 py-0.5 rounded-full">
                    {orgs.length} орг.
                  </span>
                  {open ? (
                    <ChevronDown size={16} className="text-subtle" />
                  ) : (
                    <ChevronRightIcon size={16} className="text-subtle" />
                  )}
                </button>
              </div>
              {open && (
                <div className="border-t border-line overflow-x-auto">
                  <OrgTable orgs={orgs} visibleCols={visibleCols} />
                </div>
              )}
            </div>
          );
        })}

        {ungrouped.length > 0 && (
          <div className="bg-surface rounded-2xl shadow-lg border border-line overflow-hidden">
            <button
              onClick={() => toggle("__ungrouped__")}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-canvas/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Layers size={16} className="text-subtle shrink-0" />
                <span className="font-semibold text-subtle text-sm">Без группы</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-subtle bg-muted px-2 py-0.5 rounded-full">
                  {ungrouped.length} орг.
                </span>
                {expandedGroups.has("__ungrouped__") ? (
                  <ChevronDown size={16} className="text-subtle" />
                ) : (
                  <ChevronRightIcon size={16} className="text-subtle" />
                )}
              </div>
            </button>
            {expandedGroups.has("__ungrouped__") && (
              <div className="border-t border-line overflow-x-auto">
                <OrgTable orgs={ungrouped} visibleCols={visibleCols} />
              </div>
            )}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-subtle">
            Показано {(page - 1) * limit + 1}–{Math.min(page * limit, total)} из {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="p-2 rounded-lg border border-line text-body hover:bg-canvas disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-body">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="p-2 rounded-lg border border-line text-body hover:bg-canvas disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function OrgTable({ orgs, visibleCols }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {orgs.map((org) => (
          <tr key={org.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
            <td className="px-4 py-3 font-medium text-heading whitespace-nowrap">
              <Link to={`/organizations/${org.id}`} className="text-primary hover:underline">
                {org.name}
              </Link>
              {org.clientGroup && (
                <Link
                  to={`/client-groups/${org.clientGroup.id}`}
                  className="ml-2 text-xs text-subtle hover:text-primary"
                >
                  {org.clientGroup.name}
                </Link>
              )}
            </td>
            {COLUMN_DEFS.filter((c) => visibleCols.includes(c.key)).map((col) => (
              <td key={col.key} className="px-4 py-3 text-body whitespace-nowrap">
                {col.key === "status" ? (
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(org.status)}`}
                  >
                    {STATUS_LABELS[org.status] || org.status}
                  </span>
                ) : col.key === "debtAmount" && org.debtAmount > 0 ? (
                  <span className="text-red-600 dark:text-red-300 font-medium">
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
  );
}

// ─── Filters panel (collapsible on mobile) ────────────────────────────────────

function FiltersPanel({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4 sm:mb-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="sm:hidden w-full mb-3 inline-flex items-center justify-between px-3 py-2 border border-line rounded-lg text-sm font-medium text-body bg-surface"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2">
          <Filter size={15} className="text-subtle" />
          Фильтры и столбцы
        </span>
        {open ? <ChevronDown size={16} /> : <ChevronRightIcon size={16} />}
      </button>
      <div className={open ? "block" : "hidden sm:block"}>{children}</div>
    </div>
  );
}

// ─── Mobile org card ───────────────────────────────────────────────────────────

// Цветовая палитра по статусу: акцент слева, aurora-блик, рамка
const STATUS_ACCENT = {
  active: {
    bar: "linear-gradient(180deg, #10b981 0%, #06b6d4 100%)",
    aurora: "#10b981",
    ring: "rgba(16,185,129,0.45)",
    nameGrad: "linear-gradient(90deg, #6567F1, #06b6d4)",
  },
  new: {
    bar: "linear-gradient(180deg, #06b6d4 0%, #6567F1 100%)",
    aurora: "#06b6d4",
    ring: "rgba(6,182,212,0.45)",
    nameGrad: "linear-gradient(90deg, #6567F1, #06b6d4)",
  },
  liquidating: {
    bar: "linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)",
    aurora: "#fbbf24",
    ring: "rgba(245,158,11,0.45)",
    nameGrad: "linear-gradient(90deg, #a855f7, #f59e0b)",
  },
  not_paying: {
    bar: "linear-gradient(180deg, #fb7185 0%, #ef4444 100%)",
    aurora: "#fb7185",
    ring: "rgba(239,68,68,0.45)",
    nameGrad: "linear-gradient(90deg, #ef4444, #a855f7)",
  },
  blacklisted: {
    bar: "linear-gradient(180deg, #475569 0%, #1e293b 100%)",
    aurora: "#64748b",
    ring: "rgba(71,85,105,0.45)",
    nameGrad: "linear-gradient(90deg, #64748b, #1e293b)",
  },
  left: {
    bar: "linear-gradient(180deg, #94a3b8 0%, #64748b 100%)",
    aurora: "#94a3b8",
    ring: "rgba(148,163,184,0.35)",
    nameGrad: "linear-gradient(90deg, #94a3b8, #64748b)",
  },
};
STATUS_ACCENT.closed = STATUS_ACCENT.left;
STATUS_ACCENT.ceased = STATUS_ACCENT.left;
STATUS_ACCENT.own = {
  bar: "linear-gradient(180deg, #a855f7 0%, #6567F1 100%)",
  aurora: "#a855f7",
  ring: "rgba(168,85,247,0.45)",
  nameGrad: "linear-gradient(90deg, #a855f7, #6567F1)",
};

function MobileOrgCard({ org, index, isSelected, canSelect, onToggleSelect }) {
  const expiry = renderCell("digitalSignatureExpiry", org);
  const debt = Number(org.debtAmount) || 0;
  const showDebt = debt > 0;
  const showPaymentDest = !INACTIVE_STATUSES.has(org.status) && org.paymentDestination;
  const accent = STATUS_ACCENT[org.status] || STATUS_ACCENT.new;

  return (
    <div
      className={`relative bg-surface border rounded-2xl pl-4 pr-3 py-3 overflow-hidden transition-all duration-200 ${
        isSelected ? "border-primary/50 shadow-lg" : "border-line hover:shadow-md"
      }`}
      style={
        isSelected
          ? { boxShadow: `0 0 0 1px ${accent.ring}, 0 10px 24px -8px ${accent.ring}` }
          : undefined
      }
    >
      {/* Status accent bar — left edge */}
      <div
        className="pointer-events-none absolute top-0 left-0 bottom-0 w-1"
        style={{ background: accent.bar, boxShadow: `0 0 12px 0 ${accent.ring}` }}
      />
      {/* Aurora glow — top right */}
      <div
        className="pointer-events-none absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-30 dark:opacity-25 blur-3xl"
        style={{ background: `radial-gradient(circle, ${accent.aurora} 0%, transparent 70%)` }}
      />

      <div className="relative flex items-start gap-2.5">
        {canSelect && (
          <input
            type="checkbox"
            className="w-4 h-4 mt-1 rounded border-line text-primary focus:ring-primary/30 shrink-0"
            checked={isSelected}
            onChange={onToggleSelect}
            aria-label="Выбрать"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] text-subtle tabular-nums font-medium tracking-wider">
                #{index}
              </div>
              <Link
                to={`/organizations/${org.id}`}
                className="text-base font-bold leading-tight block hover:opacity-80 transition-opacity"
                style={{
                  background: accent.nameGrad,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {org.name}
              </Link>
              {org.clientGroup && (
                <Link
                  to={`/client-groups/${org.clientGroup.id}`}
                  className="mt-0.5 text-[11px] text-subtle hover:text-primary inline-flex items-center gap-1"
                >
                  <Layers size={10} />
                  {org.clientGroup.name}
                </Link>
              )}
            </div>
            <span
              className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusBadge(org.status)}`}
              style={{ boxShadow: `0 0 8px 0 ${accent.ring}` }}
            >
              {STATUS_LABELS[org.status] || org.status}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-xs">
            {org.inn && (
              <span className="text-subtle tabular-nums">
                <span className="text-[10px] uppercase tracking-wider opacity-70">ИНН </span>
                {org.inn}
              </span>
            )}
            {org.form && (
              <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-semibold">
                {ORG_FORM_LABELS[org.form]}
              </span>
            )}
            {org.section && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-canvas border border-line text-body text-[11px] font-medium">
                <SectionIcon section={org.section} size={11} className="text-primary" />№
                {org.section.number}
              </span>
            )}
            {org.serviceType && (
              <span className="text-subtle text-[11px]">
                · {SERVICE_TYPE_LABELS[org.serviceType]}
              </span>
            )}
          </div>

          {/* Meta facts strip: tax systems, reporting, signature, cash, employees, payment freq */}
          {(org.taxSystems?.length ||
            org.reportingChannel ||
            org.digitalSignature ||
            org.hasCashRegister ||
            org.employeeCount != null ||
            org.paymentFrequency) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {org.taxSystems?.length > 0 && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-primary/10 text-primary"
                  title="Система налогообложения"
                >
                  <Calculator size={10} />
                  {org.taxSystems.map((k) => TAX_SYSTEM_LABELS[k] || k).join(", ")}
                </span>
              )}
              {org.reportingChannel && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-sky-500/10 text-sky-600 dark:text-sky-300"
                  title="Канал отчётности"
                >
                  <FileText size={10} />
                  {REPORTING_CHANNEL_LABELS[org.reportingChannel]}
                </span>
              )}
              {org.digitalSignature && org.digitalSignature !== "NONE" && (
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                    org.digitalSignature === "US"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-300"
                  }`}
                  title="ЭЦП"
                >
                  <ShieldCheck size={10} />
                  ЭЦП: {DIGITAL_SIGNATURE_LABELS[org.digitalSignature]}
                </span>
              )}
              {org.hasCashRegister && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300"
                  title="Онлайн-касса"
                >
                  <Receipt size={10} />
                  Касса
                </span>
              )}
              {org.employeeCount != null && org.employeeCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-canvas border border-line text-body"
                  title="Сотрудников"
                >
                  <UsersIcon size={10} />
                  {org.employeeCount}
                </span>
              )}
              {org.paymentFrequency && org.paymentFrequency !== "MONTHLY" && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-canvas border border-line text-subtle"
                  title="Частота оплаты"
                >
                  <RefreshIcon size={10} />
                  {PAYMENT_FREQ_LABELS[org.paymentFrequency]}
                </span>
              )}
              {org.serviceStartDate && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] text-subtle"
                  title="Начало обслуживания"
                >
                  <CalendarClock size={10} />с{" "}
                  {new Date(org.serviceStartDate).toLocaleDateString("ru-RU", {
                    month: "short",
                    year: "2-digit",
                  })}
                </span>
              )}
            </div>
          )}

          {(showDebt || showPaymentDest || org.monthlyPayment) && (
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 mt-2 text-xs">
              {org.monthlyPayment != null && (
                <span className="inline-flex items-baseline gap-1 text-body tabular-nums font-semibold">
                  {fmtMoney(org.monthlyPayment)}
                  <span className="text-[10px] text-subtle font-normal">/ мес</span>
                </span>
              )}
              {showDebt && (
                <span
                  className="px-1.5 py-0.5 rounded-md font-bold tabular-nums text-red-600 dark:text-red-200 bg-red-500/10"
                  style={{ boxShadow: "0 0 10px 0 rgba(239,68,68,0.35)" }}
                >
                  Долг {fmtMoney(debt)}
                </span>
              )}
              {showPaymentDest && (
                <span className="text-subtle">→ {PAYMENT_DEST_LABELS[org.paymentDestination]}</span>
              )}
            </div>
          )}

          {expiry?.__expiry && (
            <div className="mt-1.5 text-xs">
              <span className="text-subtle">ЭЦП до </span>
              <span className={expiry.cls}>{expiry.label}</span>
            </div>
          )}

          {org.members?.length > 0 && (
            <div className="mt-2 text-xs text-subtle truncate">
              <span className="text-[10px] uppercase tracking-wider opacity-70">Отв. </span>
              <span className="text-body">
                {org.members.map((m) => `${m.user.lastName} ${m.user.firstName[0]}.`).join(", ")}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function OrganizationsPage() {
  const { hasPermission, hasRole } = useAuth();
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

  const [paymentDestFilter, setPaymentDestFilter] = useState("");

  const [clientGroups, setClientGroups] = useState([]);
  const [clientGroupFilter, setClientGroupFilter] = useState("");
  const [groupByClient, setGroupByClient] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [showManageGroups, setShowManageGroups] = useState(false);

  function handleColsChange(next) {
    setVisibleCols(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  // Inline editing state: { orgId, colKey } or null
  const [editingCell, setEditingCell] = useState(null);

  const handleInlineSave = useCallback(
    async (orgId, fieldKey, value) => {
      try {
        const res = await api(`/api/organizations/${orgId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [fieldKey]: value }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(err.error || "Ошибка сохранения");
          return;
        }
        // Update local state
        setOrganizations((prev) =>
          prev.map((o) => {
            if (o.id !== orgId) return o;
            if (fieldKey === "sectionId") {
              const sec = sections.find((s) => s.id === value);
              return { ...o, section: sec || null, sectionId: value };
            }
            return { ...o, [fieldKey]: value };
          }),
        );
      } catch {
        alert("Ошибка сохранения");
      } finally {
        setEditingCell(null);
      }
    },
    [sections],
  );

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkModal, setBulkModal] = useState(null); // "assign" | "remove" | null

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createInn, setCreateInn] = useState("");
  const [createForm, setCreateForm] = useState("");
  const [createSection, setCreateSection] = useState("");
  const [createClientGroup, setCreateClientGroup] = useState("");
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

  const fetchClientGroups = useCallback(() => {
    if (!hasPermission("organization", "view")) return;
    api("/api/client-groups")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setClientGroups(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [hasPermission]);

  useEffect(() => {
    fetchClientGroups();
  }, [fetchClientGroups]);

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
        if (clientGroupFilter) params.set("clientGroupId", clientGroupFilter);
        if (paymentDestFilter) params.set("paymentDestination", paymentDestFilter);
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
  }, [
    page,
    search,
    taxSystem,
    sortBy,
    sortOrder,
    statusFilter,
    sectionId,
    archiveMode,
    clientGroupFilter,
    paymentDestFilter,
  ]);

  useDebouncedEffect(fetchOrganizations, [fetchOrganizations]);

  const totalPages = Math.ceil(total / limit);

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError("");
    if (createInn && !/^\d{10,12}$/.test(createInn.trim())) {
      setCreateError("ИНН должен содержать 10 или 12 цифр");
      return;
    }
    setCreating(true);
    try {
      const res = await api("/api/organizations", {
        method: "POST",
        body: JSON.stringify({
          name: createName.trim(),
          inn: createInn.trim() || undefined,
          form: createForm || undefined,
          sectionId: createSection || undefined,
          clientGroupId: createClientGroup || undefined,
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
      setCreateClientGroup("");
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
      <div className="flex items-center justify-between gap-3 mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-heading">Организации</h1>
        <div className="flex items-center gap-2">
          {(hasRole("manager") || hasRole("accountant")) && (
            <Link
              to="/my-payments"
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 border-2 border-primary/20 text-primary rounded-lg text-sm font-medium hover:bg-primary/5 transition-colors whitespace-nowrap"
            >
              <Banknote size={16} />
              <span className="hidden sm:inline">Оплаты</span>
            </Link>
          )}
          {hasPermission("organization", "create") && !archiveMode && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all whitespace-nowrap"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Создать организацию</span>
              <span className="sm:hidden">Создать</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <FiltersPanel>
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              type="text"
              placeholder="Поиск по названию или ИНН..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full sm:w-72 pl-9 pr-4 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          {!archiveMode && (
            <div className="relative">
              <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="pl-9 pr-4 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
              >
                <option value="">Все статусы</option>
                {Object.entries(STATUS_LABELS)
                  .filter(([k]) => k !== "left" && k !== "closed" && k !== "ceased")
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
              className="px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
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
            className="px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
          >
            <option value="">Все участки</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                №{s.number} {s.name || ""}
              </option>
            ))}
            <option value="__archive__">Архив</option>
          </select>

          {!archiveMode && clientGroups.length > 0 && (
            <select
              value={clientGroupFilter}
              onChange={(e) => {
                setClientGroupFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
            >
              <option value="">Все клиенты</option>
              {clientGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
          {!archiveMode && (
            <select
              value={paymentDestFilter}
              onChange={(e) => {
                setPaymentDestFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
            >
              <option value="">Все платежи</option>
              {Object.entries(PAYMENT_DEST_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          )}
          {!archiveMode && hasPermission("organization", "create") && (
            <button
              onClick={() => setShowManageGroups(true)}
              className="inline-flex items-center gap-2 px-3 py-2 border border-line text-body hover:bg-canvas rounded-lg text-sm font-medium transition-colors"
              title="Управление группами клиентов"
            >
              <Settings2 size={15} />
              Группы
            </button>
          )}

          <div className="sm:ml-auto flex items-center gap-2">
            {!archiveMode && clientGroups.length > 0 && (
              <button
                onClick={() => setGroupByClient((v) => !v)}
                className={`inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
                  groupByClient
                    ? "border-primary text-primary bg-primary/5"
                    : "border-line text-body hover:bg-canvas"
                }`}
              >
                <Layers size={15} />
                По клиентам
              </button>
            )}
            <ColumnPicker visibleCols={visibleCols} onChange={handleColsChange} />
          </div>
        </div>
      </FiltersPanel>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-subtle">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : organizations.length === 0 ? (
        <div className="text-subtle text-sm">Организации не найдены</div>
      ) : groupByClient ? (
        <GroupedView
          organizations={organizations}
          clientGroups={clientGroups}
          visibleCols={visibleCols}
          expandedGroups={expandedGroups}
          setExpandedGroups={setExpandedGroups}
          page={page}
          limit={limit}
          total={total}
          totalPages={Math.ceil(total / limit)}
          setPage={setPage}
        />
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="lg:hidden space-y-2">
            {organizations.map((org, i) => (
              <MobileOrgCard
                key={org.id}
                org={org}
                index={(page - 1) * limit + i + 1}
                isSelected={selectedIds.has(org.id)}
                canSelect={hasRole("admin")}
                onToggleSelect={() =>
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(org.id)) next.delete(org.id);
                    else next.add(org.id);
                    return next;
                  })
                }
              />
            ))}
          </div>

          {/* Desktop: full table */}
          <div className="hidden lg:block bg-surface rounded-2xl shadow-lg border border-line overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/50">
                  {hasRole("admin") && (
                    <th className="pl-4 pr-2 py-3 w-8">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-line text-primary focus:ring-primary/30"
                        checked={
                          organizations.length > 0 &&
                          organizations.every((o) => selectedIds.has(o.id))
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              organizations.forEach((o) => next.add(o.id));
                              return next;
                            });
                          } else {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              organizations.forEach((o) => next.delete(o.id));
                              return next;
                            });
                          }
                        }}
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 font-medium text-subtle whitespace-nowrap text-right w-10">
                    №
                  </th>
                  <th
                    className="text-left px-4 py-3 font-medium text-subtle whitespace-nowrap cursor-pointer select-none hover:text-body"
                    onClick={() => handleSort("name")}
                  >
                    Название
                    <SortIcon colKey="name" sortBy={sortBy} sortOrder={sortOrder} />
                  </th>
                  {COLUMN_DEFS.filter((c) => visibleCols.includes(c.key)).map((col) => (
                    <th
                      key={col.key}
                      className={`text-left px-4 py-3 font-medium text-subtle whitespace-nowrap ${SORTABLE_COLS.has(col.key) ? "cursor-pointer select-none hover:text-body" : ""}`}
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
                  <tr
                    key={org.id}
                    className={`border-b border-line hover:bg-canvas/50 ${selectedIds.has(org.id) ? "bg-primary/5" : ""}`}
                  >
                    {hasRole("admin") && (
                      <td className="pl-4 pr-2 py-3">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-line text-primary focus:ring-primary/30"
                          checked={selectedIds.has(org.id)}
                          onChange={(e) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(org.id);
                              else next.delete(org.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 text-subtle text-sm text-right tabular-nums whitespace-nowrap">
                      {(page - 1) * limit + i + 1}
                    </td>
                    <td className="px-4 py-3 font-medium text-heading whitespace-nowrap">
                      <Link
                        to={`/organizations/${org.id}`}
                        className="text-primary hover:underline"
                      >
                        {org.name}
                      </Link>
                      {org.clientGroup && (
                        <Link
                          to={`/client-groups/${org.clientGroup.id}`}
                          className="ml-2 text-xs text-subtle hover:text-primary"
                        >
                          {org.clientGroup.name}
                        </Link>
                      )}
                    </td>
                    {COLUMN_DEFS.filter((c) => visibleCols.includes(c.key)).map((col) => {
                      const isEditing =
                        editingCell?.orgId === org.id && editingCell?.colKey === col.key;
                      const canEdit =
                        col.editable &&
                        hasPermission("organization", "edit") &&
                        !(col.key === "paymentDestination" && INACTIVE_STATUSES.has(org.status));
                      return (
                        <td
                          key={col.key}
                          className={`px-4 py-3 text-body whitespace-nowrap ${canEdit && !isEditing ? "cursor-pointer hover:bg-primary/5 transition-colors" : ""}`}
                          onDoubleClick={
                            canEdit && !isEditing
                              ? () => setEditingCell({ orgId: org.id, colKey: col.key })
                              : undefined
                          }
                        >
                          {isEditing ? (
                            <InlineEditor
                              col={col}
                              org={org}
                              sections={sections}
                              onSave={(fieldKey, value) =>
                                handleInlineSave(org.id, fieldKey, value)
                              }
                              onCancel={() => setEditingCell(null)}
                            />
                          ) : col.key === "status" ? (
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(org.status)}`}
                            >
                              {STATUS_LABELS[org.status] || org.status}
                            </span>
                          ) : col.key === "debtAmount" && org.debtAmount > 0 ? (
                            <span className="text-red-600 dark:text-red-300 font-medium">
                              {fmtMoney(org.debtAmount)}
                            </span>
                          ) : col.key === "debtAmount" &&
                            org.debtAmount === 0 &&
                            org.clientGroup ? (
                            <Link
                              to={`/client-groups/${org.clientGroup.id}`}
                              className="text-xs text-primary hover:underline"
                            >
                              → группа
                            </Link>
                          ) : (
                            (() => {
                              const val = renderCell(col.key, org);
                              if (val?.__expiry)
                                return <span className={val.cls}>{val.label}</span>;
                              return val;
                            })()
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-subtle">
                Показано {(page - 1) * limit + 1}–{Math.min(page * limit, total)} из {total}
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="p-2 rounded-lg border border-line text-body hover:bg-canvas disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm text-body">
                  {page} / {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="p-2 rounded-lg border border-line text-body hover:bg-canvas disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 sm:bottom-6 left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-40 flex items-center justify-between sm:justify-start gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-3 bg-surface rounded-2xl shadow-xl border border-line">
          <span className="text-sm font-medium text-body whitespace-nowrap">
            <span className="hidden sm:inline">Выбрано: </span>
            <span className="text-primary font-bold">{selectedIds.size}</span>
          </span>
          <div className="hidden sm:block w-px h-5 bg-line" />
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setBulkModal("assign")}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg text-sm font-medium transition-all shadow-md shadow-[#6567F1]/30"
              aria-label="Назначить"
            >
              <UserCheck size={15} />
              <span className="hidden sm:inline">Назначить</span>
            </button>
            <button
              onClick={() => setBulkModal("remove")}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/15 rounded-lg text-sm font-medium transition-colors"
              aria-label="Снять"
            >
              <UserMinus size={15} />
              <span className="hidden sm:inline">Снять</span>
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 border-2 border-primary/20 text-primary hover:bg-primary/5 rounded-lg text-sm font-medium transition-colors"
              aria-label="Снять выделение"
            >
              <X size={14} />
              <span className="hidden sm:inline">Снять выделение</span>
            </button>
          </div>
        </div>
      )}

      {/* Bulk modal */}
      {bulkModal && (
        <BulkModal
          mode={bulkModal}
          selectedIds={selectedIds}
          onClose={() => setBulkModal(null)}
          onSuccess={() => {
            setBulkModal(null);
            setSelectedIds(new Set());
            fetchOrganizations();
          }}
        />
      )}

      {/* Manage groups modal */}
      {showManageGroups && (
        <ManageGroupsModal
          groups={clientGroups}
          onClose={() => setShowManageGroups(false)}
          onChanged={() => {
            fetchClientGroups();
            fetchOrganizations();
          }}
        />
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold text-heading mb-4">Новая организация</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-body mb-1">Название *</label>
                <input
                  type="text"
                  required
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-body mb-1">ИНН</label>
                <input
                  type="text"
                  value={createInn}
                  onChange={(e) => setCreateInn(e.target.value)}
                  className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-body mb-1">
                  Форма собственности
                </label>
                <select
                  value={createForm}
                  onChange={(e) => setCreateForm(e.target.value)}
                  className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
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
                  <label className="block text-sm font-medium text-body mb-1">Участок</label>
                  <select
                    value={createSection}
                    onChange={(e) => setCreateSection(e.target.value)}
                    className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
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
              {clientGroups.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-body mb-1">Группа клиента</label>
                  <select
                    value={createClientGroup}
                    onChange={(e) => setCreateClientGroup(e.target.value)}
                    className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
                  >
                    <option value="">Без группы</option>
                    {clientGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {createError && (
                <div className="p-3 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg text-sm">
                  {createError}
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(false);
                    setCreateError("");
                  }}
                  className="px-4 py-2 border-2 border-primary/20 text-primary hover:bg-primary/5 rounded-lg text-sm font-medium transition-colors"
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
