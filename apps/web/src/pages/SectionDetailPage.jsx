import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { ArrowLeft, Save, UserPlus, Trash2, Search, Loader2 } from "lucide-react";
import SectionIcon from "../components/SectionIcon.jsx";
import AnimalPicker from "../components/AnimalPicker.jsx";

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
    setAddingMember(true);
    setMemberError("");
    try {
      const res = await api(`/api/sections/${id}/members`, {
        method: "POST",
        body: JSON.stringify({ email: selectedUser.email, role: memberRole }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add member");
      }
      setMemberSearch("");
      setSelectedUser(null);
      setAllUsers([]);
      setMemberRole("accountant");
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
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  if (error)
    return (
      <div className="text-red-600 text-sm">
        {error}{" "}
        <Link to="/sections" className="text-[#6567F1] hover:underline">
          Назад
        </Link>
      </div>
    );
  if (!section) return null;

  return (
    <>
      <Link
        to="/sections"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#6567F1] mb-4"
      >
        <ArrowLeft size={16} /> Все участки
      </Link>

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-3">
          <SectionIcon section={section} size={22} className="text-[#6567F1]" />
          Участок №{section.number}
          {section.name && (
            <span className="text-slate-400 font-normal text-lg">— {section.name}</span>
          )}
        </h1>

        {canEdit ? (
          <form onSubmit={handleSave} className="flex flex-col gap-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Номер</label>
              <input
                type="number"
                required
                value={editNumber}
                onChange={(e) => setEditNumber(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Название</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Иконка</label>
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
                  className={`text-sm ${saveMsg === "Сохранено" ? "text-green-600" : "text-red-600"}`}
                >
                  {saveMsg}
                </span>
              )}
            </div>
          </form>
        ) : (
          <div className="text-sm text-slate-600">
            <p>
              <span className="font-medium">Название:</span> {section.name || "—"}
            </p>
          </div>
        )}
      </div>

      {/* Members */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">Участники</h2>
          {canEdit && (
            <button
              onClick={openAddMember}
              className="inline-flex items-center gap-1 text-sm text-[#6567F1] hover:text-[#5557E1] font-medium"
            >
              <UserPlus size={16} /> Добавить
            </button>
          )}
        </div>

        {section.members?.length === 0 ? (
          <p className="text-sm text-slate-400">Нет участников</p>
        ) : (
          <div className="space-y-2">
            {section.members?.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-50"
              >
                <div>
                  <span className="text-sm font-medium text-slate-900">
                    {m.user.lastName} {m.user.firstName}
                  </span>
                  <span className="text-sm text-slate-400 ml-2">{m.user.email}</span>
                  <span className="ml-2 bg-[#6567F1]/10 text-[#6567F1] px-2 py-0.5 rounded-full text-xs font-medium">
                    {m.role}
                  </span>
                </div>
                {canEdit && (
                  <button
                    onClick={() => handleRemoveMember(m.user.id)}
                    className="text-slate-400 hover:text-red-500 transition-colors"
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
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Организации</h2>
        {section.organizations?.length === 0 ? (
          <p className="text-sm text-slate-400">Нет привязанных организаций</p>
        ) : (
          <div className="space-y-2">
            {section.organizations?.map((org) => (
              <Link
                key={org.id}
                to={`/organizations/${org.id}`}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <div>
                  <span className="text-sm font-medium text-slate-900">{org.name}</span>
                  {org.inn && <span className="text-sm text-slate-400 ml-2">ИНН: {org.inn}</span>}
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    org.status === "active"
                      ? "bg-green-100 text-green-700"
                      : org.status === "new"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-slate-100 text-slate-500"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Добавить участника</h2>
            <form onSubmit={handleAddMember} className="flex flex-col gap-4">
              {/* User picker */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Сотрудник *</label>
                <div className="relative mb-1">
                  <Search
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Фильтр по имени или email..."
                    autoFocus
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                  />
                </div>
                <div className="border border-slate-200 rounded-lg overflow-hidden h-48 overflow-y-auto">
                  {loadingUsers ? (
                    <div className="flex items-center justify-center h-full text-slate-400">
                      <Loader2 size={18} className="animate-spin" />
                    </div>
                  ) : allUsers.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-sm text-slate-400">
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
                        <div className="flex items-center justify-center h-full text-sm text-slate-400">
                          Не найдено
                        </div>
                      ) : (
                        filtered.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => setSelectedUser(selectedUser?.id === u.id ? null : u)}
                            className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-b border-slate-100 last:border-0 ${
                              selectedUser?.id === u.id
                                ? "bg-[#6567F1]/10 text-[#6567F1] font-medium"
                                : "hover:bg-slate-50 text-slate-700"
                            }`}
                          >
                            <div className="font-medium">
                              {u.lastName} {u.firstName}
                            </div>
                            <div className="text-xs text-slate-400">{u.email}</div>
                          </button>
                        ))
                      );
                    })()
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Роль *</label>
                <select
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                >
                  <option value="accountant">Бухгалтер</option>
                  <option value="auditor">Аудитор</option>
                </select>
              </div>
              {memberError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{memberError}</div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddMember(false)}
                  className="px-4 py-2 border-2 border-[#6567F1]/20 text-[#6567F1] hover:bg-[#6567F1]/5 rounded-lg text-sm font-medium transition-colors"
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
          </div>
        </div>
      )}
    </>
  );
}
