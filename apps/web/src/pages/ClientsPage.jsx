import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Search, Loader2, Pencil, Trash2, X } from "lucide-react";

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function isOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
}

function formatLastSeen(lastSeenAt) {
  if (!lastSeenAt) return "Никогда";
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  if (diff < ONLINE_THRESHOLD_MS) return "Онлайн";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} мин. назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч. назад`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} дн. назад`;
  return new Date(lastSeenAt).toLocaleDateString("ru-RU");
}

export default function ClientsPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingClient, setEditingClient] = useState(null);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ role: "client" });
      if (search) qs.set("search", search);
      const res = await api(`/api/users?${qs}`);
      if (res.ok) {
        setClients(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(fetchClients, 300);
    return () => clearTimeout(timer);
  }, [fetchClients]);

  async function handleDelete(c) {
    const msg = c.isActive
      ? `Деактивировать клиента ${c.lastName} ${c.firstName}?`
      : `Удалить ${c.lastName} ${c.firstName} навсегда? Это действие необратимо.`;
    if (!confirm(msg)) return;
    try {
      const res = await api(`/api/users/${c.id}`, { method: "DELETE" });
      if (res.ok) {
        fetchClients();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Ошибка удаления");
      }
    } catch {
      alert("Сетевая ошибка");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Клиенты</h1>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Поиск по имени или email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : clients.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            {search ? "Ничего не найдено" : "Нет клиентов"}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500">
                <th className="px-6 py-3 font-medium">Имя</th>
                <th className="px-6 py-3 font-medium">Email</th>
                <th className="px-6 py-3 font-medium">Организации</th>
                <th className="px-6 py-3 font-medium">Статус</th>
                {isAdmin && <th className="px-6 py-3 font-medium">Действия</th>}
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr
                  key={c.id}
                  className={`border-b border-slate-50 hover:bg-slate-50/50 ${!c.isActive ? "opacity-50" : ""}`}
                >
                  <td className="px-6 py-3 font-medium text-slate-900">
                    {isAdmin ? (
                      <Link
                        to={`/users/${c.id}`}
                        className="hover:text-[#6567F1] transition-colors"
                      >
                        {c.lastName} {c.firstName}
                      </Link>
                    ) : (
                      <>
                        {c.lastName} {c.firstName}
                      </>
                    )}
                  </td>
                  <td className="px-6 py-3 text-slate-600">{c.email}</td>
                  <td className="px-6 py-3">
                    {c.organizations?.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {c.organizations.map((org) => (
                          <Link
                            key={org.id}
                            to={`/organizations/${org.id}`}
                            className="bg-[#6567F1]/10 text-[#6567F1] px-2 py-0.5 rounded-full text-xs font-medium hover:bg-[#6567F1]/20 transition-colors"
                          >
                            {org.name}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    {c.isActive ? (
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${isOnline(c.lastSeenAt) ? "bg-green-500" : "bg-slate-300"}`}
                        />
                        <span
                          className={`text-xs font-medium ${isOnline(c.lastSeenAt) ? "text-green-600" : "text-slate-500"}`}
                        >
                          {formatLastSeen(c.lastSeenAt)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full text-xs font-medium">
                        Неактивен
                      </span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingClient(c)}
                          className="p-1.5 text-slate-400 hover:text-[#6567F1] hover:bg-[#6567F1]/5 rounded-lg transition-colors"
                          title="Редактировать"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(c)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title={c.isActive ? "Деактивировать" : "Удалить навсегда"}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editingClient && (
        <EditClientModal
          client={editingClient}
          onClose={() => setEditingClient(null)}
          onUpdated={() => {
            setEditingClient(null);
            fetchClients();
          }}
        />
      )}
    </div>
  );
}

function EditClientModal({ client, onClose, onUpdated }) {
  const [form, setForm] = useState({
    lastName: client.lastName,
    firstName: client.firstName,
    email: client.email,
    isActive: client.isActive,
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.lastName || !form.firstName || !form.email) {
      setError("Заполните все обязательные поля");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api(`/api/users/${client.id}`, {
        method: "PUT",
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          isActive: form.isActive,
        }),
      });
      if (res.ok) {
        onUpdated();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Ошибка обновления");
      }
    } catch {
      setError("Сетевая ошибка");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900">Редактировать клиента</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Фамилия *</label>
            <input
              type="text"
              value={form.lastName}
              onChange={(e) => setField("lastName", e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Имя *</label>
            <input
              type="text"
              value={form.firstName}
              onChange={(e) => setField("firstName", e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setField("isActive", e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-[#6567F1] focus:ring-[#6567F1]/30"
              />
              <span className="text-sm font-medium text-slate-700">Активен</span>
            </label>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white shadow-lg shadow-[#6567F1]/30 transition-all disabled:opacity-50"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
