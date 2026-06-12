import { useRef } from "react";
import { Link } from "react-router";
import {
  Loader2,
  CheckCircle2,
  Check,
  CheckCheck,
  ChevronLeft,
  Paperclip,
  Send,
} from "lucide-react";
import { STATUS_LABEL, formatTime, fullName } from "./supportHelpers.js";
import Avatar from "./Avatar.jsx";
import MessageAttachments from "./MessageAttachments.jsx";
import PendingAttachments from "./PendingAttachments.jsx";

export default function ThreadView({
  thread,
  loadingThread,
  isStaff,
  userId,
  onChangeStatus,
  body,
  onBodyChange,
  sending,
  uploadingCount,
  replyAttachments,
  onRemoveReplyAttachment,
  onSubmitReply,
  onFiles,
  onPaste,
  messagesEndRef,
}) {
  const fileInputRef = useRef(null);

  return (
    <>
      <header className="p-3 sm:p-4 border-b border-line flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <Link
            to="/support"
            className="lg:hidden shrink-0 -ml-1 p-1.5 rounded-lg text-subtle hover:text-primary hover:bg-primary/5 transition-colors"
            aria-label="К списку обращений"
          >
            <ChevronLeft size={20} />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-heading truncate flex-1 min-w-0">
                {thread.subject}
              </h2>
              <span
                className={`shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${STATUS_LABEL[thread.status].cls}`}
              >
                {STATUS_LABEL[thread.status].text}
              </span>
            </div>
            <div className="text-xs text-subtle mt-0.5 truncate">
              Открыто {formatTime(thread.createdAt)}
              {isStaff && ` · ${fullName(thread.user)}`}
            </div>
          </div>
        </div>
        {isStaff && thread.status !== "CLOSED" && (
          <div className="flex items-center gap-2 sm:shrink-0">
            {thread.status === "OPEN" && (
              <button
                onClick={() => onChangeStatus("RESOLVED")}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200/70 dark:hover:bg-emerald-500/25 transition-colors"
              >
                <CheckCircle2 size={14} />
                Решено
              </button>
            )}
            <button
              onClick={() => onChangeStatus("CLOSED")}
              className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-body hover:bg-line transition-colors"
            >
              Закрыть
            </button>
          </div>
        )}
        {isStaff && thread.status === "CLOSED" && (
          <button
            onClick={() => onChangeStatus("OPEN")}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-body hover:bg-line transition-colors sm:shrink-0"
          >
            Переоткрыть
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 flex flex-col gap-3 bg-canvas/50">
        {loadingThread && !thread.messages ? (
          <div className="flex items-center justify-center py-8 text-subtle">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : (
          (thread.messages || []).map((m) => {
            const mine = m.authorId === userId;
            return (
              <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : "flex-row"}`}>
                <Avatar user={m.author} size={32} />
                <div
                  className={`max-w-[78%] ${mine ? "items-end" : "items-start"} flex flex-col gap-0.5`}
                >
                  <div
                    className={`text-[11px] text-subtle flex items-center gap-1 ${mine ? "justify-end" : "justify-start"}`}
                  >
                    <span>{fullName(m.author)}</span>
                    {m.isStaff && <span className="text-primary font-medium">(поддержка)</span>}
                    <span>·</span>
                    <span>{formatTime(m.createdAt)}</span>
                    {mine && (
                      <span
                        className="inline-flex items-center"
                        title={m.readAt ? `Прочитано ${formatTime(m.readAt)}` : "Отправлено"}
                      >
                        {m.readAt ? (
                          <CheckCheck size={13} className="text-primary" />
                        ) : (
                          <Check size={13} />
                        )}
                      </span>
                    )}
                  </div>
                  {m.body && (
                    <div
                      className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                        mine
                          ? "bg-primary text-white rounded-tr-sm"
                          : "bg-surface border border-line rounded-tl-sm text-body"
                      }`}
                    >
                      {m.body}
                    </div>
                  )}
                  <MessageAttachments items={m.attachments} mine={mine} />
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {thread.status !== "CLOSED" ? (
        <form onSubmit={onSubmitReply} className="border-t border-line p-3 flex flex-col gap-2">
          <PendingAttachments items={replyAttachments} onRemove={onRemoveReplyAttachment} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 h-11 w-11 flex items-center justify-center rounded-lg text-subtle hover:text-primary hover:bg-primary/5 transition-colors"
              title="Прикрепить файл (или Ctrl+V для скрина)"
            >
              {uploadingCount > 0 ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Paperclip size={18} />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
              onChange={(e) => {
                onFiles(Array.from(e.target.files || []));
                e.target.value = "";
              }}
              className="hidden"
            />
            <textarea
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              onPaste={onPaste}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  onSubmitReply(e);
                }
              }}
              placeholder=""
              rows={1}
              maxLength={10_000}
              className="flex-1 h-11 px-3 py-2.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none leading-6"
            />
            <button
              type="submit"
              disabled={
                sending || uploadingCount > 0 || (!body.trim() && replyAttachments.length === 0)
              }
              className="shrink-0 h-11 w-11 flex items-center justify-center rounded-lg bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white shadow-lg shadow-[#6567F1]/30 hover:from-[#5557E1] hover:to-[#4547D1] disabled:opacity-50 transition-all"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </form>
      ) : (
        <div className="border-t border-line p-4 text-center text-sm text-subtle bg-muted">
          Тред закрыт. Если есть новые вопросы — создайте новое обращение.
        </div>
      )}
    </>
  );
}
