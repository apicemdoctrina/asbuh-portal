import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import { ArrowLeft, Pencil, Trash2, Building2, Loader2, X, User } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "";
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

const ROLE_LABELS = {
  admin: "Админ",
  manager: "Менеджер",
  accountant: "Бухгалтер",
  client: "Клиент",
};

const ASSIGNABLE_ROLES = ["admin", "manager", "accountant"];

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

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api(`/api/users/${id}`);
      if (res.ok) {
        setProfile(await res.json());
      } else if (res.status === 403) {
        navigate("/");
      } else if (res.status === 404) {
        setError("Пользователь не найден");
      } else {
        setError("Ошибка загрузки");
      }
    } catch {
      setError("Сетевая ошибка");
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    if (!isAdmin) {
      navigate("/");
      return;
    }
    fetchProfile();
  }, [isAdmin, fetchProfile, navigate]);

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
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-24">
        <p className="text-slate-500 mb-4">{error}</p>
        <button onClick={() => navigate(-1)} className="text-[#6567F1] hover:underline text-sm">
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
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={16} />
          {backLabel}
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Avatar + status card */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 flex flex-col items-center gap-4">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="Аватар"
              className="w-24 h-24 rounded-full object-cover border-2 border-slate-200"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-[#6567F1]/10 flex items-center justify-center text-[#6567F1] text-2xl font-bold">
              {initials || <User size={32} />}
            </div>
          )}

          <div className="text-center">
            <p className="font-semibold text-slate-900 text-lg">
              {profile.lastName} {profile.firstName}
            </p>
            <p className="text-sm text-slate-500">{profile.email}</p>
          </div>

          {/* Roles */}
          <div className="flex flex-wrap justify-center gap-1.5">
            {profile.roles.map((r) => (
              <span
                key={r}
                className="bg-[#6567F1]/10 text-[#6567F1] px-3 py-1 rounded-full text-xs font-medium"
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
            <span className={`text-sm font-medium ${online ? "text-green-600" : "text-slate-500"}`}>
              {formatLastSeen(profile.lastSeenAt)}
            </span>
          </div>

          {/* Status badge */}
          {!profile.isActive && (
            <span className="bg-slate-100 text-slate-500 px-3 py-1 rounded-full text-xs font-medium">
              Деактивирован
            </span>
          )}

          {/* Action buttons */}
          {canEdit && (
            <div className="flex gap-2 w-full">
              <button
                onClick={() => setEditOpen(true)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border-2 border-[#6567F1]/20 text-[#6567F1] hover:bg-[#6567F1]/5 text-sm font-medium transition-colors"
              >
                <Pencil size={15} />
                Изменить
              </button>
              {canDelete && (
                <button
                  onClick={handleDelete}
                  title={profile.isActive ? "Деактивировать" : "Удалить навсегда"}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl border-2 border-red-200 text-red-500 hover:bg-red-50 text-sm font-medium transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Personal details */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Личные данные</h2>
          <dl className="grid gap-y-3 gap-x-6 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-slate-500 font-medium mb-0.5">Фамилия</dt>
              <dd className="text-slate-900">{profile.lastName || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500 font-medium mb-0.5">Имя</dt>
              <dd className="text-slate-900">{profile.firstName || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500 font-medium mb-0.5">Email</dt>
              <dd className="text-slate-900">{profile.email}</dd>
            </div>
            <div>
              <dt className="text-slate-500 font-medium mb-0.5">Телефон</dt>
              <dd className="text-slate-900">{profile.phone || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500 font-medium mb-0.5">Дата рождения</dt>
              <dd className="text-slate-900">
                {profile.birthDate ? new Date(profile.birthDate).toLocaleDateString("ru-RU") : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 font-medium mb-0.5">В системе с</dt>
              <dd className="text-slate-900">
                {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString("ru-RU") : "—"}
              </dd>
            </div>
          </dl>

          {/* Organizations (mainly for clients) */}
          {profile.organizations?.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <Building2 size={16} className="text-slate-400" />
                Организации
              </h3>
              <div className="flex flex-wrap gap-2">
                {profile.organizations.map((org) => (
                  <Link
                    key={org.id}
                    to={`/organizations/${org.id}`}
                    className="bg-[#6567F1]/10 text-[#6567F1] px-3 py-1 rounded-full text-xs font-medium hover:bg-[#6567F1]/20 transition-colors"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900">
            Редактировать {isClient ? "клиента" : "сотрудника"}
          </h2>
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

          {/* Role picker — only for staff */}
          {!isClient && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Роль</label>
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
                      className="w-4 h-4 border-slate-300 text-[#6567F1] focus:ring-[#6567F1]/30"
                    />
                    <span className="text-sm text-slate-700">{ROLE_LABELS[r]}</span>
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
                className="w-4 h-4 rounded border-slate-300 text-[#6567F1] focus:ring-[#6567F1]/30"
              />
              <span className="text-sm font-medium text-slate-700">Активен</span>
            </label>
          )}

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
