import { useState, useEffect, useRef } from "react";
import { Link } from "react-router";
import { api } from "../lib/api.js";
import Modal from "./ui/Modal.jsx";
import {
  Send,
  CalendarDays,
  AlertTriangle,
  User as UserIcon,
  Loader2,
  ExternalLink,
} from "lucide-react";

const STATUS_LABELS = {
  OPEN: "Открыта",
  IN_PROGRESS: "В работе",
  DONE: "Выполнена",
  CANCELLED: "Отменена",
};

const STATUS_COLORS = {
  OPEN: "bg-muted text-body border-line",
  IN_PROGRESS:
    "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-300/40",
  DONE: "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300 border-green-300/40",
  CANCELLED: "bg-muted text-subtle border-line",
};

const PRIORITY_LABELS = {
  LOW: "Низкий",
  MEDIUM: "Средний",
  HIGH: "Высокий",
  URGENT: "Срочно",
};

const PRIORITY_COLORS = {
  LOW: "bg-muted text-subtle",
  MEDIUM: "bg-yellow-100 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  HIGH: "bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300",
  URGENT: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
};

const CATEGORY_LABELS = {
  REPORTING: "Отчётность",
  DOCUMENTS: "Документы",
  PAYMENT: "Оплата",
  OTHER: "Прочее",
};

function isOverdue(task) {
  if (!task.dueDate || task.status === "DONE" || task.status === "CANCELLED") return false;
  return new Date(task.dueDate) < new Date();
}

function formatDate(iso) {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDueDate(iso) {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

const QUICK_STATUSES = ["OPEN", "IN_PROGRESS", "DONE"];

export default function TaskCommentsModal({ task: initialTask, onClose, onUpdated }) {
  const [task, setTask] = useState(initialTask);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    api(`/api/tasks/${task.id}/comments`)
      .then((r) => r.json())
      .then((data) => {
        setComments(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [task.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  async function handleSend(e) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const res = await api(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const comment = await res.json();
        setComments((c) => [...c, comment]);
        setText("");
      }
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  }

  async function handleStatusChange(nextStatus) {
    if (nextStatus === task.status || statusSaving) return;
    setStatusSaving(true);
    try {
      const res = await api(`/api/tasks/${task.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTask((t) => ({ ...t, ...updated }));
        onUpdated?.();
      }
    } finally {
      setStatusSaving(false);
    }
  }

  const overdue = isOverdue(task);
  const assignees = task.assignees || [];

  return (
    <Modal
      onClose={onClose}
      size="xl"
      sheet
      bodyClassName="p-0"
      title={
        <div className="min-w-0 flex-1">
          <h2 className="text-base sm:text-lg font-bold text-heading leading-tight break-words">
            {task.title}
          </h2>
          {task.organization && (
            <p className="text-xs text-subtle mt-0.5 truncate">{task.organization.name}</p>
          )}
        </div>
      }
      footer={
        <form onSubmit={handleSend} className="flex-1 flex gap-2 items-end">
          <textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Написать комментарий…"
            className="flex-1 px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            aria-label="Отправить"
            className="shrink-0 p-2.5 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 transition-all disabled:opacity-40"
          >
            <Send size={15} />
          </button>
        </form>
      }
    >
      {/* Meta */}
      <div className="px-4 sm:px-6 py-3 border-b border-line space-y-3">
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_COLORS[task.status]}`}
          >
            {STATUS_LABELS[task.status] || task.status}
          </span>
          {task.priority && (
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${PRIORITY_COLORS[task.priority]}`}
            >
              {PRIORITY_LABELS[task.priority]}
            </span>
          )}
          {task.category && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary">
              {CATEGORY_LABELS[task.category] || task.category}
            </span>
          )}
          {task.dueDate && (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                overdue ? "bg-red-500/10 text-red-600 dark:text-red-300" : "bg-muted text-body"
              }`}
            >
              {overdue ? <AlertTriangle size={11} /> : <CalendarDays size={11} />}
              {formatDueDate(task.dueDate)}
              {overdue && " · просрочена"}
            </span>
          )}
        </div>

        {/* Description */}
        {task.description && (
          <p className="text-sm text-body whitespace-pre-wrap break-words">{task.description}</p>
        )}

        {/* Assignees */}
        {assignees.length > 0 && (
          <div className="flex items-start gap-2 text-xs">
            <UserIcon size={13} className="text-subtle mt-0.5 shrink-0" />
            <div className="flex flex-wrap gap-1.5">
              {assignees.map((a) => (
                <span
                  key={a.userId || a.user?.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-canvas border border-line text-body"
                >
                  <span className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[8px] font-bold">
                    {(a.user?.lastName?.[0] || "").toUpperCase()}
                    {(a.user?.firstName?.[0] || "").toUpperCase()}
                  </span>
                  {a.user?.lastName} {a.user?.firstName}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Quick status change */}
        <div>
          <div className="text-[10px] font-semibold text-subtle uppercase tracking-wider mb-1.5">
            Изменить статус
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_STATUSES.map((s) => {
              const active = task.status === s;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={statusSaving || active}
                  onClick={() => handleStatusChange(s)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                    active
                      ? `${STATUS_COLORS[s]} shadow-sm cursor-default`
                      : "border-line text-subtle hover:text-body hover:bg-canvas"
                  } ${statusSaving && !active ? "opacity-50" : ""}`}
                >
                  {statusSaving && active ? <Loader2 size={11} className="animate-spin" /> : null}
                  {STATUS_LABELS[s]}
                </button>
              );
            })}
            <Link
              to="/tasks"
              className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
              title="Открыть на странице задач для подробного редактирования"
            >
              <ExternalLink size={11} />
              Подробнее
            </Link>
          </div>
        </div>
      </div>

      {/* Comments */}
      <div className="px-4 sm:px-6 py-4 space-y-4">
        <div className="text-[10px] font-semibold text-subtle uppercase tracking-wider">
          Комментарии {comments.length > 0 && `(${comments.length})`}
        </div>
        {loading ? (
          <p className="text-sm text-subtle">Загрузка...</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-subtle">Пока нет комментариев. Напишите первый.</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0 mt-0.5">
                {(c.author.firstName[0] || "").toUpperCase()}
                {(c.author.lastName[0] || "").toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-body">
                    {c.author.lastName} {c.author.firstName}
                  </span>
                  <span className="text-[10px] text-subtle">{formatDate(c.createdAt)}</span>
                </div>
                <p className="text-sm text-body mt-0.5 whitespace-pre-wrap break-words">{c.text}</p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </Modal>
  );
}
