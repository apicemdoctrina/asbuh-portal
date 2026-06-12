import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { api } from "../lib/api.js";
import { useApi, jsonFetcher } from "../hooks/useApi.js";
import { useAuth } from "../context/AuthContext.jsx";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  AlertCircle,
  Plus,
  Trash2,
  Pencil,
  Check,
  X as XIcon,
  Minus,
  UserPlus,
  Map,
  ChevronDown,
  ChevronUp,
  UserMinus,
  Loader2,
  Search,
} from "lucide-react";
import SectionIcon from "../components/SectionIcon.jsx";
import AnimalPicker from "../components/AnimalPicker.jsx";

export const MONTHS_RU = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

export const fmt = (n) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n);

export const fmtShort = (n) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(Math.round(n));
};

export const ROLE_LABELS = { admin: "Администратор", manager: "Менеджер", accountant: "Бухгалтер" };

export function MarginBadge({ margin }) {
  if (margin >= 40)
    return <span className="text-emerald-600 dark:text-emerald-300 font-semibold">{margin}%</span>;
  if (margin >= 20)
    return <span className="text-amber-600 dark:text-amber-300 font-semibold">{margin}%</span>;
  if (margin > 0)
    return <span className="text-red-500 dark:text-red-400 font-semibold">{margin}%</span>;
  return <span className="text-red-600 dark:text-red-300 font-bold">{margin}%</span>;
}

export function calcGrowth(current, prev) {
  if (prev == null || prev === 0) return null;
  return ((current - prev) / Math.abs(prev)) * 100;
}

export const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid var(--color-line)",
  backgroundColor: "var(--color-surface)",
  color: "var(--color-heading)",
  fontSize: 12,
  boxShadow: "0 6px 16px -4px rgba(0,0,0,0.35)",
};
export const tooltipLabelStyle = { color: "var(--color-body)" };
export const tooltipItemStyle = { color: "var(--color-heading)" };

// Theme-agnostic chart accents (resolve as SVG attributes, so no CSS vars here):
// faint neutral grid + a soft primary "glow" cursor behind the hovered bar.
export const chartGridStroke = "rgba(148,163,184,0.25)";
export const chartCursorFill = { fill: "rgba(101,103,241,0.12)" };

// ─── GrowthBadge ──────────────────────────────────────────────────────────────

