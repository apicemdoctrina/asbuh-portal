import { useState, useEffect, useRef } from "react";
import { api } from "../lib/api.js";
import { Plus, Trash2 } from "lucide-react";
import Modal from "./ui/Modal.jsx";

export default function TaskChecklistModal({ task, onClose, onUpdate }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [adding, setAdding] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    api(`/api/tasks/${task.id}/checklist`)
      .then((r) => r.json())
      .then((data) => {
        setItems(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [task.id]);

  const doneCount = items.filter((i) => i.done).length;
  const total = items.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  async function handleToggle(item) {
    const optimistic = items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i));
    setItems(optimistic);
    onUpdate?.({ checklistItems: optimistic.map((i) => ({ done: i.done })) });

    try {
      await api(`/api/tasks/${task.id}/checklist/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ done: !item.done }),
      });
    } catch {
      setItems(items); // rollback
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!newText.trim() || adding) return;
    setAdding(true);
    try {
      const res = await api(`/api/tasks/${task.id}/checklist`, {
        method: "POST",
        body: JSON.stringify({ text: newText.trim(), dueDate: newDueDate || null }),
      });
      if (res.ok) {
        const item = await res.json();
        const updated = [...items, item];
        setItems(updated);
        onUpdate?.({ checklistItems: updated.map((i) => ({ done: i.done })) });
        setNewText("");
        setNewDueDate("");
        inputRef.current?.focus();
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(item) {
    try {
      const res = await api(`/api/tasks/${task.id}/checklist/${item.id}`, { method: "DELETE" });
      if (res.ok) {
        const updated = items.filter((i) => i.id !== item.id);
        setItems(updated);
        onUpdate?.({ checklistItems: updated.map((i) => ({ done: i.done })) });
      }
    } catch {
      // silent
    }
  }

  async function handleDueDateChange(item, date) {
    const optimistic = items.map((i) => (i.id === item.id ? { ...i, dueDate: date || null } : i));
    setItems(optimistic);
    try {
      await api(`/api/tasks/${task.id}/checklist/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ dueDate: date || null }),
      });
    } catch {
      setItems(items);
    }
  }

  function formatDate(d) {
    if (!d) return null;
    return new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  }

  function isOverdue(item) {
    if (!item.dueDate || item.done) return false;
    return new Date(item.dueDate) < new Date(new Date().toDateString());
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") handleAdd(e);
  }

  return (
    <Modal
      onClose={onClose}
      size="lg"
      title={
        <div className="min-w-0 pr-4">
          <h2 className="text-base font-bold text-heading">Чек-лист</h2>
          <p className="text-xs text-subtle mt-0.5 truncate">{task.title}</p>
        </div>
      }
      bodyClassName="p-0"
      footer={
        <>
          <input
            ref={inputRef}
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Новый пункт… (Enter — добавить)"
            className="flex-1 px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          <input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            onKeyDown={(e) => e.preventDefault()}
            className="shrink-0 w-9 h-9 p-1.5 border border-line rounded-lg text-transparent hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-datetime-edit]:hidden"
            title={newDueDate ? `Срок: ${formatDate(newDueDate)}` : "Установить срок"}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newText.trim()}
            className="shrink-0 p-2.5 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 transition-all disabled:opacity-40"
          >
            <Plus size={15} />
          </button>
        </>
      }
    >
      {/* Progress */}
      {total > 0 && (
        <div className="px-6 pt-4 pb-2">
          <div className="flex items-center justify-between text-xs text-subtle mb-1.5">
            <span>
              {doneCount} из {total} выполнено
            </span>
            <span className="font-medium tabular-nums">{pct}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Items */}
      <div className="px-6 py-3 space-y-1">
        {loading ? (
          <p className="text-sm text-subtle py-4 text-center">Загрузка...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-subtle py-4 text-center">Пока нет пунктов. Добавьте первый.</p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 group py-1.5 rounded-lg hover:bg-canvas px-1 -mx-1"
            >
              <button
                onClick={() => handleToggle(item)}
                className={`w-5 h-5 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
                  item.done
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : "border-line hover:border-primary"
                }`}
              >
                {item.done && (
                  <svg
                    viewBox="0 0 10 8"
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="1,4 4,7 9,1" />
                  </svg>
                )}
              </button>
              <span
                className={`flex-1 text-sm ${item.done ? "line-through text-subtle" : "text-body"}`}
              >
                {item.text}
              </span>
              {item.dueDate && (
                <span
                  className={`text-xs tabular-nums ${isOverdue(item) ? "text-red-500 dark:text-red-400 font-medium" : "text-subtle"}`}
                >
                  {formatDate(item.dueDate)}
                </span>
              )}
              <input
                type="date"
                value={item.dueDate ? item.dueDate.slice(0, 10) : ""}
                onChange={(e) => handleDueDateChange(item, e.target.value)}
                onKeyDown={(e) => e.preventDefault()}
                className="opacity-0 group-hover:opacity-100 w-5 h-5 p-0 border-0 text-transparent cursor-pointer transition-all [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-datetime-edit]:hidden"
                title="Срок"
              />
              <button
                onClick={() => handleDelete(item)}
                className="opacity-0 group-hover:opacity-100 p-1 text-subtle hover:text-red-500 dark:hover:text-red-400 transition-all"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
