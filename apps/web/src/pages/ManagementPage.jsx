import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  BarChart2,
  Percent,
  AlertCircle,
  Plus,
  Trash2,
  Pencil,
  Check,
  X as XIcon,
  Minus,
  RefreshCw,
  UserPlus,
  Map,
  ChevronDown,
  ChevronUp,
  UserMinus,
  Loader2,
  Search,
  Wallet,
  CreditCard,
  Banknote,
} from "lucide-react";
import SectionIcon from "../components/SectionIcon.jsx";
import AnimalPicker from "../components/AnimalPicker.jsx";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const MONTHS_RU = [
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

const fmt = (n) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n);

const fmtShort = (n) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(Math.round(n));
};

const ROLE_LABELS = { admin: "Администратор", manager: "Менеджер", accountant: "Бухгалтер" };

function MarginBadge({ margin }) {
  if (margin >= 40) return <span className="text-emerald-600 font-semibold">{margin}%</span>;
  if (margin >= 20) return <span className="text-amber-600 font-semibold">{margin}%</span>;
  if (margin > 0) return <span className="text-red-500 font-semibold">{margin}%</span>;
  return <span className="text-red-600 font-bold">{margin}%</span>;
}

function calcGrowth(current, prev) {
  if (prev == null || prev === 0) return null;
  return ((current - prev) / Math.abs(prev)) * 100;
}

const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid #e2e8f0",
  fontSize: 12,
  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
};

// ─── GrowthBadge ──────────────────────────────────────────────────────────────

