import { useState } from "react";
import { api } from "../../lib/api.js";
import Modal from "../ui/Modal.jsx";

/** Permanent-delete confirmation for an organization. */
export default function DeleteOrgModal({ orgId, orgName, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await api(`/api/organizations/${orgId}/permanent`, { method: "DELETE" });
      if (res.ok) {
        onDeleted();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Ошибка удаления");
        onClose();
      }
    } catch {
      alert("Ошибка сети");
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal
      onClose={() => !deleting && onClose()}
      title="Удалить организацию?"
      size="sm"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-body hover:bg-muted rounded-lg transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {deleting ? "Удаление..." : "Удалить"}
          </button>
        </>
      }
    >
      <p className="text-sm text-body mb-1">
        Организация <span className="font-semibold">{orgName}</span> будет удалена безвозвратно
        вместе со всеми данными: документами, банковскими счетами, контактами и системными
        доступами.
      </p>
      <p className="text-sm text-red-600 dark:text-red-300 font-medium mb-5">
        Это действие нельзя отменить.
      </p>
    </Modal>
  );
}
