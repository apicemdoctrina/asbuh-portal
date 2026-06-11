import { useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../../lib/api.js";
import { useApi, jsonFetcher } from "../../hooks/useApi.js";
import Modal from "../ui/Modal.jsx";

export default function BulkModal({ mode, selectedIds, onClose, onSuccess }) {
  const [selectedUser, setSelectedUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const endpoint =
    mode === "remove" ? "/api/organizations/bulk/members" : "/api/organizations/bulk/non-members";
  const { data: allUsers, loading } = useApi(
    jsonFetcher(() =>
      api(endpoint, {
        method: "POST",
        body: JSON.stringify({ organizationIds: [...selectedIds] }),
      }),
    ),
    [],
  );

  async function handleSubmit() {
    if (!selectedUser) return;
    setSubmitting(true);
    setError("");
    try {
      const ep =
        mode === "assign" ? "/api/organizations/bulk/assign" : "/api/organizations/bulk/remove";
      const res = await api(ep, {
        method: "POST",
        body: JSON.stringify({ organizationIds: [...selectedIds], userId: selectedUser.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка");
      }
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const title = mode === "assign" ? "Назначить ответственного" : "Снять ответственного";
  const users = Array.isArray(allUsers) ? allUsers : [];

  return (
    <Modal
      onClose={onClose}
      title={title}
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 border-2 border-primary/20 text-primary hover:bg-primary/5 rounded-lg text-sm font-medium transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedUser || submitting}
            className="px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50"
          >
            {submitting ? "Выполнение..." : title}
          </button>
        </>
      }
    >
      <p className="text-sm text-subtle mb-1">
        Выбрано организаций: <span className="font-semibold text-body">{selectedIds.size}</span>
      </p>
      <p className="text-xs text-subtle mb-3">
        {mode === "remove"
          ? "Показаны только ответственные, закреплённые за выбранными организациями"
          : "Показаны только сотрудники, не закреплённые ни за одной из выбранных организаций"}
      </p>

      <div className="border border-line rounded-lg overflow-hidden h-52 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-subtle">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-subtle">
            Пользователи не найдены
          </div>
        ) : (
          users.map((u) => (
            <button
              key={u.id}
              onClick={() => setSelectedUser(u)}
              className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-b border-line last:border-0 ${
                selectedUser?.id === u.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-canvas text-body"
              }`}
            >
              <div className="font-medium">
                {u.lastName} {u.firstName} {u.middleName || ""}
              </div>
              <div className="text-xs text-subtle">{u.email}</div>
            </button>
          ))
        )}
      </div>

      {error && (
        <div className="mt-3 p-3 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg text-sm">
          {error}
        </div>
      )}
    </Modal>
  );
}
