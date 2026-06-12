import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import { useApi } from "../hooks/useApi.js";
import { ArrowLeft, Pencil, Trash2, Building2, Loader2, X, User, KeyRound } from "lucide-react";
import Modal from "../components/ui/Modal.jsx";

const API_BASE = import.meta.env.VITE_API_URL || "";
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

const ROLE_LABELS = {
  admin: "Админ",
  supervisor: "Руководитель",
  manager: "Менеджер",
  accountant: "Бухгалтер",
  client: "Клиент",
};

const ASSIGNABLE_ROLES = ["admin", "supervisor", "manager", "accountant"];

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

export default function UserProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: me, hasRole } = useAuth();
  const isAdmin = hasRole("admin");

  const [editOpen, setEditOpen] = useState(false);

  const {
    data: profile,
    loading,
    error,
    refetch: fetchProfile,
  } = useApi(
    async () => {
      const res = await api(`/api/users/${id}`);
      if (res.ok) return res.json();
      if (res.status === 403) {
        navigate("/");
        return null;
      }
      const err = new Error(`HTTP ${res.status}`);
      err.userMessage = res.status === 404 ? "Пользователь не найден" : "Ошибка загрузки";
      throw err;
    },
    [id],
    { enabled: isAdmin, errorMessage: "Сетевая ошибка" },
  );

  useEffect(() => {
    if (!isAdmin) navigate("/");
  }, [isAdmin, navigate]);

  async function handleDelete() {
    if (!profile) return;
    const msg = profile.isActive
      ? `Деактивировать ${profile.lastName} ${profile.firstName}?`
      : `Удалить ${profile.lastName} ${profile.firstName} навсегда? Это действие необратимо.`;
    if (!confirm(msg)) return;
    try {
      const res = await api(`/api/users/${id}`, { method: "DELETE" });
      if (res.ok) {
        const isClient = profile.roles.includes("client");
        navigate(isClient ? "/clients" : "/staff");
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Ошибка");
      }
    } catch {
      alert("Сетевая ошибка");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-subtle">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-24">
        <p className="text-subtle mb-4">{error}</p>
        <button onClick={() => navigate(-1)} className="text-primary hover:underline text-sm">
          Назад
        </button>
      </div>
    );
  }

  if (!profile) return null;

  const isClient = profile.roles.includes("client");
  const isSelf = me?.id === profile.id;
  const canEdit = isAdmin;
  const canDelete = isAdmin && !isSelf && !profile.roles.includes("admin");
  const online = isOnline(profile.lastSeenAt);
  const avatarUrl = profile.avatarUrl ? `${API_BASE}${profile.avatarUrl}` : null;
  const initials = `${(profile.firstName?.[0] || "").toUpperCase()}${(profile.lastName?.[0] || "").toUpperCase()}`;
  const backTo = isClient ? "/clients" : "/staff";
  const backLabel = isClient ? "Клиенты" : "Сотрудники";

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          to={backTo}
          className="flex items-center gap-1.5 text-sm text-subtle hover:text-body transition-colors"
        >
          <ArrowLeft size={16} />
          {backLabel}
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Avatar + status card */}
        <div className="bg-surface rounded-2xl shadow-lg border border-line p-6 flex flex-col items-center gap-4">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="Аватар"
              className="w-24 h-24 rounded-full object-cover border-2 border-line"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold">
              {initials || <User size={32} />}
            </div>
          )}

          <div className="text-center">
            <p className="font-semibold text-heading text-lg">
              {profile.lastName} {profile.firstName}
            </p>
            <p className="text-sm text-subtle">{profile.email}</p>
          </div>

          {/* Roles */}
          <div className="flex flex-wrap justify-center gap-1.5">
            {profile.roles.map((r) => (
              <span
                key={r}
                className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-medium"
              >
                {ROLE_LABELS[r] || r}
              </span>
            ))}
          </div>

          {/* Last seen */}
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${online ? "bg-green-500" : "bg-slate-300"}`}
            />
            <span
              className={`text-sm font-medium ${online ? "text-green-600 dark:text-green-300" : "text-subtle"}`}
            >
              {formatLastSeen(profile.lastSeenAt)}
            </span>
          </div>

          {/* Status badge */}
          {!profile.isActive && (
            <span className="bg-muted text-subtle px-3 py-1 rounded-full text-xs font-medium">
              Деактивирован
            </span>
          )}

          {/* Action buttons */}
          {canEdit && (
            <div className="flex gap-2 w-full">
              <button
                onClick={() => setEditOpen(true)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border-2 border-primary/20 text-primary hover:bg-primary/5 text-sm font-medium transition-colors"
              >
                <Pencil size={15} />
                Изменить
              </button>
              {canDelete && (
                <button
                  onClick={handleDelete}
                  title={profile.isActive ? "Деактивировать" : "Удалить навсегда"}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl border-2 border-red-200 dark:border-red-500/30 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 text-sm font-medium transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Personal details */}
        <div className="bg-surface rounded-2xl shadow-lg border border-line p-6 lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold text-heading">Личные данные</h2>
          <dl className="grid gap-y-3 gap-x-6 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-subtle font-medium mb-0.5">Фамилия</dt>
              <dd className="text-heading">{profile.lastName || "—"}</dd>
            </div>
            <div>
              <dt className="text-subtle font-medium mb-0.5">Имя</dt>
              <dd className="text-heading">{profile.firstName || "—"}</dd>
            </div>
            <div>
              <dt className="text-subtle font-medium mb-0.5">Email</dt>
              <dd className="text-heading">{profile.email}</dd>
            </div>
            <div>
              <dt className="text-subtle font-medium mb-0.5">Телефон</dt>
              <dd className="text-heading">{profile.phone || "—"}</dd>
            </div>
            <div>
              <dt className="text-subtle font-medium mb-0.5">Дата рождения</dt>
              <dd className="text-heading">
                {profile.birthDate ? new Date(profile.birthDate).toLocaleDateString("ru-RU") : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-subtle font-medium mb-0.5">В системе с</dt>
              <dd className="text-heading">
                {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString("ru-RU") : "—"}
              </dd>
            </div>
            {!isClient && (
              <div>
                <dt className="text-subtle font-medium mb-0.5">Зарплата</dt>
                <dd className="text-heading">
                  {profile.salary != null
                    ? Number(profile.salary).toLocaleString("ru-RU", {
                        style: "currency",
                        currency: "RUB",
                        maximumFractionDigits: 0,
                      })
                    : "—"}
                </dd>
              </div>
            )}
          </dl>

          {/* Organizations (mainly for clients) */}
          {profile.organizations?.length > 0 && (
            <div className="pt-2 border-t border-line">
              <h3 className="text-sm font-semibold text-body mb-2 flex items-center gap-2">
                <Building2 size={16} className="text-subtle" />
                Организации
              </h3>
              <div className="flex flex-wrap gap-2">
                {profile.organizations.map((org) => (
                  <Link
                    key={org.id}
                    to={`/organizations/${org.id}`}
                    className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-medium hover:bg-primary/20 transition-colors"
                  >
                    {org.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editOpen && (
        <EditUserModal
          profile={profile}
          isClient={isClient}
          isSelf={isSelf}
          onClose={() => setEditOpen(false)}
          onUpdated={() => {
            setEditOpen(false);
            fetchProfile();
          }}
        />
      )}
    </div>
  );
}

function EditUserModal({ profile, isClient, isSelf, onClose, onUpdated }) {
  const targetIsAdmin = profile.roles.includes("admin");
  const rolesDisabled = isClient || targetIsAdmin;
  const currentRole = profile.roles.find((r) => ASSIGNABLE_ROLES.includes(r)) || "";

  const [form, setForm] = useState({
    lastName: profile.lastName,
    firstName: profile.firstName,
    email: profile.email,
    role: currentRole,
    isActive: profile.isActive,
    salary: profile.salary != null ? String(profile.salary) : "",
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
      const res = await api(`/api/users/${profile.id}/password`, {
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

    const body = {
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
    };

    if (!isClient && !targetIsAdmin) {
      body.roleNames = [form.role];
    }
    if (!isSelf && !targetIsAdmin) {
      body.isActive = form.isActive;
    }
    if (!isClient) {
      body.salary = form.salary === "" ? null : Number(form.salary);
    }

    setSubmitting(true);
    try {
      const res = await api(`/api/users/${profile.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
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
    <Modal
      onClose={onClose}
      title={`Редактировать ${isClient ? "клиента" : "сотрудника"}`}
      size="md"
    >
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

        {/* Salary — only for staff */}
        {!isClient && (
          <div>
            <label className="block text-sm font-medium text-body mb-1">Зарплата (₽)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.salary}
              onChange={(e) => setField("salary", e.target.value)}
              placeholder="Не указана"
              className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
        )}

        {/* Role picker — only for staff */}
        {!isClient && (
          <div>
            <label className="block text-sm font-medium text-body mb-2">Роль</label>
            <div className="flex flex-wrap gap-3">
              {ASSIGNABLE_ROLES.map((r) => (
                <label
                  key={r}
                  className={`flex items-center gap-2 ${rolesDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <input
                    type="radio"
                    name="editRole"
                    checked={form.role === r}
                    onChange={() => setField("role", r)}
                    disabled={rolesDisabled}
                    className="w-4 h-4 border-line text-primary focus:ring-primary/30"
                  />
                  <span className="text-sm text-body">{ROLE_LABELS[r]}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Active toggle — not for self or other admins */}
        {!isSelf && !targetIsAdmin && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setField("isActive", e.target.checked)}
              className="w-4 h-4 rounded border-line text-primary focus:ring-primary/30"
            />
            <span className="text-sm font-medium text-body">Активен</span>
          </label>
        )}

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
