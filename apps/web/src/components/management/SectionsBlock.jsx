import { useState } from "react";
import {
  Users,
  Plus,
  Pencil,
  Check,
  X as XIcon,
  UserPlus,
  Map,
  ChevronDown,
  ChevronUp,
  UserMinus,
  Loader2,
  Search,
} from "lucide-react";
import { api } from "../../lib/api.js";
import SectionIcon from "../SectionIcon.jsx";
import AnimalPicker from "../AnimalPicker.jsx";

const SECTION_ROLE_LABELS = {
  accountant: "Бухгалтер",
  auditor: "Аудитор",
  manager: "Менеджер",
  admin: "Администратор",
  supervisor: "Руководитель",
};

/** Sections list with inline edit, create form and expandable member management. */
export default function SectionsBlock({ sections, onRefresh }) {
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // inline edit state
  const [editingId, setEditingId] = useState(null);
  const [editNumber, setEditNumber] = useState("");
  const [editName, setEditName] = useState("");
  const [editAnimal, setEditAnimal] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // add member state
  const [addSearch, setAddSearch] = useState("");

  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");
  const [allUsers, setAllUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // create section state
  const [creating, setCreating] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newName, setNewName] = useState("");
  const [newAnimal, setNewAnimal] = useState("");
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState("");

  async function loadDetail(id) {
    setDetailLoading(true);
    const res = await api(`/api/sections/${id}`);
    if (res.ok) {
      const data = await res.json();
      setDetail(data);
      // Load users excluding already members
      setLoadingUsers(true);
      const existingIds = new Set(data.members?.map((m) => m.user.id) ?? []);
      api("/api/users?limit=200&excludeRole=client")
        .then((r) => (r.ok ? r.json() : []))
        .then((users) =>
          setAllUsers((Array.isArray(users) ? users : []).filter((u) => !existingIds.has(u.id))),
        )
        .catch(() => {})
        .finally(() => setLoadingUsers(false));
    }
    setDetailLoading(false);
  }

  function toggleExpand(id) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      setAllUsers([]);
    } else {
      setExpandedId(id);
      setDetail(null);
      setAllUsers([]);
      setAddSearch("");
      setSelectedUser(null);
      setAddError("");
      loadDetail(id);
    }
  }

  function startEdit(s) {
    setEditingId(s.id);
    setEditNumber(String(s.number));
    setEditName(s.name ?? "");
    setEditAnimal(s.animal ?? "");
  }

  async function saveEdit(id) {
    setEditSaving(true);
    try {
      const res = await api(`/api/sections/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          number: parseInt(editNumber),
          name: editName || null,
          animal: editAnimal || null,
        }),
      });
      if (res.ok) {
        setEditingId(null);
        onRefresh();
        if (expandedId === id) loadDetail(id);
      }
    } finally {
      setEditSaving(false);
    }
  }

  async function handleAddMember() {
    if (!selectedUser) return;
    setAddSaving(true);
    setAddError("");
    try {
      const res = await api(`/api/sections/${expandedId}/members`, {
        method: "POST",
        body: JSON.stringify({ email: selectedUser.email, role: "accountant" }),
      });
      if (res.ok) {
        setSelectedUser(null);
        setAddSearch("");
        onRefresh();
        loadDetail(expandedId);
      } else {
        const data = await res.json().catch(() => ({}));
        setAddError(data.error || "Ошибка");
      }
    } finally {
      setAddSaving(false);
    }
  }

  async function handleRemoveMember(userId) {
    const res = await api(`/api/sections/${expandedId}/members/${userId}`, { method: "DELETE" });
    if (res.ok) {
      onRefresh();
      loadDetail(expandedId);
    }
  }

  async function handleCreate() {
    if (!newNumber) return;
    setCreateSaving(true);
    setCreateError("");
    try {
      const res = await api("/api/sections", {
        method: "POST",
        body: JSON.stringify({
          number: parseInt(newNumber),
          name: newName || null,
          animal: newAnimal || null,
        }),
      });
      if (res.ok) {
        setCreating(false);
        setNewNumber("");
        setNewName("");
        setNewAnimal("");
        onRefresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setCreateError(data.error || "Ошибка");
      }
    } finally {
      setCreateSaving(false);
    }
  }

  return (
    <div className="bg-surface rounded-2xl shadow-lg border border-line overflow-hidden">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-line flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Map size={16} className="text-subtle shrink-0" />
          <h2 className="text-base font-semibold text-heading">Участки</h2>
          <span className="text-xs text-subtle bg-muted px-2 py-0.5 rounded-full">
            {sections.length}
          </span>
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-1.5 text-sm text-primary hover:bg-primary/5 px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors shrink-0"
        >
          <Plus size={14} />
          Добавить
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="px-4 sm:px-6 py-4 border-b border-line bg-canvas/50 flex flex-wrap items-end gap-3">
          <div className="w-20">
            <label className="block text-xs text-subtle mb-1">Номер *</label>
            <input
              type="number"
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
              className="w-full px-3 py-1.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="1"
              autoFocus
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-subtle mb-1">Название</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-1.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="Необязательно"
            />
          </div>
          <div>
            <label className="block text-xs text-subtle mb-1">Иконка</label>
            <AnimalPicker
              value={newAnimal}
              onChange={setNewAnimal}
              usedAnimals={sections.filter((s) => s.animal).map((s) => s.animal)}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreate}
              disabled={createSaving || !newNumber}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-[#5557E1] disabled:opacity-50 transition-colors"
            >
              {createSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Создать
            </button>
            <button
              onClick={() => {
                setCreating(false);
                setCreateError("");
              }}
              className="px-3 py-1.5 text-sm text-subtle hover:text-body transition-colors"
            >
              Отмена
            </button>
          </div>
          {createError && (
            <p className="w-full text-xs text-red-600 dark:text-red-300">{createError}</p>
          )}
        </div>
      )}

      {sections.length === 0 ? (
        <div className="px-6 py-8 text-center text-subtle text-sm">Нет участков</div>
      ) : (
        <div className="divide-y divide-line">
          {sections.map((s) => {
            const isExpanded = expandedId === s.id;
            const isEditing = editingId === s.id;

            return (
              <div key={s.id}>
                {/* Section row */}
                <div className="px-4 sm:px-6 py-3 sm:py-3.5 flex items-center gap-2 sm:gap-3 hover:bg-canvas/50 transition-colors">
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1 flex-wrap">
                      <input
                        type="number"
                        value={editNumber}
                        onChange={(e) => setEditNumber(e.target.value)}
                        className="w-16 px-2 py-1 border border-line rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        autoFocus
                      />
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 min-w-[140px] sm:w-48 sm:flex-none px-2 py-1 border border-line rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="Название"
                      />
                      <AnimalPicker
                        value={editAnimal}
                        onChange={setEditAnimal}
                        usedAnimals={sections
                          .filter((x) => x.animal && x.id !== s.id)
                          .map((x) => x.animal)}
                      />
                      <button
                        onClick={() => saveEdit(s.id)}
                        disabled={editSaving}
                        className="p-1.5 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/15 rounded-lg transition-colors"
                      >
                        {editSaving ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Check size={14} />
                        )}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1.5 text-subtle hover:text-body hover:bg-muted rounded-lg transition-colors"
                      >
                        <XIcon size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-3 gap-1">
                        <span className="text-sm font-semibold text-heading flex items-center gap-2 truncate">
                          <SectionIcon section={s} size={15} className="text-primary shrink-0" />
                          <span className="truncate">
                            №{s.number}
                            {s.name ? ` — ${s.name}` : ""}
                          </span>
                        </span>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="flex items-center gap-1 text-xs text-subtle">
                            <Users size={11} />
                            {s._count.members} чел.
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-subtle bg-muted px-2 py-0.5 rounded-full">
                            {s._count.organizations} орг.
                            {s.formCounts?.IP > 0 && (
                              <span className="text-sky-600 dark:text-sky-300 font-medium">
                                {s.formCounts.IP} ИП
                              </span>
                            )}
                            {s.formCounts?.OOO > 0 && (
                              <span className="text-primary font-medium">
                                {s.formCounts.OOO} ООО
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => startEdit(s)}
                        className="p-1.5 text-subtle hover:text-primary hover:bg-primary/5 rounded-lg transition-colors shrink-0"
                        title="Редактировать"
                        aria-label="Редактировать"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => toggleExpand(s.id)}
                        className="flex items-center gap-1 text-xs text-subtle hover:text-primary px-2 py-1.5 rounded-lg hover:bg-primary/5 transition-colors shrink-0"
                        aria-label={isExpanded ? "Свернуть" : "Состав"}
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        <span className="hidden sm:inline">
                          {isExpanded ? "Свернуть" : "Состав"}
                        </span>
                      </button>
                    </>
                  )}
                </div>

                {/* Expanded members panel */}
                {isExpanded && (
                  <div className="px-4 sm:px-6 pb-4 bg-canvas/40 border-t border-line">
                    {detailLoading ? (
                      <div className="flex items-center justify-center py-4 text-subtle">
                        <Loader2 size={16} className="animate-spin" />
                      </div>
                    ) : (
                      <>
                        {/* Members list */}
                        <div className="pt-3 space-y-1.5 mb-3">
                          {detail?.members?.length === 0 && (
                            <p className="text-xs text-subtle py-1">Нет сотрудников</p>
                          )}
                          {detail?.members?.map((m) => (
                            <div
                              key={m.id}
                              className="flex items-center justify-between gap-2 group"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                  <span className="text-[10px] font-bold text-primary">
                                    {(m.user.lastName?.[0] ?? "").toUpperCase()}
                                    {(m.user.firstName?.[0] ?? "").toUpperCase()}
                                  </span>
                                </div>
                                <span className="text-sm text-body truncate">
                                  {m.user.lastName} {m.user.firstName}
                                </span>
                                <span className="text-xs text-subtle shrink-0">
                                  {SECTION_ROLE_LABELS[m.role] ?? m.role}
                                </span>
                              </div>
                              <button
                                onClick={() => handleRemoveMember(m.user.id)}
                                className="flex items-center gap-1 px-2 py-1 text-xs text-subtle hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                title="Удалить с участка"
                              >
                                <UserMinus size={14} />
                                <span>Удалить</span>
                              </button>
                            </div>
                          ))}
                        </div>

                        {/* Add member form */}
                        <div className="pt-3 border-t border-line space-y-2">
                          <div className="relative">
                            <Search
                              size={13}
                              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle"
                            />
                            <input
                              type="text"
                              value={addSearch}
                              onChange={(e) => setAddSearch(e.target.value)}
                              placeholder="Поиск по имени..."
                              className="w-full pl-8 pr-3 py-1.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-surface"
                            />
                          </div>
                          <div className="border border-line rounded-lg overflow-hidden h-36 overflow-y-auto bg-surface">
                            {loadingUsers ? (
                              <div className="flex items-center justify-center h-full text-subtle">
                                <Loader2 size={16} className="animate-spin" />
                              </div>
                            ) : allUsers.length === 0 ? (
                              <div className="flex items-center justify-center h-full text-xs text-subtle">
                                Все сотрудники уже добавлены
                              </div>
                            ) : (
                              (() => {
                                const q = addSearch.toLowerCase();
                                const filtered = allUsers.filter(
                                  (u) =>
                                    !q ||
                                    `${u.lastName} ${u.firstName}`.toLowerCase().includes(q) ||
                                    u.email.toLowerCase().includes(q),
                                );
                                return filtered.length === 0 ? (
                                  <div className="flex items-center justify-center h-full text-xs text-subtle">
                                    Не найдено
                                  </div>
                                ) : (
                                  filtered.map((u) => (
                                    <button
                                      key={u.id}
                                      type="button"
                                      onClick={() =>
                                        setSelectedUser(selectedUser?.id === u.id ? null : u)
                                      }
                                      className={`w-full text-left px-3 py-2 text-sm transition-colors border-b border-line last:border-0 ${
                                        selectedUser?.id === u.id
                                          ? "bg-primary/10 text-primary font-medium"
                                          : "hover:bg-canvas text-body"
                                      }`}
                                    >
                                      <span className="font-medium">
                                        {u.lastName} {u.firstName}
                                      </span>
                                      <span className="block text-xs text-subtle">{u.email}</span>
                                    </button>
                                  ))
                                );
                              })()
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={handleAddMember}
                              disabled={addSaving || !selectedUser}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-[#5557E1] disabled:opacity-50 transition-colors"
                            >
                              {addSaving ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <UserPlus size={13} />
                              )}
                              Добавить
                            </button>
                          </div>
                          {addError && (
                            <p className="text-xs text-red-600 dark:text-red-300">{addError}</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
