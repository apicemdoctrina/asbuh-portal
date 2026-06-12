import { useState } from "react";
import { Link } from "react-router";
import { useApi, jsonFetcher } from "../hooks/useApi.js";
import { api } from "../lib/api.js";
import { fmtMoney as fmtMoneyBase } from "../lib/format.js";
import { useAuth } from "../context/AuthContext.jsx";
import Modal from "../components/ui/Modal.jsx";
import {
  Search,
  Loader2,
  Pencil,
  Trash2,
  X,
  KeyRound,
  AlertCircle,
  MessageSquare,
  Send,
  Building2,
  CalendarClock,
} from "lucide-react";

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

// Здесь суммы агрегированные — округляем до рубля
const fmtMoney = (n) => fmtMoneyBase(n, { round: true });

function fmtSince(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", { month: "short", year: "2-digit" });
}

export default function ClientsPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");

  const [search, setSearch] = useState("");
  const [editingClient, setEditingClient] = useState(null);

  const {
    data,
    loading,
    refetch: fetchClients,
  } = useApi(
    jsonFetcher(() => {
      const qs = new URLSearchParams({ role: "client" });
      if (search) qs.set("search", search);
      return api(`/api/users?${qs}`);
    }),
    [search],
    { debounce: 300 },
  );
  const clients = data ?? [];

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
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-heading">Клиенты</h1>
        {clients.length > 0 && (
          <span className="text-xs text-subtle bg-muted px-2 py-1 rounded-full">
            {clients.length}
          </span>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-4 sm:mb-6">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
        <input
          type="text"
          placeholder="Поиск по имени или email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-subtle">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : clients.length === 0 ? (
        <div className="text-center py-12 text-subtle text-sm">
          {search ? "Ничего не найдено" : "Нет клиентов"}
        </div>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="lg:hidden space-y-2.5">
            {clients.map((c) => (
              <ClientCard
                key={c.id}
                client={c}
                isAdmin={isAdmin}
                onEdit={() => setEditingClient(c)}
                onDelete={() => handleDelete(c)}
              />
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden lg:block bg-surface rounded-2xl shadow-lg border border-line overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-subtle bg-canvas/30">
                  <th className="px-5 py-3 font-medium">Клиент</th>
                  <th className="px-4 py-3 font-medium">Организации</th>
                  <th className="px-4 py-3 font-medium text-right">Платёж / Долг</th>
                  <th className="px-4 py-3 font-medium text-center" title="Открытые тикеты">
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare size={13} />
                      Тикеты
                    </span>
                  </th>
                  <th className="px-4 py-3 font-medium">Был онлайн</th>
                  <th className="px-4 py-3 font-medium">С нами</th>
                  {isAdmin && <th className="px-4 py-3 font-medium w-20"></th>}
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const online = isOnline(c.lastSeenAt);
                  const hasDebt = (c.totalDebt || 0) > 0;
                  return (
                    <tr
                      key={c.id}
                      className={`border-b border-line last:border-0 hover:bg-canvas/40 ${!c.isActive ? "opacity-50" : ""}`}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${online ? "bg-emerald-500" : "bg-slate-300"}`}
                            title={online ? "Онлайн" : "Не в сети"}
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-heading leading-tight">
                              {isAdmin ? (
                                <Link
                                  to={`/users/${c.id}`}
                                  className="hover:text-primary transition-colors"
                                >
                                  {c.lastName} {c.firstName}
                                </Link>
                              ) : (
                                `${c.lastName} ${c.firstName}`
                              )}
                            </div>
                            <div className="text-xs text-subtle inline-flex items-center gap-1.5 mt-0.5">
                              {c.email}
                              {c.telegramConnected && (
                                <span
                                  className="inline-flex items-center text-sky-500"
                                  title="Telegram подключён"
                                >
                                  <Send size={11} />
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {c.organizations?.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {c.organizations.map((org) => (
                              <Link
                                key={org.id}
                                to={`/organizations/${org.id}`}
                                className="inline-flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-medium hover:bg-primary/20 transition-colors"
                              >
                                {org.name}
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                        <div className="text-body">{fmtMoney(c.totalMonthlyPayment)}/мес</div>
                        {hasDebt ? (
                          <div className="inline-flex items-center gap-1 mt-0.5 text-xs font-bold text-red-600 dark:text-red-300">
                            <AlertCircle size={11} />
                            Долг {fmtMoney(c.totalDebt)}
                          </div>
                        ) : (
                          <div className="text-xs text-emerald-600 dark:text-emerald-300 mt-0.5">
                            Без долга
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {c.openTickets > 0 ? (
                          <span
                            className={`inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-xs font-bold tabular-nums ${
                              c.openTickets > 5
                                ? "bg-red-500/15 text-red-600 dark:text-red-300"
                                : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                            }`}
                          >
                            {c.openTickets}
                          </span>
                        ) : (
                          <span className="text-xs text-subtle">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {c.isActive ? (
                          <span
                            className={`text-xs font-medium ${online ? "text-emerald-600 dark:text-emerald-300" : "text-subtle"}`}
                          >
                            {formatLastSeen(c.lastSeenAt)}
                          </span>
                        ) : (
                          <span className="text-subtle bg-muted px-2 py-0.5 rounded-full text-xs font-medium">
                            Неактивен
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-subtle whitespace-nowrap">
                        {fmtSince(c.createdAt)}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setEditingClient(c)}
                              className="p-1.5 text-subtle hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
                              title="Редактировать"
                              aria-label="Редактировать"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => handleDelete(c)}
                              className="p-1.5 text-subtle hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 rounded-lg transition-colors"
                              title={c.isActive ? "Деактивировать" : "Удалить навсегда"}
                              aria-label={c.isActive ? "Деактивировать" : "Удалить навсегда"}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

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

function ClientCard({ client: c, isAdmin, onEdit, onDelete }) {
  const online = isOnline(c.lastSeenAt);
  const hasDebt = (c.totalDebt || 0) > 0;
  return (
    <div
      className={`relative bg-surface border rounded-2xl p-3 overflow-hidden transition-colors ${
        !c.isActive ? "opacity-55 border-line" : "border-line"
      }`}
    >
      {/* Online accent */}
      {c.isActive && (
        <div
          className="pointer-events-none absolute top-0 left-0 bottom-0 w-1"
          style={{
            background: online
              ? "linear-gradient(180deg, #10b981 0%, #06b6d4 100%)"
              : "linear-gradient(180deg, #cbd5e1 0%, #94a3b8 100%)",
            boxShadow: online ? "0 0 12px 0 rgba(16,185,129,0.45)" : undefined,
          }}
        />
      )}
      {hasDebt && (
        <div
          className="pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-30 dark:opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, #ef4444 0%, transparent 70%)" }}
        />
      )}

      <div className="relative pl-2">
        {/* Top row: name + status */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${online ? "bg-emerald-500" : "bg-slate-300"}`}
              />
              <div className="text-sm font-bold text-heading leading-tight truncate">
                {isAdmin ? (
                  <Link to={`/users/${c.id}`} className="hover:text-primary transition-colors">
                    {c.lastName} {c.firstName}
                  </Link>
                ) : (
                  `${c.lastName} ${c.firstName}`
                )}
              </div>
            </div>
            <div className="text-xs text-subtle mt-0.5 truncate inline-flex items-center gap-1.5">
              {c.email}
              {c.telegramConnected && (
                <span className="inline-flex items-center text-sky-500" title="Telegram подключён">
                  <Send size={11} />
                </span>
              )}
            </div>
          </div>
          {!c.isActive && (
            <span className="shrink-0 text-[10px] text-subtle bg-muted px-2 py-0.5 rounded-full font-medium">
              Неактивен
            </span>
          )}
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
              online
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                : "bg-muted text-subtle"
            }`}
          >
            <CalendarClock size={10} />
            {formatLastSeen(c.lastSeenAt)}
          </span>
          {c.openTickets > 0 && (
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-bold ${
                c.openTickets > 5
                  ? "bg-red-500/15 text-red-600 dark:text-red-300"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
              }`}
            >
              <MessageSquare size={10} />
              {c.openTickets} тикет{c.openTickets === 1 ? "" : c.openTickets < 5 ? "а" : "ов"}
            </span>
          )}
          {c.organizations?.length > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-canvas border border-line text-body">
              <Building2 size={10} />
              {c.organizations.length} орг.
            </span>
          )}
          <span className="text-[11px] text-subtle ml-auto">с {fmtSince(c.createdAt)}</span>
        </div>

        {/* Organizations chips */}
        {c.organizations?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {c.organizations.map((org) => (
              <Link
                key={org.id}
                to={`/organizations/${org.id}`}
                className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[11px] font-medium hover:bg-primary/20 transition-colors truncate max-w-[160px]"
              >
                {org.name}
              </Link>
            ))}
          </div>
        )}

        {/* Money row */}
        <div className="flex items-baseline justify-between gap-2 mt-2 pt-2 border-t border-line/60">
          <div className="text-xs text-subtle">
            <span className="font-medium text-body tabular-nums">
              {fmtMoney(c.totalMonthlyPayment)}
            </span>{" "}
            / мес
          </div>
          {hasDebt ? (
            <div
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-bold text-red-600 dark:text-red-200 bg-red-500/10 tabular-nums"
              style={{ boxShadow: "0 0 10px 0 rgba(239,68,68,0.35)" }}
            >
              <AlertCircle size={11} />
              Долг {fmtMoney(c.totalDebt)}
            </div>
          ) : (
            <div className="text-xs text-emerald-600 dark:text-emerald-300 font-medium">
              ✓ Без долга
            </div>
          )}
        </div>

        {/* Actions */}
        {isAdmin && (
          <div className="flex items-center justify-end gap-1 mt-2 -mr-1">
            <button
              onClick={onEdit}
              className="p-1.5 text-subtle hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
              aria-label="Редактировать"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 text-subtle hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 rounded-lg transition-colors"
              aria-label={c.isActive ? "Деактивировать" : "Удалить навсегда"}
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
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

  const [showPasswordBlock, setShowPasswordBlock] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSetPassword() {
    setPasswordError("");
    setPasswordSuccess(false);
    if (newPassword.length < 8) {
      setPasswordError("Пароль должен быть не менее 8 символов");
      return;
    }
    setPasswordSubmitting(true);
    try {
      const res = await api(`/api/users/${client.id}/password`, {
        method: "PATCH",
        body: JSON.stringify({ newPassword }),
      });
      if (res.ok) {
        setPasswordSuccess(true);
        setNewPassword("");
        setShowPasswordBlock(false);
      } else {
        const data = await res.json().catch(() => ({}));
        setPasswordError(data.error || "Ошибка");
      }
    } catch {
      setPasswordError("Сетевая ошибка");
    } finally {
      setPasswordSubmitting(false);
    }
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
    <Modal onClose={onClose} title="Редактировать клиента" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-body mb-1">Фамилия *</label>
          <input
            type="text"
            value={form.lastName}
            onChange={(e) => setField("lastName", e.target.value)}
            className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-body mb-1">Имя *</label>
          <input
            type="text"
            value={form.firstName}
            onChange={(e) => setField("firstName", e.target.value)}
            className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-body mb-1">Email *</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setField("email", e.target.value)}
            className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setField("isActive", e.target.checked)}
              className="w-4 h-4 rounded border-line text-primary focus:ring-primary/30"
            />
            <span className="text-sm font-medium text-body">Активен</span>
          </label>
        </div>

        {error && (
          <div className="text-sm text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-500/15 px-3 py-2 rounded-lg">
            {error}
          </div>
        )}

        {/* Password reset block */}
        <div className="border-t border-line pt-4">
          {!showPasswordBlock ? (
            <button
              type="button"
              onClick={() => {
                setShowPasswordBlock(true);
                setPasswordSuccess(false);
              }}
              className="flex items-center gap-2 text-sm text-subtle hover:text-primary transition-colors"
            >
              <KeyRound size={14} />
              Сменить пароль
            </button>
          ) : (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-body">Новый пароль</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Минимум 8 символов"
                  className="flex-1 px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={handleSetPassword}
                  disabled={passwordSubmitting}
                  className="px-3 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white shadow-lg shadow-[#6567F1]/30 transition-all disabled:opacity-50"
                >
                  {passwordSubmitting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    "Сохранить"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordBlock(false);
                    setNewPassword("");
                    setPasswordError("");
                  }}
                  className="p-1.5 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              {passwordError && (
                <div className="text-sm text-red-600 dark:text-red-300">{passwordError}</div>
              )}
            </div>
          )}
          {passwordSuccess && (
            <div className="text-sm text-green-600 dark:text-green-300 mt-1">
              Пароль успешно изменён
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-body hover:text-heading transition-colors"
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
    </Modal>
  );
}
