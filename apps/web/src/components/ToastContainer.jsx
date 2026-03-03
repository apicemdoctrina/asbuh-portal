import { X } from "lucide-react";
import { useNotifications } from "../context/NotificationContext.jsx";

const ICON = {
  task_assigned: "📌",
  deadline_soon: "⏰",
};

export default function ToastContainer() {
  const { toasts, dismissToast } = useNotifications();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 w-80">
      {toasts.map((toast) => (
        <div
          key={toast.toastId}
          className="bg-white border border-slate-200 rounded-2xl shadow-xl px-4 py-3 flex items-start gap-3 animate-slide-in"
        >
          <span className="text-lg mt-0.5 shrink-0">{ICON[toast.type] ?? "🔔"}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 leading-tight">{toast.title}</p>
            {toast.body && <p className="text-xs text-slate-500 mt-0.5 truncate">{toast.body}</p>}
          </div>
          <button
            onClick={() => dismissToast(toast.toastId)}
            className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors mt-0.5"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
