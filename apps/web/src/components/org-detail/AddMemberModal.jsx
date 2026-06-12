import { useState, useEffect } from "react";
import { api } from "../../lib/api.js";
import Modal from "../ui/Modal.jsx";

/** Adds an existing user as a member of the organization. */
export default function AddMemberModal({ orgId, existingMemberIds, onClose, onAdded }) {
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/users")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setAllUsers(data.filter((u) => !existingMemberIds.has(u.id))))
      .catch(() => {});
  }, []);

  async function handleAddMember(e) {
    e.preventDefault();
    if (!selectedUser) {
      setError("Выберите пользователя из списка");
      return;
    }
    setAdding(true);
    setError("");
    try {
      const res = await api(`/api/organizations/${orgId}/members`, {
        method: "POST",
        body: JSON.stringify({ email: selectedUser.email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add member");
      }
      onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Добавить участника" size="md">
      <form onSubmit={handleAddMember} className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-body mb-1">Пользователь *</label>
          <select
            value={selectedUser?.id || ""}
            onChange={(e) => setSelectedUser(allUsers.find((u) => u.id === e.target.value) || null)}
            autoFocus
            className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
          >
            <option value="">Выберите пользователя...</option>
            {allUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.lastName} {u.firstName} — {u.email}
              </option>
            ))}
          </select>
          {allUsers.length === 0 && (
            <p className="text-xs text-subtle mt-1">Загрузка пользователей...</p>
          )}
        </div>
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg text-sm">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border-2 border-primary/20 text-primary hover:bg-primary/5 rounded-lg text-sm font-medium transition-colors"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={adding || !selectedUser}
            className="px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50"
          >
            {adding ? "Добавление..." : "Добавить"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
