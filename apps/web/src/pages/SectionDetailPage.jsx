import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "react-router";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { ArrowLeft, Save, UserPlus, Trash2, Search } from "lucide-react";

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
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Add member state
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [memberRole, setMemberRole] = useState("accountant");
  const [addingMember, setAddingMember] = useState(false);
  const [memberError, setMemberError] = useState("");
  const [searchingUsers, setSearchingUsers] = useState(false);
  const searchTimeout = useRef(null);

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
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSection();
  }, [fetchSection]);

  // Debounced user search
  useEffect(() => {
    if (!showAddMember) return;
    if (memberSearch.length < 2) {
      setMemberResults([]);
      return;
    }
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setSearchingUsers(true);
      try {
        const res = await api(`/api/users?search=${encodeURIComponent(memberSearch)}`);
        if (res.ok) {
          const data = await res.json();
          // Filter out users already in section
          const existingIds = new Set(section?.members?.map((m) => m.user.id) || []);
          setMemberResults(data.filter((u) => !existingIds.has(u.id)));
        }
      } catch {
        // ignore
      } finally {
        setSearchingUsers(false);
      }
    }, 300);
    return () => clearTimeout(searchTimeout.current);
  }, [memberSearch, showAddMember, section]);

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
      setMemberResults([]);
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
    setMemberResults([]);
    setMemberError("");
    setMemberRole("accountant");
  }

  if (loading) return <div className="text-slate-400 text-sm">Загрузка...</div>;
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
        <h1 className="text-2xl font-bold text-slate-900 mb-4">Участок №{section.number}</h1>

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
              {/* User search */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Сотрудник *</label>
                {selectedUser ? (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#6567F1]/5 border border-[#6567F1]/20">
                    <div>
                      <span className="text-sm font-medium text-slate-900">
                        {selectedUser.lastName} {selectedUser.firstName}
                      </span>
                      <span className="text-sm text-slate-400 ml-2">{selectedUser.email}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUser(null);
                        setMemberSearch("");
                      }}
                      className="text-slate-400 hover:text-slate-600 text-xs"
                    >
                      Изменить
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Введите имя или email (мин. 2 символа)..."
                      autoFocus
                      className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                    />
                    {/* Search results dropdown */}
                    {memberSearch.length >= 2 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
                        {searchingUsers ? (
                          <div className="p-3 text-sm text-slate-400">Поиск...</div>
                        ) : memberResults.length === 0 ? (
                          <div className="p-3 text-sm text-slate-400">
                            Пользователи не найдены. Создайте сотрудника через API (POST
                            /api/auth/staff).
                          </div>
                        ) : (
                          memberResults.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => {
                                setSelectedUser(u);
                                setMemberSearch("");
                                setMemberResults([]);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
                            >
                              <span className="text-sm font-medium text-slate-900">
                                {u.lastName} {u.firstName}
                              </span>
                              <span className="text-sm text-slate-400 ml-2">{u.email}</span>
                              {u.roles?.length > 0 && (
                                <span className="ml-2 text-xs text-slate-400">
                                  ({u.roles.join(", ")})
                                </span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
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
