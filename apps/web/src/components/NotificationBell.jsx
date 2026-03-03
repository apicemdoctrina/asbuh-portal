import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { Bell } from "lucide-react";
import { useNotifications } from "../context/NotificationContext.jsx";

const ICON = { task_assigned: "📌", deadline_soon: "⏰" };

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return "только что";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  return `${Math.floor(diff / 86400)} д назад`;
}

export default function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleOpen() {
    setOpen((v) => !v);
  }

  async function handleMarkAllRead() {
    await markAllRead();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        aria-label="Уведомления"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-900">Уведомления</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-[#6567F1] hover:text-[#5557E1] font-medium transition-colors"
              >
                Прочитать все
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Нет уведомлений</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.readAt) markRead(n.id);
                    if (n.link) {
                      setOpen(false);
                      navigate(n.link);
                    }
                  }}
                  className={`w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 ${
                    !n.readAt ? "bg-[#6567F1]/[0.03]" : ""
                  } ${n.link ? "cursor-pointer" : ""}`}
                >
                  <span className="text-base mt-0.5 shrink-0">{ICON[n.type] ?? "🔔"}</span>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm leading-tight ${!n.readAt ? "font-semibold text-slate-900" : "text-slate-700"}`}
                    >
                      {n.title}
                    </p>
                    {n.body && <p className="text-xs text-slate-500 mt-0.5 truncate">{n.body}</p>}
                    <p className="text-xs text-slate-400 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.readAt && (
                    <span className="w-2 h-2 bg-[#6567F1] rounded-full mt-1.5 shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
