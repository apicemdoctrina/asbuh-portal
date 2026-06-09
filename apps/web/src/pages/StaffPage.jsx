import { useState, useCallback } from "react";
import { useDebouncedEffect } from "../hooks/useDebouncedEffect.js";
import { Link } from "react-router";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import {
  Search,
  Plus,
  X,
  Loader2,
  Pencil,
  Trash2,
  KeyRound,
  Clock,
  CheckCircle2,
  AlertCircle,
  ListTodo,
  Wallet,
  FileSpreadsheet,
  Layers,
} from "lucide-react";
import SectionIcon from "../components/SectionIcon.jsx";

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

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

const ASSIGNABLE_ROLES = ["admin", "supervisor", "manager", "accountant"];

const ROLE_LABELS = {
  admin: "Админ",
  supervisor: "Руководитель",
  manager: "Менеджер",
  accountant: "Бухгалтер",
  client: "Клиент",
};

const ACCOUNTANT_TYPE_LABELS = {
  REPORTING: "Отчётность",
  PRIMARY: "Первичка",
  UNIVERSAL: "Универсал",
};

const ROLE_AVATAR_COLORS = {
  admin: "bg-primary text-white",
  supervisor: "bg-purple-500 text-white",
  manager: "bg-sky-500 text-white",
  accountant: "bg-emerald-500 text-white",
};

