import { Link } from "react-router";
import { Loader2, Mail, Send } from "lucide-react";
import { STATUS_LABEL, formatTime, fullName } from "./supportHelpers.js";

export default function ThreadList({ threads, activeThreadId, isStaff, visibleOnMobile }) {
  return (
    <aside
      className={`bg-surface rounded-2xl shadow-sm border border-line overflow-hidden lg:flex flex-col h-[calc(100vh-180px)] sm:h-[calc(100vh-220px)] lg:h-[calc(100vh-220px)] ${
        visibleOnMobile ? "flex" : "hidden"
      }`}
    >
      <div className="p-3 border-b border-line text-xs font-medium text-subtle uppercase tracking-wide">
        {isStaff ? "Все обращения" : "Мои обращения"}
      </div>
      <div className="flex-1 overflow-y-auto">
        {threads === null ? (
          <div className="p-6 flex items-center justify-center text-subtle">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : threads.length === 0 ? (
          <div className="p-6 text-center text-sm text-subtle">
            {isStaff
              ? "Пока нет обращений"
              : "У вас пока нет обращений. Нажмите «Новое обращение»."}
          </div>
        ) : (
          <ul className="flex flex-col">
            {threads.map((t) => {
              const last = t.messages?.[0];
              const isActive = activeThreadId === t.id;
              const hasUnreadForUser = !isStaff && last && last.isStaff && !last.readAt;
              const hasUnreadForStaff = isStaff && last && !last.isStaff && !last.readAt;
              return (
                <li key={t.id}>
                  <Link
                    to={`/support/${t.id}`}
                    className={`block px-4 py-3 border-b border-line hover:bg-muted transition-colors ${
                      isActive ? "bg-primary/5 border-l-2 border-l-primary" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="text-sm font-medium text-heading truncate flex-1">
                        {t.subject}
                      </div>
                      <span
                        className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${STATUS_LABEL[t.status].cls}`}
                      >
                        {STATUS_LABEL[t.status].text}
                      </span>
                    </div>
                    {isStaff && (
                      <div className="text-xs text-subtle truncate mb-1">от {fullName(t.user)}</div>
                    )}
                    {last && (
                      <div className="text-xs text-subtle truncate flex items-center gap-1">
                        {(hasUnreadForUser || hasUnreadForStaff) && (
                          <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                        )}
                        <span className="truncate">{last.body}</span>
                      </div>
                    )}
                    <div className="text-[11px] text-subtle mt-1">
                      {formatTime(t.lastMessageAt)}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {!isStaff && (
        <div className="border-t border-line bg-canvas/60 p-3 flex flex-col gap-2">
          <div className="text-[11px] uppercase tracking-wide text-subtle font-medium">
            Не работает чат? Напишите напрямую
          </div>
          <a
            href="mailto:support@asbuh.com"
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-line bg-surface hover:border-primary/40 hover:text-primary transition-colors text-sm text-body group"
          >
            <Mail size={16} className="text-subtle group-hover:text-primary shrink-0" />
            <span className="truncate">support@asbuh.com</span>
          </a>
          <a
            href="https://t.me/apicem_doctrina"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-line bg-surface hover:border-primary/40 hover:text-primary transition-colors text-sm text-body group"
          >
            <Send size={16} className="text-subtle group-hover:text-primary shrink-0" />
            <span className="truncate">Telegram: @apicem_doctrina</span>
          </a>
        </div>
      )}
    </aside>
  );
}
