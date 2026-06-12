import { useState } from "react";
import { useApi } from "../hooks/useApi.js";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import {
  Search,
  Plus,
  Loader2,
  Clock,
  CheckCircle2,
  AlertCircle,
  ListTodo,
  FileSpreadsheet,
  Layers,
} from "lucide-react";
import StaffCard from "../components/staff/StaffCard.jsx";
import CompensationModal from "../components/staff/CompensationModal.jsx";
import CreateStaffModal from "../components/staff/CreateStaffModal.jsx";
import EditStaffModal from "../components/staff/EditStaffModal.jsx";
import {
  isOnline,
  getPrimaryRole,
  ROLE_AVATAR_COLORS,
} from "../components/staff/staffConstants.js";

export default function StaffPage() {
  const { user, hasRole } = useAuth();
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [compUser, setCompUser] = useState(null);

  const isAdmin = hasRole("admin");
  const isSupervisor = hasRole("supervisor");
  const canManageCompensation = isAdmin || isSupervisor;

  const {
    data,
    loading,
    refetch: fetchUsers,
  } = useApi(
    async () => {
      const qs = new URLSearchParams({ excludeRole: "client" });
      if (search) qs.set("search", search);
      const [usersRes, analyticsRes] = await Promise.all([
        api(`/api/users?${qs}`),
        api("/api/management/analytics"),
      ]);
      if (!usersRes.ok || !analyticsRes.ok) throw new Error("HTTP error");
      const [users, analytics] = await Promise.all([usersRes.json(), analyticsRes.json()]);
      const map = {};
      for (const w of analytics.workload ?? []) map[w.userId] = w;
      return { users, workloadMap: map };
    },
    [search],
    { debounce: 300 },
  );
  const users = data?.users ?? [];
  const workloadMap = data?.workloadMap ?? {};

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
            const primaryRole = getPrimaryRole(u.roles);
            return (
              <StaffCard
                key={u.id}
                u={u}
                w={workloadMap[u.id]}
                online={isOnline(u.lastSeenAt)}
                avatarColor={ROLE_AVATAR_COLORS[primaryRole] ?? "bg-slate-400 text-white"}
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
