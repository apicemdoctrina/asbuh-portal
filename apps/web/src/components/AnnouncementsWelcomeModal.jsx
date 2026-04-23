import { X, Megaphone } from "lucide-react";
import { api } from "../lib/api.js";

const TYPE_META = {
  FEATURE: { label: "Новое", color: "bg-emerald-100 text-emerald-700" },
  FIX: { label: "Исправление", color: "bg-blue-100 text-blue-700" },
  CHANGE: { label: "Изменение", color: "bg-amber-100 text-amber-700" },
  REMOVAL: { label: "Удалено", color: "bg-red-100 text-red-700" },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#6567F1]/10 flex items-center justify-center">
              <Megaphone size={20} className="text-[#6567F1]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Что нового</h2>
              <p className="text-xs text-slate-500">
                {items.length === 1
                  ? "1 обновление с вашего последнего визита"
                  : `${items.length} обновления с вашего последнего визита`}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {items.map((item) => {
            const meta = TYPE_META[item.type] ?? TYPE_META.FEATURE;
            return (
              <div key={item.id} className="px-6 py-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.color}`}>
                    {meta.label}
                  </span>
                  <span className="text-xs text-slate-400">{formatDate(item.publishedAt)}</span>
                </div>
                <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                <div
                  className="tiptap-content text-sm text-slate-600 mt-1"
                  dangerouslySetInnerHTML={{ __html: item.body }}
                />
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
          <button
            onClick={handleClose}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white text-sm font-medium shadow-lg shadow-[#6567F1]/30 transition-all"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
}
