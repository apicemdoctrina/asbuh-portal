import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { ArrowLeft, Save, UserPlus, Trash2, Search, Loader2 } from "lucide-react";
import SectionIcon from "../components/SectionIcon.jsx";
import AnimalPicker from "../components/AnimalPicker.jsx";
import Modal from "../components/ui/Modal.jsx";

export default function SectionDetailPage() {
  const { id } = useParams();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("section", "edit");

  const [section, setSection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Edit state
  const [editNumber, setEditNumber] = useState("");
  const [editName, setEditName] = useState("");
  const [editAnimal, setEditAnimal] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Add member state
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [memberRole, setMemberRole] = useState("accountant");
  const [memberIsTemporary, setMemberIsTemporary] = useState(false);
  const [memberExpiresAt, setMemberExpiresAt] = useState("");
  const [memberReason, setMemberReason] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [memberError, setMemberError] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);

  const fetchSection = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api(`/api/sections/${id}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Участок не найден");
        throw new Error("Failed to load section");
      }
      const data = await res.json();
      setSection(data);
      setEditNumber(String(data.number));
      setEditName(data.name || "");
      setEditAnimal(data.animal || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSection();
  }, [fetchSection]);

  // Load all users when modal opens
  useEffect(() => {
    if (!showAddMember) return;
    setLoadingUsers(true);
    const existingIds = new Set(section?.members?.map((m) => m.user.id) || []);
    api("/api/users?limit=200")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) =>
        setAllUsers((Array.isArray(data) ? data : []).filter((u) => !existingIds.has(u.id))),
      )
      .catch(() => {})
      .finally(() => setLoadingUsers(false));
  }, [showAddMember, section]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await api(`/api/sections/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          number: Number(editNumber),
          name: editName || null,
          animal: editAnimal || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update");
      }
      const data = await res.json();
      setSection((prev) => ({ ...prev, ...data }));
      setSaveMsg("Сохранено");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (err) {
      setSaveMsg(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddMember(e) {
    e.preventDefault();
    if (!selectedUser) {
      setMemberError("Выберите пользователя из списка");
      return;
    }
    if (memberIsTemporary && !memberExpiresAt) {
      setMemberError("Укажите дату окончания временного доступа");
      return;
    }
    setAddingMember(true);
    setMemberError("");
    try {
      const body = { email: selectedUser.email, role: memberRole };
      if (memberIsTemporary) {
        body.expiresAt = new Date(memberExpiresAt).toISOString();
        if (memberReason.trim()) body.reason = memberReason.trim();
      }
      const res = await api(`/api/sections/${id}/members`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add member");
      }
      setMemberSearch("");
      setSelectedUser(null);
      setAllUsers([]);
      setMemberRole("accountant");
      setMemberIsTemporary(false);
      setMemberExpiresAt("");
      setMemberReason("");
      setShowAddMember(false);
      fetchSection();
    } catch (err) {
      setMemberError(err.message);
    } finally {
      setAddingMember(false);
    }
  }

  async function handleRemoveMember(userId) {
    if (!confirm("Удалить участника из участка?")) return;
    try {
      const res = await api(`/api/sections/${id}/members/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to remove member");
      }
      fetchSection();
    } catch (err) {
      alert(err.message);
    }
  }

  function openAddMember() {
    setShowAddMember(true);
    setMemberSearch("");
    setSelectedUser(null);
    setAllUsers([]);
    setMemberError("");
    setMemberRole("accountant");
    setMemberIsTemporary(false);
    setMemberExpiresAt("");
    setMemberReason("");
  }

  function formatExpiry(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU");
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-24 text-subtle">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  if (error)
    return (
      <div className="text-red-600 dark:text-red-300 text-sm">
        {error}{" "}
        <Link to="/sections" className="text-primary hover:underline">
          Назад
        </Link>
      </div>
    );
  if (!section) return null;

  return (
    <>
      <Link
        to="/sections"
        className="inline-flex items-center gap-1 text-sm text-subtle hover:text-primary mb-4"
      >
        <ArrowLeft size={16} /> Все участки
      </Link>

      <div className="bg-surface rounded-2xl shadow-lg border border-line p-6 mb-6">
        <h1 className="text-2xl font-bold text-heading mb-4 flex items-center gap-3">
          <SectionIcon section={section} size={22} className="text-primary" />
          Участок №{section.number}
          {section.name && (
            <span className="text-subtle font-normal text-lg">— {section.name}</span>
          )}
        </h1>

        {canEdit ? (
          <form onSubmit={handleSave} className="flex flex-col gap-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-body mb-1">Номер</label>
              <input
                type="number"
                required
                value={editNumber}
                onChange={(e) => setEditNumber(e.target.value)}
                className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-body mb-1">Название</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-body mb-2">Иконка</label>
              <AnimalPicker value={editAnimal} onChange={setEditAnimal} />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50"
              >
                <Save size={16} />
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
              {saveMsg && (
                <span
                  className={`text-sm ${saveMsg === "Сохранено" ? "text-green-600 dark:text-green-300" : "text-red-600 dark:text-red-300"}`}
                >
                  {saveMsg}
                </span>
              )}
            </div>
          </form>
        ) : (
          <div className="text-sm text-body">
            <p>
              <span className="font-medium">Название:</span> {section.name || "—"}
            </p>
          </div>
        )}
      </div>

      {/* Members */}
      <div className="bg-surface rounded-2xl shadow-lg border border-line p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-heading">Участники</h2>
          {canEdit && (
            <button
              onClick={openAddMember}
              className="inline-flex items-center gap-1 text-sm text-primary hover:text-[#5557E1] font-medium"
            >
              <UserPlus size={16} /> Добавить
            </button>
          )}
        </div>

        {section.members?.length === 0 ? (
          <p className="text-sm text-subtle">Нет участников</p>
        ) : (
          <div className="space-y-2">
            {section.members?.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between p-3 rounded-lg bg-canvas"
              >
                <div>
                  <span className="text-sm font-medium text-heading">
                    {m.user.lastName} {m.user.firstName}
                  </span>
                  <span className="text-sm text-subtle ml-2">{m.user.email}</span>
                  <span className="ml-2 bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-medium">
                    {m.role}
                  </span>
                  {m.expiresAt && (
                    <span
                      className="ml-2 bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full text-xs font-medium"
                      title={m.reason || "Временное назначение"}
                    >
                      до {formatExpiry(m.expiresAt)}
                    </span>
                  )}
                </div>
                {canEdit && (
                  <button
                    onClick={() => handleRemoveMember(m.user.id)}
                    className="text-subtle hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Organizations */}
      <div className="bg-surface rounded-2xl shadow-lg border border-line p-6">
        <h2 className="text-lg font-bold text-heading mb-4">Организации</h2>
        {section.organizations?.length === 0 ? (
          <p className="text-sm text-subtle">Нет привязанных организаций</p>
        ) : (
          <div className="space-y-2">
            {section.organizations?.map((org) => (
              <Link
                key={org.id}
                to={`/organizations/${org.id}`}
                className="flex items-center justify-between p-3 rounded-lg bg-canvas hover:bg-muted transition-colors"
              >
                <div>
                  <span className="text-sm font-medium text-heading">{org.name}</span>
                  {org.inn && <span className="text-sm text-subtle ml-2">ИНН: {org.inn}</span>}
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    org.status === "active"
                      ? "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300"
                      : org.status === "new"
                        ? "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300"
                        : "bg-muted text-subtle"
                  }`}
                >
                  {org.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Add Member Modal */}
      {showAddMember && (
        <Modal onClose={() => setShowAddMember(false)} title="Добавить участника" size="md">
          <form onSubmit={handleAddMember} className="flex flex-col gap-4">
            {/* User picker */}
            <div>
              <label className="block text-sm font-medium text-body mb-1">Сотрудник *</label>
              <div className="relative mb-1">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
                />
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Фильтр по имени или email..."
                  autoFocus
                  className="w-full pl-9 pr-4 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <div className="border border-line rounded-lg overflow-hidden h-48 overflow-y-auto">
                {loadingUsers ? (
                  <div className="flex items-center justify-center h-full text-subtle">
                    <Loader2 size={18} className="animate-spin" />
                  </div>
                ) : allUsers.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-sm text-subtle">
                    Все сотрудники уже добавлены
                  </div>
                ) : (
                  (() => {
                    const q = memberSearch.toLowerCase();
                    const filtered = allUsers.filter(
                      (u) =>
                        !q ||
                        `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
                        u.email.toLowerCase().includes(q),
                    );
                    return filtered.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-sm text-subtle">
                        Не найдено
                      </div>
                    ) : (
                      filtered.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setSelectedUser(selectedUser?.id === u.id ? null : u)}
                          className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-b border-line last:border-0 ${
                            selectedUser?.id === u.id
                              ? "bg-primary/10 text-primary font-medium"
                              : "hover:bg-canvas text-body"
                          }`}
                        >
                          <div className="font-medium">
                            {u.lastName} {u.firstName}
                          </div>
                          <div className="text-xs text-subtle">{u.email}</div>
                        </button>
                      ))
                    );
                  })()
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-body mb-1">Роль *</label>
              <select
                value={memberRole}
                onChange={(e) => setMemberRole(e.target.value)}
                className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              >
                <option value="accountant">Бухгалтер</option>
                <option value="auditor">Аудитор</option>
              </select>
            </div>

            <div className="border-t border-line pt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={memberIsTemporary}
                  onChange={(e) => setMemberIsTemporary(e.target.checked)}
                  className="w-4 h-4 rounded border-line text-primary focus:ring-primary/30"
                />
                <span className="text-sm font-medium text-body">Временное назначение</span>
              </label>
              {memberIsTemporary && (
                <div className="mt-3 space-y-3 pl-6">
                  <div>
                    <label className="block text-sm font-medium text-body mb-1">
                      Действует до *
                    </label>
                    <input
                      type="date"
                      value={memberExpiresAt}
                      onChange={(e) => setMemberExpiresAt(e.target.value)}
                      min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                      className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-body mb-1">Причина</label>
                    <input
                      type="text"
                      value={memberReason}
                      onChange={(e) => setMemberReason(e.target.value)}
                      placeholder="Замена, отпуск и т.д."
                      className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>
                </div>
              )}
            </div>

            {memberError && (
              <div className="p-3 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg text-sm">
                {memberError}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAddMember(false)}
                className="px-4 py-2 border-2 border-primary/20 text-primary hover:bg-primary/5 rounded-lg text-sm font-medium transition-colors"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={addingMember || !selectedUser}
                className="px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50"
              >
                {addingMember ? "Добавление..." : "Добавить"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
