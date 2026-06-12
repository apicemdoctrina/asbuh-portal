import { useState } from "react";
import { Plus, Trash2, Pencil, Check, X as XIcon } from "lucide-react";
import { fmt } from "./financeShared.jsx";

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

export default function ExpensesBlock({ title, type, expenses, onAdd, onDelete, onUpdate }) {
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