export function GrowthBadge({ pct, absolute }) {
  if (pct == null) return null;
  const isZero = Math.abs(pct) < 0.5;
  const isPositive = pct > 0;
  if (isZero)
    return (
      <span className="text-xs text-subtle mt-0.5 flex items-center gap-0.5">
        <Minus size={10} /> 0%
      </span>
    );
  return (
    <span
      className={`text-xs mt-0.5 flex items-center gap-0.5 font-medium ${isPositive ? "text-emerald-600 dark:text-emerald-300" : "text-red-500 dark:text-red-400"}`}
    >
      {isPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {isPositive ? "+" : ""}
      {absolute ? `${pct.toFixed(1)} пп` : `${pct.toFixed(1)}%`}
    </span>
  );
}

// ─── KpiCard ─────────────────────────────────────────────────────────────────

export function KpiCard({ icon: Icon, label, value, sub, positive, growth, absoluteGrowth }) {
  const color =
    positive === undefined
      ? "text-primary"
      : positive
        ? "text-emerald-600 dark:text-emerald-300"
        : "text-red-500 dark:text-red-400";
  return (
    <div className="bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-subtle">{label}</span>
        <div className={`p-2 rounded-lg bg-canvas ${color}`}>
          <Icon size={18} />
        </div>
      </div>
      <div className={`text-lg sm:text-xl font-bold leading-tight ${color} break-words`}>
        {value}
      </div>
      <GrowthBadge pct={growth} absolute={absoluteGrowth} />
      {sub && <div className="text-xs text-subtle mt-1">{sub}</div>}
    </div>
  );
}

// ─── ExpenseRow ───────────────────────────────────────────────────────────────

function ExpenseRow({ expense, onDelete, onUpdate }) {
  const isOneTime = expense.type === "ONE_TIME";
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(expense.name);
  const [amount, setAmount] = useState(String(expense.amount));
  const [editDate, setEditDate] = useState(
    expense.date ? new Date(expense.date).toISOString().split("T")[0] : "",
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onUpdate(expense.id, {
        name: name.trim(),
        amount: parseFloat(amount) || 0,
        ...(isOneTime ? { date: editDate || null } : {}),
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setEditing(false);
    setName(expense.name);
    setAmount(String(expense.amount));
    setEditDate(expense.date ? new Date(expense.date).toISOString().split("T")[0] : "");
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-1.5 flex-wrap">
        <input
          className="flex-1 min-w-24 text-sm border border-line rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название"
          autoFocus
        />
        <input
          className="w-24 text-sm border border-line rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
          min="0"
        />
        {isOneTime && (
          <input
            type="date"
            className="w-32 text-sm border border-line rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
            value={editDate}
            onChange={(e) => setEditDate(e.target.value)}
          />
        )}
        <button
          onClick={save}
          disabled={saving}
          className="p-1 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/15 rounded"
        >
          <Check size={15} />
        </button>
        <button
          onClick={cancel}
          className="p-1 text-subtle hover:text-body hover:bg-muted rounded transition-colors"
        >
          <XIcon size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-1.5 group">
      <div className="flex flex-col min-w-0 mr-2">
        <span className="text-sm text-body truncate">{expense.name}</span>
        {isOneTime && expense.date && (
          <span className="text-xs text-subtle">
            {new Date(expense.date).toLocaleDateString("ru-RU")}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-sm font-medium text-heading">{fmt(Number(expense.amount))}</span>
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 ml-1 transition-opacity">
          <button
            onClick={() => setEditing(true)}
            className="p-1 text-subtle hover:text-primary rounded"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => onDelete(expense.id)}
            className="p-1 text-subtle hover:text-red-500 dark:hover:text-red-400 rounded"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ExpensesBlock ────────────────────────────────────────────────────────────

export function ExpensesBlock({ title, type, expenses, onAdd, onDelete, onUpdate }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newDate, setNewDate] = useState("");
  const [saving, setSaving] = useState(false);
  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  async function handleAdd() {
    if (!newName.trim() || !newAmount) return;
    setSaving(true);
    try {
      await onAdd({
        name: newName.trim(),
        amount: parseFloat(newAmount) || 0,
        type,
        ...(type === "ONE_TIME" && newDate ? { date: newDate } : {}),
      });
      setNewName("");
      setNewAmount("");
      setNewDate("");
      setAdding(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 min-w-0">
      <h3 className="text-sm font-semibold text-body mb-2">{title}</h3>
      {expenses.length > 0 ? (
        <div className="divide-y divide-line">
          {expenses.map((e) => (
            <ExpenseRow key={e.id} expense={e} onDelete={onDelete} onUpdate={onUpdate} />
          ))}
        </div>
      ) : (
        !adding && <p className="text-sm text-subtle py-2">Нет расходов</p>
      )}
      {adding ? (
        <div className="mt-2 space-y-2">
          <input
            className="w-full text-sm border border-line rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Название расхода"
            autoFocus
          />
          <div className="flex gap-2">
            <input
              className="flex-1 text-sm border border-line rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              placeholder="Сумма, ₽"
              type="number"
              min="0"
            />
            {type === "ONE_TIME" && (
              <input
                className="flex-1 text-sm border border-line rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                type="date"
              />
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving || !newName.trim() || !newAmount}
              className="flex-1 text-sm py-1.5 bg-primary/10 text-primary rounded hover:bg-primary/20 disabled:opacity-50"
            >
              {saving ? "Сохранение..." : "Добавить"}
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setNewName("");
                setNewAmount("");
                setNewDate("");
              }}
              className="px-3 text-sm text-subtle hover:text-body"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 flex items-center gap-1 text-sm text-primary/60 hover:text-primary"
        >
          <Plus size={14} /> Добавить
        </button>
      )}
      <div className="mt-3 pt-2 border-t border-line flex justify-between items-center">
        <span className="text-xs text-subtle">Итого:</span>
        <span className="text-sm font-semibold text-heading">{fmt(total)}</span>
      </div>
    </div>
  );
}

// ─── IncomeRow ────────────────────────────────────────────────────────────────

function IncomeRow({ income, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(income.name);
  const [amount, setAmount] = useState(String(income.amount));
  const [editDate, setEditDate] = useState(
    income.date ? new Date(income.date).toISOString().split("T")[0] : "",
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onUpdate(income.id, {
        name: name.trim(),
        amount: parseFloat(amount) || 0,
        date: editDate || null,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setEditing(false);
    setName(income.name);
    setAmount(String(income.amount));
    setEditDate(income.date ? new Date(income.date).toISOString().split("T")[0] : "");
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-1.5 flex-wrap">
        <input
          className="flex-1 min-w-24 text-sm border border-line rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название"
          autoFocus
        />
        <input
          className="w-24 text-sm border border-line rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
          min="0"
        />
        <input
          type="date"
          className="w-32 text-sm border border-line rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          value={editDate}
          onChange={(e) => setEditDate(e.target.value)}
        />
        <button
          onClick={save}
          disabled={saving}
          className="p-1 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/15 rounded"
        >
          <Check size={15} />
        </button>
        <button
          onClick={cancel}
          className="p-1 text-subtle hover:text-body hover:bg-muted rounded transition-colors"
        >
          <XIcon size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-1.5 group">
      <div className="flex flex-col min-w-0 mr-2">
        <span className="text-sm text-body truncate">{income.name}</span>
        {income.date && (
          <span className="text-xs text-subtle">
            {new Date(income.date).toLocaleDateString("ru-RU")}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-sm font-medium text-emerald-600 dark:text-emerald-300">
          {fmt(Number(income.amount))}
        </span>
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 ml-1 transition-opacity">
          <button
            onClick={() => setEditing(true)}
            className="p-1 text-subtle hover:text-emerald-600 dark:hover:text-emerald-300 rounded"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => onDelete(income.id)}
            className="p-1 text-subtle hover:text-red-500 dark:hover:text-red-400 rounded"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── IncomeBlock ──────────────────────────────────────────────────────────────

export function IncomeBlock({ incomes, onAdd, onDelete, onUpdate }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newDate, setNewDate] = useState("");
  const [saving, setSaving] = useState(false);
  const total = incomes.reduce((sum, i) => sum + Number(i.amount), 0);

  async function handleAdd() {
    if (!newName.trim() || !newAmount) return;
    setSaving(true);
    try {
      await onAdd({
        name: newName.trim(),
        amount: parseFloat(newAmount) || 0,
        ...(newDate ? { date: newDate } : {}),
      });
      setNewName("");
      setNewAmount("");
      setNewDate("");
      setAdding(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 min-w-0">
      <h3 className="text-sm font-semibold text-body mb-2">Разовые доходы</h3>
      {incomes.length > 0 ? (
        <div className="divide-y divide-line">
          {incomes.map((i) => (
            <IncomeRow key={i.id} income={i} onDelete={onDelete} onUpdate={onUpdate} />
          ))}
        </div>
      ) : (
        !adding && <p className="text-sm text-subtle py-2">Нет доходов</p>
      )}
      {adding ? (
        <div className="mt-2 space-y-2">
          <input
            className="w-full text-sm border border-line rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Название дохода"
            autoFocus
          />
          <div className="flex gap-2">
            <input
              className="flex-1 text-sm border border-line rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              placeholder="Сумма, ₽"
              type="number"
              min="0"
            />
            <input
              type="date"
              className="flex-1 text-sm border border-line rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving || !newName.trim() || !newAmount}
              className="flex-1 text-sm py-1.5 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 rounded hover:bg-emerald-100 dark:hover:bg-emerald-500/15 disabled:opacity-50"
            >
              {saving ? "Сохранение..." : "Добавить"}
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setNewName("");
                setNewAmount("");
                setNewDate("");
              }}
              className="px-3 text-sm text-subtle hover:text-body"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 flex items-center gap-1 text-sm text-emerald-600/60 dark:text-emerald-300 hover:text-emerald-600 dark:hover:text-emerald-300"
        >
          <Plus size={14} /> Добавить
        </button>
      )}
      <div className="mt-3 pt-2 border-t border-line flex justify-between items-center">
        <span className="text-xs text-subtle">Итого:</span>
        <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-300">
          {fmt(total)}
        </span>
      </div>
    </div>
  );
}

// ─── SectionsBlock ────────────────────────────────────────────────────────────

const SECTION_ROLE_LABELS = {
  accountant: "Бухгалтер",
  auditor: "Аудитор",
  manager: "Менеджер",
  admin: "Администратор",
  supervisor: "Руководитель",
};

export function SectionsBlock({ sections, onRefresh }) {
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // inline edit state
  const [editingId, setEditingId] = useState(null);
  const [editNumber, setEditNumber] = useState("");
  const [editName, setEditName] = useState("");
  const [editAnimal, setEditAnimal] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // add member state
  const [addSearch, setAddSearch] = useState("");

  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");
  const [allUsers, setAllUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // create section state
  const [creating, setCreating] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newName, setNewName] = useState("");
  const [newAnimal, setNewAnimal] = useState("");
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState("");

  async function loadDetail(id) {
    setDetailLoading(true);
    const res = await api(`/api/sections/${id}`);
    if (res.ok) {
      const data = await res.json();
      setDetail(data);
      // Load users excluding already members
      setLoadingUsers(true);
      const existingIds = new Set(data.members?.map((m) => m.user.id) ?? []);
      api("/api/users?limit=200&excludeRole=client")
        .then((r) => (r.ok ? r.json() : []))
        .then((users) =>
          setAllUsers((Array.isArray(users) ? users : []).filter((u) => !existingIds.has(u.id))),
        )
        .catch(() => {})
        .finally(() => setLoadingUsers(false));
    }
    setDetailLoading(false);
  }

  function toggleExpand(id) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      setAllUsers([]);
    } else {
      setExpandedId(id);
      setDetail(null);
      setAllUsers([]);
      setAddSearch("");
      setSelectedUser(null);
      setAddError("");
      loadDetail(id);
    }
  }

  function startEdit(s) {
    setEditingId(s.id);
    setEditNumber(String(s.number));
    setEditName(s.name ?? "");
    setEditAnimal(s.animal ?? "");
  }

  async function saveEdit(id) {
    setEditSaving(true);
    try {
      const res = await api(`/api/sections/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          number: parseInt(editNumber),
          name: editName || null,
          animal: editAnimal || null,
        }),
      });
      if (res.ok) {
        setEditingId(null);
        onRefresh();
        if (expandedId === id) loadDetail(id);
      }
    } finally {
      setEditSaving(false);
    }
  }

  async function handleAddMember() {
    if (!selectedUser) return;
    setAddSaving(true);
    setAddError("");
    try {
      const res = await api(`/api/sections/${expandedId}/members`, {
        method: "POST",
        body: JSON.stringify({ email: selectedUser.email, role: "accountant" }),
      });
      if (res.ok) {
        setSelectedUser(null);
        setAddSearch("");
        onRefresh();
        loadDetail(expandedId);
      } else {
        const data = await res.json().catch(() => ({}));
        setAddError(data.error || "Ошибка");
      }
    } finally {
      setAddSaving(false);
    }
  }

  async function handleRemoveMember(userId) {
    const res = await api(`/api/sections/${expandedId}/members/${userId}`, { method: "DELETE" });
    if (res.ok) {
      onRefresh();
      loadDetail(expandedId);
    }
  }

  async function handleCreate() {
    if (!newNumber) return;
    setCreateSaving(true);
    setCreateError("");
    try {
      const res = await api("/api/sections", {
        method: "POST",
        body: JSON.stringify({
          number: parseInt(newNumber),
          name: newName || null,
          animal: newAnimal || null,
        }),
      });
      if (res.ok) {
        setCreating(false);
        setNewNumber("");
        setNewName("");
        setNewAnimal("");
        onRefresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setCreateError(data.error || "Ошибка");
      }
    } finally {
      setCreateSaving(false);
    }
  }

  return (
    <div className="bg-surface rounded-2xl shadow-lg border border-line overflow-hidden">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-line flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Map size={16} className="text-subtle shrink-0" />
          <h2 className="text-base font-semibold text-heading">Участки</h2>
          <span className="text-xs text-subtle bg-muted px-2 py-0.5 rounded-full">
            {sections.length}
          </span>
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-1.5 text-sm text-primary hover:bg-primary/5 px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors shrink-0"
        >
          <Plus size={14} />
          Добавить
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="px-4 sm:px-6 py-4 border-b border-line bg-canvas/50 flex flex-wrap items-end gap-3">
          <div className="w-20">
            <label className="block text-xs text-subtle mb-1">Номер *</label>
            <input
              type="number"
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
              className="w-full px-3 py-1.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="1"
              autoFocus
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-subtle mb-1">Название</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-1.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="Необязательно"
            />
          </div>
          <div>
            <label className="block text-xs text-subtle mb-1">Иконка</label>
            <AnimalPicker
              value={newAnimal}
              onChange={setNewAnimal}
              usedAnimals={sections.filter((s) => s.animal).map((s) => s.animal)}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreate}
              disabled={createSaving || !newNumber}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-[#5557E1] disabled:opacity-50 transition-colors"
            >
              {createSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Создать
            </button>
            <button
              onClick={() => {
                setCreating(false);
                setCreateError("");
              }}
              className="px-3 py-1.5 text-sm text-subtle hover:text-body transition-colors"
            >
              Отмена
            </button>
          </div>
          {createError && (
            <p className="w-full text-xs text-red-600 dark:text-red-300">{createError}</p>
          )}
        </div>
      )}

      {sections.length === 0 ? (
        <div className="px-6 py-8 text-center text-subtle text-sm">Нет участков</div>
      ) : (
        <div className="divide-y divide-line">
          {sections.map((s) => {
            const isExpanded = expandedId === s.id;
            const isEditing = editingId === s.id;

            return (
              <div key={s.id}>
                {/* Section row */}
                <div className="px-4 sm:px-6 py-3 sm:py-3.5 flex items-center gap-2 sm:gap-3 hover:bg-canvas/50 transition-colors">
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1 flex-wrap">
                      <input
                        type="number"
                        value={editNumber}
                        onChange={(e) => setEditNumber(e.target.value)}
                        className="w-16 px-2 py-1 border border-line rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        autoFocus
                      />
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 min-w-[140px] sm:w-48 sm:flex-none px-2 py-1 border border-line rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="Название"
                      />
                      <AnimalPicker
                        value={editAnimal}
                        onChange={setEditAnimal}
                        usedAnimals={sections
                          .filter((x) => x.animal && x.id !== s.id)
                          .map((x) => x.animal)}
                      />
                      <button
                        onClick={() => saveEdit(s.id)}
                        disabled={editSaving}
                        className="p-1.5 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/15 rounded-lg transition-colors"
                      >
                        {editSaving ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Check size={14} />
                        )}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1.5 text-subtle hover:text-body hover:bg-muted rounded-lg transition-colors"
                      >
                        <XIcon size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-3 gap-1">
                        <span className="text-sm font-semibold text-heading flex items-center gap-2 truncate">
                          <SectionIcon section={s} size={15} className="text-primary shrink-0" />
                          <span className="truncate">
                            №{s.number}
                            {s.name ? ` — ${s.name}` : ""}
                          </span>
                        </span>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="flex items-center gap-1 text-xs text-subtle">
                            <Users size={11} />
                            {s._count.members} чел.
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-subtle bg-muted px-2 py-0.5 rounded-full">
                            {s._count.organizations} орг.
                            {s.formCounts?.IP > 0 && (
                              <span className="text-sky-600 dark:text-sky-300 font-medium">
                                {s.formCounts.IP} ИП
                              </span>
                            )}
                            {s.formCounts?.OOO > 0 && (
                              <span className="text-primary font-medium">
                                {s.formCounts.OOO} ООО
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => startEdit(s)}
                        className="p-1.5 text-subtle hover:text-primary hover:bg-primary/5 rounded-lg transition-colors shrink-0"
                        title="Редактировать"
                        aria-label="Редактировать"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => toggleExpand(s.id)}
                        className="flex items-center gap-1 text-xs text-subtle hover:text-primary px-2 py-1.5 rounded-lg hover:bg-primary/5 transition-colors shrink-0"
                        aria-label={isExpanded ? "Свернуть" : "Состав"}
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        <span className="hidden sm:inline">
                          {isExpanded ? "Свернуть" : "Состав"}
                        </span>
                      </button>
                    </>
                  )}
                </div>

                {/* Expanded members panel */}
                {isExpanded && (
                  <div className="px-4 sm:px-6 pb-4 bg-canvas/40 border-t border-line">
                    {detailLoading ? (
                      <div className="flex items-center justify-center py-4 text-subtle">
                        <Loader2 size={16} className="animate-spin" />
                      </div>
                    ) : (
                      <>
                        {/* Members list */}
                        <div className="pt-3 space-y-1.5 mb-3">
                          {detail?.members?.length === 0 && (
                            <p className="text-xs text-subtle py-1">Нет сотрудников</p>
                          )}
                          {detail?.members?.map((m) => (
                            <div
                              key={m.id}
                              className="flex items-center justify-between gap-2 group"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                  <span className="text-[10px] font-bold text-primary">
                                    {(m.user.lastName?.[0] ?? "").toUpperCase()}
                                    {(m.user.firstName?.[0] ?? "").toUpperCase()}
                                  </span>
                                </div>
                                <span className="text-sm text-body truncate">
                                  {m.user.lastName} {m.user.firstName}
                                </span>
                                <span className="text-xs text-subtle shrink-0">
                                  {SECTION_ROLE_LABELS[m.role] ?? m.role}
                                </span>
                              </div>
                              <button
                                onClick={() => handleRemoveMember(m.user.id)}
                                className="flex items-center gap-1 px-2 py-1 text-xs text-subtle hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                title="Удалить с участка"
                              >
                                <UserMinus size={14} />
                                <span>Удалить</span>
                              </button>
                            </div>
                          ))}
                        </div>

                        {/* Add member form */}
                        <div className="pt-3 border-t border-line space-y-2">
                          <div className="relative">
                            <Search
                              size={13}
                              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle"
                            />
                            <input
                              type="text"
                              value={addSearch}
                              onChange={(e) => setAddSearch(e.target.value)}
                              placeholder="Поиск по имени..."
                              className="w-full pl-8 pr-3 py-1.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-surface"
                            />
                          </div>
                          <div className="border border-line rounded-lg overflow-hidden h-36 overflow-y-auto bg-surface">
                            {loadingUsers ? (
                              <div className="flex items-center justify-center h-full text-subtle">
                                <Loader2 size={16} className="animate-spin" />
                              </div>
                            ) : allUsers.length === 0 ? (
                              <div className="flex items-center justify-center h-full text-xs text-subtle">
                                Все сотрудники уже добавлены
                              </div>
                            ) : (
                              (() => {
                                const q = addSearch.toLowerCase();
                                const filtered = allUsers.filter(
                                  (u) =>
                                    !q ||
                                    `${u.lastName} ${u.firstName}`.toLowerCase().includes(q) ||
                                    u.email.toLowerCase().includes(q),
                                );
                                return filtered.length === 0 ? (
                                  <div className="flex items-center justify-center h-full text-xs text-subtle">
                                    Не найдено
                                  </div>
                                ) : (
                                  filtered.map((u) => (
                                    <button
                                      key={u.id}
                                      type="button"
                                      onClick={() =>
                                        setSelectedUser(selectedUser?.id === u.id ? null : u)
                                      }
                                      className={`w-full text-left px-3 py-2 text-sm transition-colors border-b border-line last:border-0 ${
                                        selectedUser?.id === u.id
                                          ? "bg-primary/10 text-primary font-medium"
                                          : "hover:bg-canvas text-body"
                                      }`}
                                    >
                                      <span className="font-medium">
                                        {u.lastName} {u.firstName}
                                      </span>
                                      <span className="block text-xs text-subtle">{u.email}</span>
                                    </button>
                                  ))
                                );
                              })()
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={handleAddMember}
                              disabled={addSaving || !selectedUser}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-[#5557E1] disabled:opacity-50 transition-colors"
                            >
                              {addSaving ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <UserPlus size={13} />
                              )}
                              Добавить
                            </button>
                          </div>
                          {addError && (
                            <p className="text-xs text-red-600 dark:text-red-300">{addError}</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── ManagementPage ───────────────────────────────────────────────────────────

export default function ManagementPage() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();

  const allowed = hasRole("admin") || hasRole("supervisor");

  useEffect(() => {
    if (!allowed) navigate("/");
  }, []);

  const {
    data: sectionsData,
    loading: sectionsLoading,
    error,
    refetch: fetchSections,
  } = useApi(
    jsonFetcher(() => api("/api/sections?limit=100")),
    [],
    { enabled: allowed, errorMessage: "Ошибка загрузки участков" },
  );
  const {
    data: dashData,
    loading: dashLoading,
    refetch: fetchDash,
  } = useApi(
    jsonFetcher(() => api("/api/management/dashboard")),
    [],
    { enabled: allowed },
  );
  const {
    data: bankStats,
    loading: bankLoading,
    refetch: fetchBank,
  } = useApi(
    jsonFetcher(() => api("/api/management/bank-stats")),
    [],
    { enabled: allowed },
  );

  const sections = sectionsData?.sections ?? [];
  const staffByRole = dashData?.staff?.byRole ?? [];
  const loading = sectionsLoading || dashLoading || bankLoading;

  function loadAll() {
    fetchSections();
    fetchDash();
    fetchBank();
  }

  if (loading || !allowed)
    return (
      <div className="flex items-center justify-center h-64 text-subtle text-sm">Загрузка...</div>
    );
  if (error)
    return (
      <div className="flex items-center gap-2 text-red-500 dark:text-red-400 p-4 text-sm">
        <AlertCircle size={18} />
        {error}
      </div>
    );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-heading">Управление</h1>
          <p className="text-xs sm:text-sm text-subtle mt-0.5 sm:mt-1">
            Участки, команда, организационная структура
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/finance")}
          className="self-start inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-primary/20 text-primary hover:bg-primary/5 text-sm font-medium transition-colors"
        >
          <DollarSign size={16} />
          Финансовая аналитика
        </button>
      </div>

      {/* Sections */}
      <SectionsBlock sections={sections} onRefresh={loadAll} />

      {/* Персонал по ролям */}
      {staffByRole.length > 0 && (
        <div className="bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-5">
          <h2 className="text-base font-semibold text-heading mb-4">Персонал по ролям</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-subtle border-b border-line">
                  <th className="pb-2 font-medium">Роль</th>
                  <th className="pb-2 font-medium text-right">Кол-во</th>
                  <th className="pb-2 font-medium text-right">ФОТ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {staffByRole.map((r) => (
                  <tr key={r.role}>
                    <td className="py-2.5 text-body">{ROLE_LABELS[r.role] ?? r.role}</td>
                    <td className="py-2.5 text-right text-body">{r.count}</td>
                    <td className="py-2.5 text-right font-medium text-heading">{fmt(r.payroll)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Банки клиентов */}
      {bankStats && bankStats.banks.length > 0 && (
        <div className="bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-6">
          <h2 className="text-lg font-bold text-heading mb-4">Банки клиентов</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="rounded-lg border border-line p-3">
              <div className="text-xs text-subtle">Всего счетов</div>
              <div className="text-xl sm:text-2xl font-bold text-heading mt-1">
                {bankStats.totals.accounts}
              </div>
            </div>
            <div className="rounded-lg border border-line p-3">
              <div className="text-xs text-subtle">Организаций</div>
              <div className="text-xl sm:text-2xl font-bold text-heading mt-1">
                {bankStats.totals.organizations}
              </div>
            </div>
            <div className="rounded-lg border border-line p-3">
              <div className="text-xs text-subtle">Подключено к API</div>
              <div className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-300 mt-1">
                {bankStats.totals.apiConnected}
              </div>
            </div>
            <div className="rounded-lg border border-line p-3">
              <div className="text-xs text-subtle">Авто-выгрузка ВКЛ</div>
              <div className="text-xl sm:text-2xl font-bold text-primary mt-1">
                {bankStats.totals.autoFetch}
              </div>
            </div>
          </div>

          {/* Mobile: card list */}
          <div className="sm:hidden divide-y divide-line border-t border-line -mx-4">
            {bankStats.banks.map((b) => (
              <div key={b.bankName} className="px-4 py-3">
                <div className="text-sm font-semibold text-heading mb-1.5">{b.bankName}</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div className="text-subtle">Счетов</div>
                  <div className="text-right text-body tabular-nums">{b.accounts}</div>
                  <div className="text-subtle">Организаций</div>
                  <div className="text-right text-body tabular-nums">{b.organizations}</div>
                  <div className="text-subtle">API подключено</div>
                  <div className="text-right tabular-nums text-emerald-600 dark:text-emerald-300">
                    {b.apiConnected || "—"}
                  </div>
                  <div className="text-subtle">Авто-выгрузка</div>
                  <div className="text-right tabular-nums text-primary">{b.autoFetch || "—"}</div>
                </div>
              </div>
            ))}
          </div>

          {/* sm+: full table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-subtle border-b border-line">
                <tr className="text-left">
                  <th className="pb-2 font-medium">Банк</th>
                  <th className="pb-2 font-medium text-right">Счетов</th>
                  <th className="pb-2 font-medium text-right">Организаций</th>
                  <th className="pb-2 font-medium text-right">API подключено</th>
                  <th className="pb-2 font-medium text-right">Авто-выгрузка</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {bankStats.banks.map((b) => (
                  <tr key={b.bankName}>
                    <td className="py-2.5 text-body font-medium">{b.bankName}</td>
                    <td className="py-2.5 text-right text-body">{b.accounts}</td>
                    <td className="py-2.5 text-right text-body">{b.organizations}</td>
                    <td className="py-2.5 text-right text-emerald-600 dark:text-emerald-300">
                      {b.apiConnected || "—"}
                    </td>
                    <td className="py-2.5 text-right text-primary">{b.autoFetch || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