const ROLE_BADGE_COLORS = {
  admin: "bg-primary/10 text-primary",
  supervisor: "bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300",
  manager: "bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300",
  accountant: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

function getInitials(firstName, lastName) {
  return `${(lastName?.[0] ?? "").toUpperCase()}${(firstName?.[0] ?? "").toUpperCase()}`;
}

function formatMoney(n) {
  if (n == null) return "—";
  return Math.round(Number(n)).toLocaleString("ru-RU");
}

function getPrimaryRole(roles) {
  for (const r of ["admin", "supervisor", "manager", "accountant"]) {
    if (roles.includes(r)) return r;
  }
  return null;
}

export default function StaffPage() {
  const { user, hasRole } = useAuth();
  const [users, setUsers] = useState([]);
  const [workloadMap, setWorkloadMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [compUser, setCompUser] = useState(null);

  const isAdmin = hasRole("admin");
  const isSupervisor = hasRole("supervisor");
  const canManageCompensation = isAdmin || isSupervisor;

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ excludeRole: "client" });
      if (search) qs.set("search", search);
      const [usersRes, analyticsRes] = await Promise.all([
        api(`/api/users?${qs}`),
        api("/api/management/analytics"),
      ]);
      if (usersRes.ok) setUsers(await usersRes.json());
      if (analyticsRes.ok) {
        const analytics = await analyticsRes.json();
        const map = {};
        for (const w of analytics.workload ?? []) map[w.userId] = w;
        setWorkloadMap(map);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [search]);

  useDebouncedEffect(fetchUsers, [fetchUsers]);

  function handleCreated() {
    setShowCreateModal(false);
    fetchUsers();
  }

  function handleUpdated() {
    setEditingUser(null);
    fetchUsers();
  }

  async function handleDelete(u) {
    const msg = u.isActive
      ? `Деактивировать ${u.lastName} ${u.firstName}?`
      : `Удалить ${u.lastName} ${u.firstName} навсегда? Это действие необратимо.`;
    if (!confirm(msg)) return;
    try {
      const res = await api(`/api/users/${u.id}`, { method: "DELETE" });
      if (res.ok) {
        fetchUsers();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Ошибка удаления");
      }
    } catch {
      alert("Сетевая ошибка");
    }
  }

  const canDelete = (u) => isAdmin && u.id !== user?.id && !u.roles.includes("admin");

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6 gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-heading">Сотрудники</h1>
        {isAdmin && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white shadow-lg shadow-[#6567F1]/30 transition-all whitespace-nowrap"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Создать сотрудника</span>
            <span className="sm:hidden">Создать</span>
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-4 sm:mb-5">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle" />
        <input
          type="text"
          placeholder="Поиск по имени..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-line rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-surface"
        />
      </div>

      {/* KPI legend — desktop only */}
      {!loading && users.length > 0 && (
        <div className="hidden lg:flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 px-1 text-xs text-subtle">
          <span className="flex items-center gap-1">
            <ListTodo size={11} /> Активные
          </span>
          <span className="flex items-center gap-1">
            <AlertCircle size={11} /> Просрочено
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle2 size={11} /> Выполнено (30д)
          </span>
          <span className="flex items-center gap-1">
            <Clock size={11} /> Ср. время
          </span>
          <span className="flex items-center gap-1">
            <Layers size={11} /> Заполненность
          </span>
          <span className="flex items-center gap-1">
            <FileSpreadsheet size={11} /> Отчётность
          </span>
        </div>
      )}

      {/* Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-subtle">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-subtle text-sm">
          {search ? "Ничего не найдено" : "Нет сотрудников"}
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => {
            const w = workloadMap[u.id];
            const primaryRole = getPrimaryRole(u.roles);
            const avatarColor = ROLE_AVATAR_COLORS[primaryRole] ?? "bg-slate-400 text-white";

            const online = isOnline(u.lastSeenAt);

            return (
              <StaffCard
                key={u.id}
                u={u}
                w={w}
                online={online}
                avatarColor={avatarColor}
                isAdmin={isAdmin}
                canManageCompensation={canManageCompensation}
                canDelete={canDelete(u)}
                onComp={() => setCompUser(u)}
                onEdit={() => setEditingUser(u)}
                onDelete={() => handleDelete(u)}
              />
            );
          })}
        </div>
      )}

      {showCreateModal && (
        <CreateStaffModal onClose={() => setShowCreateModal(false)} onCreated={handleCreated} />
      )}

      {editingUser && (
        <EditStaffModal
          user={editingUser}
          currentUserId={user?.id}
          onClose={() => setEditingUser(null)}
          onUpdated={handleUpdated}
        />
      )}

      {compUser && (
        <CompensationModal
          user={compUser}
          onClose={() => setCompUser(null)}
          onSaved={() => {
            setCompUser(null);
            fetchUsers();
          }}
        />
      )}
    </div>
  );
}

function KpiCell({ value, icon: Icon, label, valueClass = "text-body", title }) {
  return (
    <div
      className="flex flex-col items-center justify-center py-1.5 px-1 rounded-lg bg-canvas/60 lg:bg-transparent lg:py-0 lg:px-0 lg:rounded-none lg:w-auto"
      title={title}
    >
      <span className={`text-sm font-bold leading-none tabular-nums ${valueClass}`}>{value}</span>
      <div className="flex items-center gap-1 mt-1 lg:mt-0.5">
        <Icon size={11} className="text-subtle lg:hidden" />
        <Icon size={13} className="text-subtle hidden lg:block" />
        <span className="text-[10px] text-subtle lg:hidden">{label}</span>
      </div>
    </div>
  );
}

function StaffCard({
  u,
  w,
  online,
  avatarColor,
  isAdmin,
  canManageCompensation,
  canDelete,
  onComp,
  onEdit,
  onDelete,
}) {
  const openTasksClass =
    w?.openTasks > 10
      ? "text-red-600 dark:text-red-300"
      : w?.openTasks > 5
        ? "text-amber-500 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-300";
  const overdueClass = w?.overdueTasks > 0 ? "text-red-600 dark:text-red-300" : "text-subtle";
  const completenessClass =
    w?.avgCompleteness == null
      ? "text-subtle"
      : w.avgCompleteness >= 90
        ? "text-emerald-600 dark:text-emerald-300"
        : w.avgCompleteness >= 60
          ? "text-amber-600 dark:text-amber-300"
          : "text-red-600 dark:text-red-300";
  const reportingPct = w?.reportingProgress?.percent;
  const reportingClass =
    reportingPct == null
      ? "text-subtle"
      : reportingPct >= 90
        ? "text-emerald-600 dark:text-emerald-300"
        : reportingPct >= 60
          ? "text-amber-600 dark:text-amber-300"
          : "text-red-600 dark:text-red-300";

  return (
    <div
      className={`group bg-surface border border-line rounded-2xl p-3 sm:p-4 lg:px-5 lg:py-4 flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-200 ${!u.isActive ? "opacity-55" : ""}`}
    >
      {/* Top row on mobile, identity column on desktop */}
      <div className="flex items-start gap-3 lg:contents">
        {/* Avatar */}
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${avatarColor}`}
        >
          {getInitials(u.firstName, u.lastName)}
        </div>

        {/* Identity */}
        <div className="flex-1 lg:w-44 lg:flex-none shrink-0 min-w-0">
          <div className="font-semibold text-heading text-sm leading-tight truncate">
            {isAdmin ? (
              <Link to={`/users/${u.id}`} className="hover:text-primary transition-colors">
                {u.lastName} {u.firstName}
              </Link>
            ) : (
              `${u.lastName} ${u.firstName}`
            )}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {u.roles
              .filter((r) => r !== "client")
              .map((r) => (
                <span
                  key={r}
                  className={`px-1.5 py-0.5 rounded-md text-xs font-medium ${ROLE_BADGE_COLORS[r] ?? "bg-muted text-body"}`}
                >
                  {ROLE_LABELS[r] || r}
                </span>
              ))}
            {u.roles.includes("accountant") && u.accountantType && (
              <span
                className="px-1.5 py-0.5 rounded-md text-xs font-medium bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30"
                title="Тип бухгалтера"
              >
                {ACCOUNTANT_TYPE_LABELS[u.accountantType]}
              </span>
            )}
            {!u.isActive && (
              <span className="px-1.5 py-0.5 rounded-md text-xs font-medium bg-muted text-subtle">
                Неактивен
              </span>
            )}
          </div>
        </div>

        {/* Online status — mobile: top-right, desktop: own column later */}
        {u.isActive && (
          <div className="flex items-center gap-1.5 shrink-0 lg:hidden">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${online ? "bg-emerald-500" : "bg-slate-300"}`}
            />
            <span
              className={`text-xs font-medium ${online ? "text-emerald-600 dark:text-emerald-300" : "text-subtle"}`}
            >
              {formatLastSeen(u.lastSeenAt)}
            </span>
          </div>
        )}
      </div>

      {/* Sections */}
      <div className="flex-1 min-w-0 flex flex-wrap gap-1.5">
        {u.sections && u.sections.length > 0 ? (
          u.sections.map((s) => (
            <span
              key={s.id}
              className="flex items-center gap-1 bg-canvas border border-line text-subtle px-2 py-0.5 rounded-lg text-xs font-medium whitespace-nowrap"
              title={s.name ? `${s.name} (№${s.number})` : `Участок №${s.number}`}
            >
              <SectionIcon section={s} size={12} className="shrink-0" />№{s.number}
            </span>
          ))
        ) : (
          <span className="text-subtle text-xs">—</span>
        )}
      </div>

      {/* Compensation */}
      {canManageCompensation && (
        <div className="flex lg:flex-col items-baseline lg:items-end gap-2 lg:gap-0 w-full lg:w-24 shrink-0 text-xs leading-tight border-t lg:border-t-0 border-line pt-2 lg:pt-0">
          <span className="text-subtle lg:hidden">Оплата:</span>
          <span
            className={`font-semibold ${u.salary != null ? "text-body" : "text-subtle"}`}
            title="Зарплата"
          >
            {formatMoney(u.salary)} ₽
          </span>
          <span className="text-subtle" title="Налог">
            +{formatMoney(u.tax)} ₽
          </span>
        </div>
      )}

      {/* KPI stats — mobile: 3-col grid with labels, desktop: inline */}
      <div className="grid grid-cols-3 lg:flex lg:items-center gap-2 lg:gap-2 shrink-0 w-full lg:w-auto">
        <KpiCell
          value={w?.openTasks ?? "—"}
          icon={ListTodo}
          label="Активные"
          valueClass={w != null ? openTasksClass : "text-subtle"}
          title="Активные задачи"
        />
        <div className="hidden lg:block w-px h-6 bg-muted" />
        <KpiCell
          value={w?.overdueTasks ?? "—"}
          icon={AlertCircle}
          label="Просрочено"
          valueClass={w != null ? overdueClass : "text-subtle"}
          title="Просроченные задачи"
        />
        <div className="hidden lg:block w-px h-6 bg-muted" />
        <KpiCell
          value={w?.doneLast30d ?? "—"}
          icon={CheckCircle2}
          label="За 30д"
          valueClass={w != null ? "text-body" : "text-subtle"}
          title="Выполнено за 30 дней"
        />
        <div className="hidden lg:block w-px h-6 bg-muted" />
        <KpiCell
          value={w?.avgCompletionDays != null ? `${w.avgCompletionDays}д` : "—"}
          icon={Clock}
          label="Ср. время"
          valueClass={w?.avgCompletionDays != null ? "text-body" : "text-subtle"}
          title="Среднее время выполнения"
        />
        <div className="hidden lg:block w-px h-6 bg-muted" />
        <KpiCell
          value={w?.avgCompleteness != null ? `${w.avgCompleteness}%` : "—"}
          icon={Layers}
          label="Заполнен."
          valueClass={completenessClass}
          title="Средняя заполненность карточек организаций"
        />
        <div className="hidden lg:block w-px h-6 bg-muted" />
        <KpiCell
          value={reportingPct != null ? `${reportingPct}%` : "—"}
          icon={FileSpreadsheet}
          label="Отчётность"
          valueClass={reportingClass}
          title={
            w?.reportingProgress
              ? `${w.reportingProgress.submitted} из ${w.reportingProgress.total} отчётов сдано за прошедшие периоды`
              : undefined
          }
        />
      </div>

      {/* Online status — desktop column */}
      <div className="hidden lg:flex w-28 shrink-0 items-center gap-1.5">
        {u.isActive && (
          <>
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${online ? "bg-emerald-500" : "bg-slate-300"}`}
            />
            <span
              className={`text-xs font-medium truncate ${online ? "text-emerald-600 dark:text-emerald-300" : "text-subtle"}`}
            >
              {formatLastSeen(u.lastSeenAt)}
            </span>
          </>
        )}
      </div>

      {/* Actions — mobile: always visible at bottom, desktop: hover-revealed */}
      {(isAdmin || canManageCompensation) && (
        <div className="flex items-center justify-end gap-1 shrink-0 border-t lg:border-t-0 border-line pt-2 lg:pt-0 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-150">
          {canManageCompensation && (
            <button
              onClick={onComp}
              className="p-2 lg:p-1.5 text-subtle hover:text-emerald-600 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/15 rounded-lg transition-colors"
              title="Зарплата и налог"
              aria-label="Зарплата и налог"
            >
              <Wallet size={15} />
            </button>
          )}
          {isAdmin && (
            <button
              onClick={onEdit}
              className="p-2 lg:p-1.5 text-subtle hover:text-primary hover:bg-primary/8 rounded-lg transition-colors"
              title="Редактировать"
              aria-label="Редактировать"
            >
              <Pencil size={15} />
            </button>
          )}
          {isAdmin && canDelete && (
            <button
              onClick={onDelete}
              className="p-2 lg:p-1.5 text-subtle hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 rounded-lg transition-colors"
              title={u.isActive ? "Деактивировать" : "Удалить навсегда"}
              aria-label={u.isActive ? "Деактивировать" : "Удалить навсегда"}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CompensationModal({ user: target, onClose, onSaved }) {
  const [salary, setSalary] = useState(target.salary != null ? String(target.salary) : "");
  const [tax, setTax] = useState(target.tax != null ? String(target.tax) : "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function parseInput(v) {
    const s = v.trim().replace(/\s+/g, "").replace(",", ".");
    if (s === "") return null;
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) return "invalid";
    return n;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const s = parseInput(salary);
    const t = parseInput(tax);
    if (s === "invalid" || t === "invalid") {
      setError("Суммы должны быть неотрицательными числами");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api(`/api/users/${target.id}/compensation`, {
        method: "PATCH",
        body: JSON.stringify({ salary: s, tax: t }),
      });
      if (res.ok) {
        onSaved();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Ошибка сохранения");
      }
    } catch {
      setError("Сетевая ошибка");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-heading">Зарплата и налог</h2>
            <p className="text-sm text-subtle mt-0.5">
              {target.lastName} {target.firstName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-body mb-1">Зарплата, ₽</label>
            <input
              type="text"
              inputMode="decimal"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-1">Налог, ₽</label>
            <input
              type="text"
              inputMode="decimal"
              value={tax}
              onChange={(e) => setTax(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          {error && (
            <div className="text-sm text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-500/15 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-1">
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
      </div>
    </div>
  );
}

function CreateStaffModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    lastName: "",
    firstName: "",
    email: "",
    password: "",
    role: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.lastName || !form.firstName || !form.email || !form.password) {
      setError("Заполните все обязательные поля");
      return;
    }
    if (form.password.length < 8) {
      setError("Пароль должен быть не менее 8 символов");
      return;
    }
    if (!form.role) {
      setError("Выберите роль");
      return;
    }

    setSubmitting(true);
    try {
      const { role, ...rest } = form;
      const res = await api("/api/auth/staff", {
        method: "POST",
        body: JSON.stringify({ ...rest, roleNames: [role] }),
      });
      if (res.ok) {
        onCreated();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Ошибка создания сотрудника");
      }
    } catch {
      setError("Сетевая ошибка");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-heading">Новый сотрудник</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors"
          >
            <X size={20} />
          </button>
        </div>

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
            <label className="block text-sm font-medium text-body mb-1">Пароль *</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setField("password", e.target.value)}
              className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="Минимум 8 символов"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-2">Роль *</label>
            <div className="flex flex-wrap gap-3">
              {ASSIGNABLE_ROLES.map((r) => (
                <label key={r} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="role"
                    checked={form.role === r}
                    onChange={() => setField("role", r)}
                    className="w-4 h-4 border-line text-primary focus:ring-primary/30"
                  />
                  <span className="text-sm text-body">{ROLE_LABELS[r]}</span>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-500/15 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

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
              Создать
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditStaffModal({ user: target, currentUserId, onClose, onUpdated }) {
  const targetIsAdmin = target.roles.includes("admin");
  const isSelf = target.id === currentUserId;
  const rolesDisabled = targetIsAdmin;

  const currentRole = target.roles.find((r) => ASSIGNABLE_ROLES.includes(r)) || "";

  const [form, setForm] = useState({
    lastName: target.lastName,
    firstName: target.firstName,
    email: target.email,
    role: currentRole,
    isActive: target.isActive,
    accountantType: target.accountantType ?? "",
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
      const res = await api(`/api/users/${target.id}/password`, {
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

    if (!rolesDisabled) {
      body.roleNames = [form.role];
      body.isActive = form.isActive;
    }

    if (form.role === "accountant") {
      body.accountantType = form.accountantType || null;
    } else if (currentRole === "accountant" && form.role !== "accountant") {
      // Cleared when role changes away from accountant
      body.accountantType = null;
    }

    setSubmitting(true);
    try {
      const res = await api(`/api/users/${target.id}`, {
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
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-heading">Редактировать сотрудника</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors"
          >
            <X size={20} />
          </button>
        </div>

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
          {form.role === "accountant" && (
            <div>
              <label className="block text-sm font-medium text-body mb-2">Тип бухгалтера</label>
              <div className="flex flex-wrap gap-3">
                {Object.entries(ACCOUNTANT_TYPE_LABELS).map(([code, label]) => (
                  <label key={code} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="accountantType"
                      checked={form.accountantType === code}
                      onChange={() => setField("accountantType", code)}
                      className="w-4 h-4 border-line text-primary focus:ring-primary/30"
                    />
                    <span className="text-sm text-body">{label}</span>
                  </label>
                ))}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="accountantType"
                    checked={!form.accountantType}
                    onChange={() => setField("accountantType", "")}
                    className="w-4 h-4 border-line text-primary focus:ring-primary/30"
                  />
                  <span className="text-sm text-subtle">Не задан</span>
                </label>
              </div>
            </div>
          )}
          <div>
            <label
              className={`flex items-center gap-2 ${rolesDisabled || isSelf ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setField("isActive", e.target.checked)}
                disabled={rolesDisabled || isSelf}
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
      </div>
    </div>
  );
}
