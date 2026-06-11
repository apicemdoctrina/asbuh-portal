import { useState } from "react";
import { Pencil, Trash2, Building2 } from "lucide-react";
import { api } from "../../lib/api.js";
import Modal from "../ui/Modal.jsx";
import OrgAssignModal from "./OrgAssignModal.jsx";

export default function ManageGroupsModal({ groups, onClose, onChanged }) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [assigningGroup, setAssigningGroup] = useState(null);

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await api("/api/client-groups", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Ошибка");
      }
      setNewName("");
      setNewDesc("");
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(g) {
    setEditingId(g.id);
    setEditName(g.name);
    setEditDesc(g.description || "");
    setError("");
  }

  async function handleSaveEdit(id) {
    if (!editName.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await api(`/api/client-groups/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Ошибка");
      }
      setEditingId(null);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(g) {
    const orgCount = g._count?.organizations ?? 0;
    const msg =
      orgCount > 0
        ? `Удалить группу «${g.name}»? ${orgCount} организаций будут откреплены.`
        : `Удалить группу «${g.name}»?`;
    if (!confirm(msg)) return;
    setSaving(true);
    setError("");
    try {
      const res = await api(`/api/client-groups/${g.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Ошибка удаления");
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Modal
        onClose={onClose}
        size="lg"
        title="Группы клиентов"
        bodyClassName="px-6 py-4 space-y-2"
        footer={
          <div className="w-full">
            <p className="text-xs font-semibold text-subtle uppercase tracking-wide mb-3">
              Новая группа
            </p>
            {error && (
              <div className="mb-3 p-2 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg text-xs">
                {error}
              </div>
            )}
            <form onSubmit={handleCreate} className="flex flex-col gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Название *"
                required
                className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Описание (необязательно)"
                className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              <button
                type="submit"
                disabled={saving || !newName.trim()}
                className="self-end px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-md shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50"
              >
                {saving ? "Сохранение..." : "Создать группу"}
              </button>
            </form>
          </div>
        }
      >
        {groups.length === 0 && (
          <p className="text-sm text-subtle text-center py-4">Групп пока нет</p>
        )}
        {groups.map((g) =>
          editingId === g.id ? (
            <div key={g.id} className="border border-primary/30 rounded-xl p-3 bg-primary/5">
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Название"
                className="w-full px-3 py-1.5 border border-line rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              <input
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Описание (необязательно)"
                className="w-full px-3 py-1.5 border border-line rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleSaveEdit(g.id)}
                  disabled={saving || !editName.trim()}
                  className="px-3 py-1.5 bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white rounded-lg text-xs font-medium disabled:opacity-50"
                >
                  Сохранить
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="px-3 py-1.5 border border-line text-body hover:bg-canvas rounded-lg text-xs font-medium"
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <div
              key={g.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-line hover:border-line hover:bg-canvas transition-colors"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-heading truncate">{g.name}</div>
                {g.description && (
                  <div className="text-xs text-subtle truncate">{g.description}</div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setAssigningGroup(g)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-subtle hover:text-primary hover:bg-primary/10 border border-line hover:border-primary/30 transition-colors"
                  title="Управление организациями"
                >
                  <Building2 size={13} />
                  {g._count?.organizations != null ? g._count.organizations : ""}
                </button>
                <button
                  onClick={() => startEdit(g)}
                  className="p-1.5 rounded-lg text-subtle hover:text-primary hover:bg-primary/10 transition-colors"
                  title="Переименовать"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(g)}
                  className="p-1.5 rounded-lg text-subtle hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors"
                  title="Удалить"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ),
        )}
      </Modal>

      {assigningGroup && (
        <OrgAssignModal
          group={assigningGroup}
          onClose={() => setAssigningGroup(null)}
          onChanged={onChanged}
        />
      )}
    </>
  );
}
