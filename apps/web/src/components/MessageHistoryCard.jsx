import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import {
  Mail,
  MessageCircle,
  Send,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const CHANNEL_ICON = { EMAIL: Mail, TELEGRAM: MessageCircle };
const STATUS_CONFIG = {
  sent: { icon: CheckCircle2, color: "text-green-500 dark:text-green-400", label: "Отправлено" },
  failed: { icon: XCircle, color: "text-red-500 dark:text-red-400", label: "Ошибка" },
  delivered: { icon: CheckCircle2, color: "text-blue-500 dark:text-blue-400", label: "Доставлено" },
};

export default function MessageHistoryCard({ orgId, onSendClick }) {
  const [messages, setMessages] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const limit = 10;

  useEffect(() => {
    loadMessages();
  }, [orgId, page]);

  async function loadMessages() {
    setLoading(true);
    try {
      const res = await api(`/api/messages/history/${orgId}?page=${page}&limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.data);
        setTotal(data.total);
      }
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.ceil(total / limit);

  function formatDate(d) {
    return new Date(d).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="bg-surface rounded-2xl shadow-lg border border-line">
      <div className="flex items-center justify-between p-5 border-b border-line">
        <h3 className="font-semibold text-heading">История сообщений</h3>
        {onSendClick && (
          <button
            onClick={onSendClick}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg text-sm font-medium transition-all shadow-sm"
          >
            <Send size={14} />
            Отправить
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-subtle">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : messages.length === 0 ? (
        <div className="p-8 text-center text-subtle text-sm">
          <Mail size={32} className="mx-auto mb-2 opacity-50" />
          Сообщений пока нет
        </div>
      ) : (
        <div className="divide-y divide-line">
          {messages.map((msg) => {
            const ChIcon = CHANNEL_ICON[msg.channel] || Mail;
            const st = STATUS_CONFIG[msg.status] || STATUS_CONFIG.sent;
            const StIcon = st.icon;
            return (
              <div key={msg.id} className="p-4 hover:bg-canvas/50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-1.5 bg-muted rounded-lg">
                    <ChIcon size={16} className="text-subtle" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-heading truncate">
                        {msg.recipient}
                      </span>
                      <StIcon size={14} className={st.color} title={st.label} />
                      {msg.template && (
                        <span className="text-xs bg-muted text-subtle px-2 py-0.5 rounded-full">
                          {msg.template.name}
                        </span>
                      )}
                    </div>
                    {msg.subject && <p className="text-sm text-body mt-0.5">{msg.subject}</p>}
                    <p className="text-sm text-subtle mt-1 line-clamp-2 whitespace-pre-line">
                      {msg.body}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-subtle">
                      <span>{formatDate(msg.createdAt)}</span>
                      <span>
                        {msg.sentBy.firstName} {msg.sentBy.lastName}
                      </span>
                    </div>
                    {msg.errorMessage && (
                      <div className="flex items-center gap-1 mt-1.5 text-xs text-red-500 dark:text-red-400">
                        <AlertCircle size={12} />
                        {msg.errorMessage}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-line">
          <span className="text-xs text-subtle">{total} сообщ.</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1 rounded text-subtle hover:text-body disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-subtle px-2">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1 rounded text-subtle hover:text-body disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