function GrowthBadge({ pct, absolute }) {
  if (pct == null) return null;
  const isZero = Math.abs(pct) < 0.5;
  const isPositive = pct > 0;
  if (isZero)
    return (
      <span className="text-xs text-slate-400 mt-0.5 flex items-center gap-0.5">
        <Minus size={10} /> 0%
      </span>
    );
  return (
    <span
      className={`text-xs mt-0.5 flex items-center gap-0.5 font-medium ${isPositive ? "text-emerald-600" : "text-red-500"}`}
    >
      {isPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {isPositive ? "+" : ""}
      {absolute ? `${pct.toFixed(1)} пп` : `${pct.toFixed(1)}%`}
    </span>
  );
}

// ─── KpiCard ─────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, positive, growth, absoluteGrowth }) {
  const color =
    positive === undefined ? "text-[#6567F1]" : positive ? "text-emerald-600" : "text-red-500";
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-slate-500">{label}</span>
        <div className={`p-2 rounded-lg bg-slate-50 ${color}`}>
          <Icon size={18} />
        </div>
      </div>
      <div className={`text-xl font-bold leading-tight ${color}`}>{value}</div>
      <GrowthBadge pct={growth} absolute={absoluteGrowth} />
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
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
          className="flex-1 min-w-24 text-sm border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#6567F1]"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название"
          autoFocus
        />
        <input
          className="w-24 text-sm border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#6567F1]"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
          min="0"
        />
        {isOneTime && (
          <input
            type="date"
            className="w-32 text-sm border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#6567F1]"
            value={editDate}
            onChange={(e) => setEditDate(e.target.value)}
          />
        )}
        <button
          onClick={save}
          disabled={saving}
          className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
        >
          <Check size={15} />
        </button>
        <button
          onClick={cancel}
          className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
        >
          <XIcon size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-1.5 group">
      <div className="flex flex-col min-w-0 mr-2">
        <span className="text-sm text-slate-700 truncate">{expense.name}</span>
        {isOneTime && expense.date && (
          <span className="text-xs text-slate-400">
            {new Date(expense.date).toLocaleDateString("ru-RU")}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-sm font-medium text-slate-900">{fmt(Number(expense.amount))}</span>
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 ml-1 transition-opacity">
          <button
            onClick={() => setEditing(true)}
            className="p-1 text-slate-400 hover:text-[#6567F1] rounded"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => onDelete(expense.id)}
            className="p-1 text-slate-400 hover:text-red-500 rounded"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ExpensesBlock ────────────────────────────────────────────────────────────

function ExpensesBlock({ title, type, expenses, onAdd, onDelete, onUpdate }) {
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
      <h3 className="text-sm font-semibold text-slate-700 mb-2">{title}</h3>
      {expenses.length > 0 ? (
        <div className="divide-y divide-slate-100">
          {expenses.map((e) => (
            <ExpenseRow key={e.id} expense={e} onDelete={onDelete} onUpdate={onUpdate} />
          ))}
        </div>
      ) : (
        !adding && <p className="text-sm text-slate-400 py-2">Нет расходов</p>
      )}
      {adding ? (
        <div className="mt-2 space-y-2">
          <input
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#6567F1]"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Название расхода"
            autoFocus
          />
          <div className="flex gap-2">
            <input
              className="flex-1 text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#6567F1]"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              placeholder="Сумма, ₽"
              type="number"
              min="0"
            />
            {type === "ONE_TIME" && (
              <input
                className="flex-1 text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#6567F1]"
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
              className="flex-1 text-sm py-1.5 bg-[#6567F1]/10 text-[#6567F1] rounded hover:bg-[#6567F1]/20 disabled:opacity-50"
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
              className="px-3 text-sm text-slate-500 hover:text-slate-700"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 flex items-center gap-1 text-sm text-[#6567F1]/60 hover:text-[#6567F1]"
        >
          <Plus size={14} /> Добавить
        </button>
      )}
      <div className="mt-3 pt-2 border-t border-slate-200 flex justify-between items-center">
        <span className="text-xs text-slate-500">Итого:</span>
        <span className="text-sm font-semibold text-slate-800">{fmt(total)}</span>
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
          className="flex-1 min-w-24 text-sm border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название"
          autoFocus
        />
        <input
          className="w-24 text-sm border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
          min="0"
        />
        <input
          type="date"
          className="w-32 text-sm border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          value={editDate}
          onChange={(e) => setEditDate(e.target.value)}
        />
        <button
          onClick={save}
          disabled={saving}
          className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
        >
          <Check size={15} />
        </button>
        <button
          onClick={cancel}
          className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
        >
          <XIcon size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-1.5 group">
      <div className="flex flex-col min-w-0 mr-2">
        <span className="text-sm text-slate-700 truncate">{income.name}</span>
        {income.date && (
          <span className="text-xs text-slate-400">
            {new Date(income.date).toLocaleDateString("ru-RU")}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-sm font-medium text-emerald-600">{fmt(Number(income.amount))}</span>
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 ml-1 transition-opacity">
          <button
            onClick={() => setEditing(true)}
            className="p-1 text-slate-400 hover:text-emerald-600 rounded"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => onDelete(income.id)}
            className="p-1 text-slate-400 hover:text-red-500 rounded"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── IncomeBlock ──────────────────────────────────────────────────────────────

function IncomeBlock({ incomes, onAdd, onDelete, onUpdate }) {
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
      <h3 className="text-sm font-semibold text-slate-700 mb-2">Разовые доходы</h3>
      {incomes.length > 0 ? (
        <div className="divide-y divide-slate-100">
          {incomes.map((i) => (
            <IncomeRow key={i.id} income={i} onDelete={onDelete} onUpdate={onUpdate} />
          ))}
        </div>
      ) : (
        !adding && <p className="text-sm text-slate-400 py-2">Нет доходов</p>
      )}
      {adding ? (
        <div className="mt-2 space-y-2">
          <input
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Название дохода"
            autoFocus
          />
          <div className="flex gap-2">
            <input
              className="flex-1 text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              placeholder="Сумма, ₽"
              type="number"
              min="0"
            />
            <input
              type="date"
              className="flex-1 text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving || !newName.trim() || !newAmount}
              className="flex-1 text-sm py-1.5 bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100 disabled:opacity-50"
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
              className="px-3 text-sm text-slate-500 hover:text-slate-700"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 flex items-center gap-1 text-sm text-emerald-600/60 hover:text-emerald-600"
        >
          <Plus size={14} /> Добавить
        </button>
      )}
      <div className="mt-3 pt-2 border-t border-slate-200 flex justify-between items-center">
        <span className="text-xs text-slate-500">Итого:</span>
        <span className="text-sm font-semibold text-emerald-600">{fmt(total)}</span>
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

function SectionsBlock({ sections, onRefresh }) {
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
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Map size={16} className="text-slate-400" />
          <h2 className="text-base font-semibold text-slate-900">Участки</h2>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            {sections.length}
          </span>
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-1.5 text-sm text-[#6567F1] hover:bg-[#6567F1]/5 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus size={14} />
          Добавить
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Номер *</label>
            <input
              type="number"
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
              className="w-20 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/20 focus:border-[#6567F1]"
              placeholder="1"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Название</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-48 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/20 focus:border-[#6567F1]"
              placeholder="Необязательно"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Иконка</label>
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#6567F1] text-white text-sm rounded-lg hover:bg-[#5557E1] disabled:opacity-50 transition-colors"
            >
              {createSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Создать
            </button>
            <button
              onClick={() => {
                setCreating(false);
                setCreateError("");
              }}
              className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              Отмена
            </button>
          </div>
          {createError && <p className="w-full text-xs text-red-600">{createError}</p>}
        </div>
      )}

      {sections.length === 0 ? (
        <div className="px-6 py-8 text-center text-slate-400 text-sm">Нет участков</div>
      ) : (
        <div className="divide-y divide-slate-50">
          {sections.map((s) => {
            const isExpanded = expandedId === s.id;
            const isEditing = editingId === s.id;

            return (
              <div key={s.id}>
                {/* Section row */}
                <div className="px-6 py-3.5 flex items-center gap-3 hover:bg-slate-50/50 transition-colors">
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1 flex-wrap">
                      <input
                        type="number"
                        value={editNumber}
                        onChange={(e) => setEditNumber(e.target.value)}
                        className="w-16 px-2 py-1 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#6567F1]"
                        autoFocus
                      />
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-48 px-2 py-1 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#6567F1]"
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
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      >
                        {editSaving ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Check size={14} />
                        )}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <XIcon size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap">
                        <span className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                          <SectionIcon section={s} size={15} className="text-[#6567F1] shrink-0" />№
                          {s.number}
                          {s.name ? ` — ${s.name}` : ""}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <Users size={11} />
                          {s._count.members} чел.
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          {s._count.organizations} орг.
                          {s.formCounts?.IP > 0 && (
                            <span className="text-sky-600 font-medium">{s.formCounts.IP} ИП</span>
                          )}
                          {s.formCounts?.OOO > 0 && (
                            <span className="text-[#6567F1] font-medium">
                              {s.formCounts.OOO} ООО
                            </span>
                          )}
                        </span>
                      </div>
                      <button
                        onClick={() => startEdit(s)}
                        className="p-1.5 text-slate-300 hover:text-[#6567F1] hover:bg-[#6567F1]/5 rounded-lg transition-colors"
                        title="Редактировать"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => toggleExpand(s.id)}
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-[#6567F1] px-2 py-1.5 rounded-lg hover:bg-[#6567F1]/5 transition-colors"
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {isExpanded ? "Свернуть" : "Состав"}
                      </button>
                    </>
                  )}
                </div>

                {/* Expanded members panel */}
                {isExpanded && (
                  <div className="px-6 pb-4 bg-slate-50/40 border-t border-slate-100">
                    {detailLoading ? (
                      <div className="flex items-center justify-center py-4 text-slate-400">
                        <Loader2 size={16} className="animate-spin" />
                      </div>
                    ) : (
                      <>
                        {/* Members list */}
                        <div className="pt-3 space-y-1.5 mb-3">
                          {detail?.members?.length === 0 && (
                            <p className="text-xs text-slate-400 py-1">Нет сотрудников</p>
                          )}
                          {detail?.members?.map((m) => (
                            <div
                              key={m.id}
                              className="flex items-center justify-between gap-2 group"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-6 h-6 rounded-lg bg-[#6567F1]/10 flex items-center justify-center shrink-0">
                                  <span className="text-[10px] font-bold text-[#6567F1]">
                                    {(m.user.lastName?.[0] ?? "").toUpperCase()}
                                    {(m.user.firstName?.[0] ?? "").toUpperCase()}
                                  </span>
                                </div>
                                <span className="text-sm text-slate-700 truncate">
                                  {m.user.lastName} {m.user.firstName}
                                </span>
                                <span className="text-xs text-slate-400 shrink-0">
                                  {SECTION_ROLE_LABELS[m.role] ?? m.role}
                                </span>
                              </div>
                              <button
                                onClick={() => handleRemoveMember(m.user.id)}
                                className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                title="Удалить с участка"
                              >
                                <UserMinus size={14} />
                                <span>Удалить</span>
                              </button>
                            </div>
                          ))}
                        </div>

                        {/* Add member form */}
                        <div className="pt-3 border-t border-slate-200 space-y-2">
                          <div className="relative">
                            <Search
                              size={13}
                              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                            />
                            <input
                              type="text"
                              value={addSearch}
                              onChange={(e) => setAddSearch(e.target.value)}
                              placeholder="Поиск по имени..."
                              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/20 focus:border-[#6567F1] bg-white"
                            />
                          </div>
                          <div className="border border-slate-200 rounded-lg overflow-hidden h-36 overflow-y-auto bg-white">
                            {loadingUsers ? (
                              <div className="flex items-center justify-center h-full text-slate-400">
                                <Loader2 size={16} className="animate-spin" />
                              </div>
                            ) : allUsers.length === 0 ? (
                              <div className="flex items-center justify-center h-full text-xs text-slate-400">
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
                                  <div className="flex items-center justify-center h-full text-xs text-slate-400">
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
                                      className={`w-full text-left px-3 py-2 text-sm transition-colors border-b border-slate-50 last:border-0 ${
                                        selectedUser?.id === u.id
                                          ? "bg-[#6567F1]/10 text-[#6567F1] font-medium"
                                          : "hover:bg-slate-50 text-slate-700"
                                      }`}
                                    >
                                      <span className="font-medium">
                                        {u.lastName} {u.firstName}
                                      </span>
                                      <span className="block text-xs text-slate-400">
                                        {u.email}
                                      </span>
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
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#6567F1] text-white text-sm rounded-lg hover:bg-[#5557E1] disabled:opacity-50 transition-colors"
                            >
                              {addSaving ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <UserPlus size={13} />
                              )}
                              Добавить
                            </button>
                          </div>
                          {addError && <p className="text-xs text-red-600">{addError}</p>}
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

  const [dashboard, setDashboard] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [sectionProfitability, setSectionProfitability] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!hasRole("admin") && !hasRole("supervisor")) {
      navigate("/");
      return;
    }
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, snapsRes, expsRes, incsRes, analyticsRes, sectionsRes] = await Promise.all([
        api("/api/management/dashboard"),
        api("/api/management/snapshots"),
        api("/api/management/expenses"),
        api("/api/management/incomes"),
        api("/api/management/analytics"),
        api("/api/sections?limit=100"),
      ]);
      if (!dashRes.ok) throw new Error("Ошибка загрузки данных");
      const [dash, snaps, exps, incs, analytics, sectionsData] = await Promise.all([
        dashRes.json(),
        snapsRes.ok ? snapsRes.json() : Promise.resolve([]),
        expsRes.ok ? expsRes.json() : Promise.resolve([]),
        incsRes.ok ? incsRes.json() : Promise.resolve([]),
        analyticsRes.ok ? analyticsRes.json() : Promise.resolve(null),
        sectionsRes.ok ? sectionsRes.json() : Promise.resolve({ sections: [] }),
      ]);
      setDashboard(dash);
      setSnapshots(snaps);
      setExpenses(exps);
      setIncomes(incs);
      setSectionProfitability(analytics?.sectionProfitability ?? []);
      setSections(sectionsData.sections ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function reloadDashboard() {
    const res = await api("/api/management/dashboard");
    if (res.ok) setDashboard(await res.json());
  }

  async function captureSnapshot() {
    setCapturing(true);
    try {
      const res = await api("/api/management/snapshots/capture", { method: "POST" });
      if (!res.ok) throw new Error("Не удалось обновить снимок");
      const [snapsRes, dashRes] = await Promise.all([
        api("/api/management/snapshots"),
        api("/api/management/dashboard"),
      ]);
      const [snaps, dash] = await Promise.all([snapsRes.json(), dashRes.json()]);
      setSnapshots(snaps);
      setDashboard(dash);
    } catch (e) {
      alert(e.message);
    } finally {
      setCapturing(false);
    }
  }

  async function handleAddExpense(data) {
    const res = await api("/api/management/expenses", {
      method: "POST",
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Ошибка добавления расхода");
    const created = await res.json();
    setExpenses((prev) => [...prev, created]);
    await reloadDashboard();
  }

  async function handleDeleteExpense(id) {
    await api(`/api/management/expenses/${id}`, { method: "DELETE" });
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    await reloadDashboard();
  }

  async function handleUpdateExpense(id, data) {
    const res = await api(`/api/management/expenses/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Ошибка обновления расхода");
    const updated = await res.json();
    setExpenses((prev) => prev.map((e) => (e.id === id ? updated : e)));
    await reloadDashboard();
  }

  async function handleAddIncome(data) {
    const res = await api("/api/management/incomes", {
      method: "POST",
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Ошибка добавления дохода");
    const created = await res.json();
    setIncomes((prev) => [created, ...prev]);
    await reloadDashboard();
  }

  async function handleDeleteIncome(id) {
    await api(`/api/management/incomes/${id}`, { method: "DELETE" });
    setIncomes((prev) => prev.filter((i) => i.id !== id));
    await reloadDashboard();
  }

  async function handleUpdateIncome(id, data) {
    const res = await api(`/api/management/incomes/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Ошибка обновления дохода");
    const updated = await res.json();
    setIncomes((prev) => prev.map((i) => (i.id === id ? updated : i)));
    await reloadDashboard();
  }

  if (loading)
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        Загрузка...
      </div>
    );
  if (error)
    return (
      <div className="flex items-center gap-2 text-red-500 p-4 text-sm">
        <AlertCircle size={18} />
        {error}
      </div>
    );
  if (!dashboard) return null;

  // ── Chart & growth data ──────────────────────────────────────────────────

  // Previous month snapshot for MoM growth
  const prevSnap = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const growths = prevSnap
    ? {
        revenue: calcGrowth(dashboard.revenue.total, Number(prevSnap.totalRevenue)),
        profit: calcGrowth(dashboard.profit.gross, Number(prevSnap.grossProfit)),
        payroll: calcGrowth(dashboard.payroll.total, Number(prevSnap.payrollTotal)),
        margin: dashboard.profit.margin - Number(prevSnap.margin),
        avgCheck: calcGrowth(dashboard.revenue.avgCheck, Number(prevSnap.avgCheck)),
      }
    : {};

  // Historical chart data from snapshots
  const histData = snapshots.map((s) => ({
    label: `${MONTHS_RU[s.month - 1]} '${String(s.year).slice(2)}`,
    revenue: Number(s.totalRevenue),
    profit: Number(s.grossProfit),
    payroll: Number(s.payrollTotal),
    expenses: Number(s.recurringExpenses),
    margin: Number(s.margin),
    orgCount: s.orgCount,
    clientsNew: s.clientsNew,
  }));

  // Current-month chart data for "Динамика выручки" (fallback to snapshots)
  const orgFormChartData = dashboard.byOrgForm
    .filter((d) => d.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);
  const recurringExpenses = expenses.filter((e) => e.type === "RECURRING");
  const oneTimeExpenses = expenses.filter((e) => e.type === "ONE_TIME");
  const grossPositive = dashboard.profit.gross >= 0;

  const hasHistory = histData.length > 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Управление</h1>
          {prevSnap && (
            <p className="text-xs text-slate-400 mt-0.5">
              Сравнение с {MONTHS_RU[prevSnap.month - 1]} {prevSnap.year}
            </p>
          )}
        </div>
        <button
          onClick={captureSnapshot}
          disabled={capturing}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg text-sm font-medium shadow-lg shadow-[#6567F1]/30 disabled:opacity-50 transition-all"
        >
          <RefreshCw size={15} className={capturing ? "animate-spin" : ""} />
          {capturing ? "Обновление..." : "Обновить снимок"}
        </button>
      </div>

      {/* Sections */}
      <SectionsBlock sections={sections} onRefresh={loadAll} />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          icon={DollarSign}
          label="Выручка"
          value={fmt(dashboard.revenue.total)}
          sub={`${dashboard.revenue.orgCount} орг.`}
          growth={growths.revenue}
        />
        <KpiCard
          icon={BarChart2}
          label="Ср. чек"
          value={fmt(dashboard.revenue.avgCheck)}
          sub={`${dashboard.revenue.orgsWithPayment} с оплатой`}
          growth={growths.avgCheck}
        />
        <KpiCard
          icon={Users}
          label="ФОТ"
          value={fmt(dashboard.payroll.total)}
          sub={`${dashboard.payroll.staffCount} сотр.`}
          growth={growths.payroll}
        />
        <KpiCard
          icon={TrendingUp}
          label="Прибыль"
          value={fmt(dashboard.profit.gross)}
          sub="После ФОТ и пост. расходов"
          positive={grossPositive}
          growth={growths.profit}
        />
        <KpiCard
          icon={Percent}
          label="Маржа"
          value={`${dashboard.profit.margin.toFixed(1)}%`}
          positive={grossPositive}
          growth={growths.margin}
          absoluteGrowth
        />
      </div>

      {/* Clients KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={Users} label="Активных клиентов" value={dashboard.clients.active} />
        <KpiCard
          icon={UserPlus}
          label="Новых в этом месяце"
          value={dashboard.clients.new}
          positive={dashboard.clients.new > 0}
        />
        <KpiCard
          icon={DollarSign}
          label="Пост. расходы"
          value={fmt(dashboard.expenses.recurringTotal)}
        />
        <KpiCard
          icon={DollarSign}
          label="Разовые доходы"
          value={fmt(dashboard.incomes.total)}
          positive={dashboard.incomes.total > 0}
        />
      </div>

      {/* Payment destinations */}
      {dashboard.byPaymentDest && (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Wallet size={18} className="text-[#6567F1]" />
            <h2 className="text-base font-semibold text-slate-900">Куда поступают платежи</h2>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              {
                key: "BANK_TOCHKA",
                label: "Банк (Точка)",
                icon: Banknote,
                color: "text-emerald-600",
                bg: "bg-emerald-50",
                ring: "hover:ring-emerald-300",
                link: "/payments",
              },
              {
                key: "CARD",
                label: "Карта",
                icon: CreditCard,
                color: "text-blue-600",
                bg: "bg-blue-50",
                ring: "hover:ring-blue-300",
                link: "/payments?tab=cashcard",
              },
              {
                key: "CASH",
                label: "Наличные",
                icon: DollarSign,
                color: "text-amber-600",
                bg: "bg-amber-50",
                ring: "hover:ring-amber-300",
                link: "/payments?tab=cashcard",
              },
            ].map(({ key, label, icon: Icon, color, bg, ring, link }) => {
              const item = dashboard.byPaymentDest.find((d) => d.destination === key);
              const revenue = item?.revenue ?? 0;
              const count = item?.count ?? 0;
              return (
                <div
                  key={key}
                  className={`${bg} rounded-xl p-4 cursor-pointer hover:ring-2 ${ring} transition-all`}
                  onClick={() => navigate(link)}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={16} className={color} />
                    <span className="text-sm font-medium text-slate-700">{label}</span>
                  </div>
                  <div className={`text-lg font-bold ${color}`}>
                    {revenue.toLocaleString("ru-RU")} ₽
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{count} орг.</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Debt block */}
      {dashboard.debt.total > 0 && (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle size={18} className="text-red-500" />
            <h2 className="text-base font-semibold text-slate-900">
              Долг клиентов: <span className="text-red-500">{fmt(dashboard.debt.total)}</span>
            </h2>
          </div>
          {dashboard.debt.topDebtors.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th className="pb-2 font-medium">Организация</th>
                    <th className="pb-2 font-medium text-right">Долг</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {dashboard.debt.topDebtors.map((d) => (
                    <tr key={d.id}>
                      <td className="py-2 text-slate-700">{d.name}</td>
                      <td className="py-2 text-right font-medium text-red-500">
                        {fmt(d.debtAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Charts row — current period */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue dynamics (historical) */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Динамика выручки</h2>
          {histData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
              Данные появятся после первого сохранения снимка
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={histData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={fmtShort}
                  width={52}
                />
                <Tooltip
                  formatter={(v) => [fmt(v), "Выручка"]}
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "#f8fafc" }}
                />
                <Bar dataKey="revenue" fill="#6567F1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* By org form */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-4">
            Структура по форме организации
          </h2>
          {orgFormChartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
              Нет данных
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={orgFormChartData}
                layout="vertical"
                margin={{ top: 4, right: 10, left: 4, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={fmtShort}
                />
                <YAxis
                  type="category"
                  dataKey="form"
                  tick={{ fontSize: 12, fill: "#475569" }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                <Tooltip
                  formatter={(v, _n, props) => [
                    `${fmt(v)} (${props.payload.count} орг.)`,
                    "Выручка",
                  ]}
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "#f8fafc" }}
                />
                <Bar dataKey="revenue" fill="#5557E1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Historical analytics ─────────────────────────────────────────────── */}
      {hasHistory && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900 border-t border-slate-200 pt-4">
            История показателей
          </h2>

          {/* Chart 1: Revenue & Profit comparison */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Выручка и прибыль</h3>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={histData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={fmtShort}
                  width={52}
                />
                <Tooltip
                  formatter={(v, name) => [fmt(v), name === "revenue" ? "Выручка" : "Прибыль"]}
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "#f8fafc" }}
                />
                <Legend
                  formatter={(v) => (v === "revenue" ? "Выручка" : "Прибыль")}
                  iconSize={10}
                  wrapperStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="revenue" fill="#6567F1" radius={[4, 4, 0, 0]} opacity={0.85} />
                <Line
                  dataKey="profit"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#10b981" }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Charts row 2: Revenue vs Payroll | Margin */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Revenue vs Payroll */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">
                Выручка vs ФОТ vs Расходы
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={histData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={fmtShort}
                    width={52}
                  />
                  <Tooltip
                    formatter={(v, name) => [
                      fmt(v),
                      name === "revenue" ? "Выручка" : name === "payroll" ? "ФОТ" : "Пост. расходы",
                    ]}
                    contentStyle={tooltipStyle}
                    cursor={{ fill: "#f8fafc" }}
                  />
                  <Legend
                    formatter={(v) =>
                      v === "revenue" ? "Выручка" : v === "payroll" ? "ФОТ" : "Пост. расходы"
                    }
                    iconSize={10}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="revenue" fill="#6567F1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="payroll" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" fill="#f87171" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Margin % */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Маржинальность %</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={histData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v.toFixed(0)}%`}
                    width={44}
                  />
                  <Tooltip
                    formatter={(v) => [`${Number(v).toFixed(1)}%`, "Маржа"]}
                    contentStyle={tooltipStyle}
                  />
                  <Line
                    dataKey="margin"
                    stroke="#6567F1"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#6567F1" }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 3: Client count */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Клиентская база</h3>
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={histData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                  allowDecimals={false}
                />
                <Tooltip
                  formatter={(v, name) => [
                    v,
                    name === "orgCount" ? "Активных клиентов" : "Новых за месяц",
                  ]}
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "#f8fafc" }}
                />
                <Legend
                  formatter={(v) => (v === "orgCount" ? "Активных клиентов" : "Новых за месяц")}
                  iconSize={10}
                  wrapperStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="clientsNew" fill="#a5f3fc" radius={[4, 4, 0, 0]} />
                <Line
                  dataKey="orgCount"
                  stroke="#6567F1"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#6567F1" }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* History table */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Таблица истории</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th className="pb-2 font-medium pr-4">Период</th>
                    <th className="pb-2 font-medium text-right pr-4">Выручка</th>
                    <th className="pb-2 font-medium text-right pr-4">ФОТ</th>
                    <th className="pb-2 font-medium text-right pr-4">Пост. расходы</th>
                    <th className="pb-2 font-medium text-right pr-4">Прибыль</th>
                    <th className="pb-2 font-medium text-right pr-4">Маржа</th>
                    <th className="pb-2 font-medium text-right pr-4">Клиентов</th>
                    <th className="pb-2 font-medium text-right">Новых</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {[...snapshots].reverse().map((s) => {
                    const gross = Number(s.grossProfit);
                    const isPos = gross >= 0;
                    return (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 pr-4 text-slate-700 font-medium whitespace-nowrap">
                          {MONTHS_RU[s.month - 1]} {s.year}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-slate-900">
                          {fmt(Number(s.totalRevenue))}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-amber-600">
                          {fmt(Number(s.payrollTotal))}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-red-400">
                          {fmt(Number(s.recurringExpenses))}
                        </td>
                        <td
                          className={`py-2.5 pr-4 text-right font-medium ${isPos ? "text-emerald-600" : "text-red-500"}`}
                        >
                          {fmt(gross)}
                        </td>
                        <td
                          className={`py-2.5 pr-4 text-right ${isPos ? "text-emerald-600" : "text-red-500"}`}
                        >
                          {Number(s.margin).toFixed(1)}%
                        </td>
                        <td className="py-2.5 pr-4 text-right text-slate-600">{s.orgCount}</td>
                        <td className="py-2.5 text-right text-[#6567F1]">+{s.clientsNew}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Section profitability */}
      {sectionProfitability.length > 0 && (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <Map size={16} className="text-slate-400" />
            <h2 className="text-base font-semibold text-slate-900">Маржинальность участков</h2>
            <span className="text-xs text-slate-400 ml-1">
              Выручка vs ФОТ (активные организации)
            </span>
          </div>
          {/* Visual bars */}
          <div className="px-6 py-4 space-y-3 border-b border-slate-100">
            {sectionProfitability.map((s) => {
              const maxRev = Math.max(...sectionProfitability.map((x) => x.revenue), 1);
              const revPct = (s.revenue / maxRev) * 100;
              const payPct = (s.payroll / maxRev) * 100;
              return (
                <div key={s.sectionId}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700">
                      №{s.number}
                      {s.name ? ` — ${s.name}` : ""}
                    </span>
                    <MarginBadge margin={s.margin} />
                  </div>
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 bg-[#6567F1]/20 rounded-full overflow-hidden flex-1">
                        <div
                          className="h-full bg-[#6567F1] rounded-full"
                          style={{ width: `${revPct}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500 w-24 text-right tabular-nums">
                        {fmt(s.revenue)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 bg-red-100 rounded-full overflow-hidden flex-1">
                        <div
                          className="h-full bg-red-400 rounded-full"
                          style={{ width: `${payPct}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500 w-24 text-right tabular-nums">
                        {fmt(s.payroll)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center gap-4 pt-2 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded bg-[#6567F1]" /> Выручка
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded bg-red-400" /> ФОТ
              </span>
            </div>
          </div>
          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Участок</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-500">Орг-ций</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500">Выручка</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500 hidden sm:table-cell">
                    ФОТ
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500 hidden md:table-cell">
                    Прибыль
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-slate-500">Маржа</th>
                </tr>
              </thead>
              <tbody>
                {sectionProfitability.map((s) => (
                  <tr key={s.sectionId} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      №{s.number}
                      {s.name ? ` — ${s.name}` : ""}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">{s.orgCount}</td>
                    <td className="px-4 py-3 text-right text-slate-900 font-medium tabular-nums">
                      {fmt(s.revenue)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums hidden sm:table-cell">
                      {fmt(s.payroll)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                      <span className={s.profit >= 0 ? "text-emerald-600" : "text-red-600"}>
                        {s.profit >= 0 ? "+" : ""}
                        {fmt(s.profit)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <MarginBadge margin={s.margin} />
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold">
                  <td className="px-4 py-3 text-slate-700">Итого</td>
                  <td className="px-4 py-3 text-center text-slate-700">
                    {sectionProfitability.reduce((s, x) => s + x.orgCount, 0)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-900 tabular-nums">
                    {fmt(sectionProfitability.reduce((s, x) => s + x.revenue, 0))}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700 tabular-nums hidden sm:table-cell">
                    {fmt(sectionProfitability.reduce((s, x) => s + x.payroll, 0))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                    {(() => {
                      const total =
                        sectionProfitability.reduce((s, x) => s + x.revenue, 0) -
                        sectionProfitability.reduce((s, x) => s + x.payroll, 0);
                      return (
                        <span className={total >= 0 ? "text-emerald-600" : "text-red-600"}>
                          {total >= 0 ? "+" : ""}
                          {fmt(total)}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {(() => {
                      const totalRev = sectionProfitability.reduce((s, x) => s + x.revenue, 0);
                      const totalPay = sectionProfitability.reduce((s, x) => s + x.payroll, 0);
                      const m =
                        totalRev > 0
                          ? Math.round(((totalRev - totalPay) / totalRev) * 1000) / 10
                          : 0;
                      return <MarginBadge margin={m} />;
                    })()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Expenses & Incomes */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-5">Расходы и доходы</h2>
        <div className="flex gap-8 flex-col sm:flex-row">
          <ExpensesBlock
            title="Постоянные расходы"
            type="RECURRING"
            expenses={recurringExpenses}
            onAdd={handleAddExpense}
            onDelete={handleDeleteExpense}
            onUpdate={handleUpdateExpense}
          />
          <div className="hidden sm:block w-px bg-slate-100 self-stretch" />
          <ExpensesBlock
            title="Разовые расходы"
            type="ONE_TIME"
            expenses={oneTimeExpenses}
            onAdd={handleAddExpense}
            onDelete={handleDeleteExpense}
            onUpdate={handleUpdateExpense}
          />
          <div className="hidden sm:block w-px bg-slate-100 self-stretch" />
          <IncomeBlock
            incomes={incomes}
            onAdd={handleAddIncome}
            onDelete={handleDeleteIncome}
            onUpdate={handleUpdateIncome}
          />
        </div>
      </div>

      {/* Staff by role */}
      {dashboard.staff.byRole.length > 0 && (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Персонал по ролям</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="pb-2 font-medium">Роль</th>
                <th className="pb-2 font-medium text-right">Кол-во</th>
                <th className="pb-2 font-medium text-right">ФОТ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {dashboard.staff.byRole.map((r) => (
                <tr key={r.role}>
                  <td className="py-2.5 text-slate-700">{ROLE_LABELS[r.role] ?? r.role}</td>
                  <td className="py-2.5 text-right text-slate-600">{r.count}</td>
                  <td className="py-2.5 text-right font-medium text-slate-800">{fmt(r.payroll)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
