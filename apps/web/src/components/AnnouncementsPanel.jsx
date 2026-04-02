import { useState, useEffect, useCallback } from "react";
import { X, Plus, Megaphone, Loader2, Trash2, ChevronUp } from "lucide-react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";

const TYPE_META = {
  FEATURE: { label: "Новое", color: "bg-emerald-100 text-emerald-700" },
  FIX: { label: "Исправление", color: "bg-blue-100 text-blue-700" },
  CHANGE: { label: "Изменение", color: "bg-amber-100 text-amber-700" },
  REMOVAL: { label: "Удалено", color: "bg-red-100 text-red-700" },
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function AnnouncementsPanel({ onClose, onUnreadChange }) {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", type: "FEATURE" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadAnnouncements = useCallback(async () => {
    try {
      const res = await api("/api/announcements");
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
      const unread = (Array.isArray(data) ? data : []).filter((a) => !a.isRead).length;
      onUnreadChange?.(unread);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [onUnreadChange]);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  async function handleMarkAllRead() {
    await api("/api/announcements/read-all", { method: "POST" });
    setItems((prev) => prev.map((a) => ({ ...a, isRead: true })));
    onUnreadChange?.(0);
  }

  async function handleDelete(id) {
    if (!confirm("Удалить анонс?")) return;
    await api(`/api/announcements/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) {
      setError("Заполните заголовок и текст");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await api("/api/announcements", {
        method: "POST",
        body: JSON.stringify(form),
      });
      const created = await res.json();
      setItems((prev) => [created, ...prev]);
      setForm({ title: "", body: "", type: "FEATURE" });
      setShowForm(false);
    } catch {
      setError("Не удалось создать анонс");
    } finally {
      setSubmitting(false);
    }
  }

  const unreadCount = items.filter((a) => !a.isRead).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md bg-white shadow-2xl flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Megaphone size={20} className="text-[#6567F1]" />
            <h2 className="text-base font-semibold text-slate-900">Обновления сервиса</h2>
            {unreadCount > 0 && (
              <span className="bg-[#6567F1] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-[#6567F1] hover:underline"
              >
                Отметить все
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => setShowForm((v) => !v)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-[#6567F1] hover:bg-[#6567F1]/5 transition-colors"
                title="Создать анонс"
              >
                {showForm ? <ChevronUp size={18} /> : <Plus size={18} />}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Create form (admin only) */}
        {isAdmin && showForm && (
          <form
            onSubmit={handleSubmit}
            className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex-shrink-0"
          >
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-[#6567F1]"
                >
                  {Object.entries(TYPE_META).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Заголовок"
                  className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#6567F1]"
                />
              </div>
              <textarea
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="Описание изменений..."
                rows={3}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-[#6567F1]"
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-sm px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="text-sm px-4 py-1.5 rounded-lg bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white disabled:opacity-50 transition-all"
                >
                  {submitting ? "Публикация..." : "Опубликовать"}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
              <Megaphone size={32} className="opacity-30" />
              <p className="text-sm">Нет анонсов</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((item) => {
                const meta = TYPE_META[item.type] ?? TYPE_META.FEATURE;
                return (
                  <div
                    key={item.id}
                    className={`px-5 py-4 transition-colors ${item.isRead ? "" : "bg-[#6567F1]/3"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.color}`}
                          >
                            {meta.label}
                          </span>
                          {!item.isRead && (
                            <span className="w-2 h-2 rounded-full bg-[#6567F1] flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-800 leading-snug">
                          {item.title}
                        </p>
                        <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap leading-relaxed">
                          {item.body}
                        </p>
                        <p className="text-xs text-slate-400 mt-2">
                          {formatDate(item.publishedAt)} · {item.author}
                        </p>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-1 rounded text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors flex-shrink-0 mt-0.5"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
