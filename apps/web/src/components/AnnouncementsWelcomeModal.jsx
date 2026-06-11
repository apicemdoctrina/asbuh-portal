import { Megaphone } from "lucide-react";
import { api } from "../lib/api.js";
import { sanitizeHtml } from "../lib/sanitize.js";
import Modal from "./ui/Modal.jsx";

const TYPE_META = {
  FEATURE: {
    label: "Новое",
    color: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  FIX: {
    label: "Исправление",
    color: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
  },
  CHANGE: {
    label: "Изменение",
    color: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  REMOVAL: {
    label: "Удалено",
    color: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
  },
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
}

export default function AnnouncementsWelcomeModal({ items, onClose }) {
  async function handleClose() {
    try {
      await api("/api/announcements/read-all", { method: "POST" });
    } catch {
      // silent
    }
    onClose();
  }

  if (!items.length) return null;

  return (
    <Modal
      onClose={handleClose}
      size="lg"
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Megaphone size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-heading">Что нового</h2>
            <p className="text-xs text-subtle">
              {items.length === 1
                ? "1 обновление с вашего последнего визита"
                : `${items.length} обновления с вашего последнего визита`}
            </p>
          </div>
        </div>
      }
      bodyClassName="divide-y divide-line"
      footer={
        <button
          onClick={handleClose}
          className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white text-sm font-medium shadow-lg shadow-[#6567F1]/30 transition-all"
        >
          Понятно
        </button>
      }
    >
      {items.map((item) => {
        const meta = TYPE_META[item.type] ?? TYPE_META.FEATURE;
        return (
          <div key={item.id} className="px-6 py-4">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.color}`}>
                {meta.label}
              </span>
              <span className="text-xs text-subtle">{formatDate(item.publishedAt)}</span>
            </div>
            <p className="text-sm font-semibold text-heading">{item.title}</p>
            <div
              className="tiptap-content text-sm text-body mt-1"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.body) }}
            />
          </div>
        );
      })}
    </Modal>
  );
}
