import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "react-router";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import { useApi } from "../hooks/useApi.js";
import {
  Loader2,
  Send,
  Paperclip,
  ArrowLeft,
  X,
  Download,
  FileText,
  Eye,
  EyeOff,
  Trash2,
  ChevronUp,
  SlidersHorizontal,
  Check,
  CheckCheck,
} from "lucide-react";

const STATUS_LABELS = {
  NEW: "Новый",
  IN_PROGRESS: "В работе",
  WAITING_CLIENT: "Ожидает клиента",
  ON_HOLD: "На паузе",
  ESCALATED: "Эскалация",
  CLOSED: "Закрыт",
  REOPENED: "Переоткрыт",
};
const STATUS_COLORS = {
  NEW: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
  IN_PROGRESS: "bg-yellow-100 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  WAITING_CLIENT: "bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300",
  ON_HOLD: "bg-muted text-body",
  ESCALATED: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
  CLOSED: "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300",
  REOPENED: "bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300",
};
const PRIORITY_LABELS = { LOW: "Низкий", NORMAL: "Обычный", HIGH: "Высокий", URGENT: "Срочный" };

export default function TicketDetailPage() {
  const { id } = useParams();
  const { user, hasRole, hasPermission } = useAuth();
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const [msgBody, setMsgBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);

  // Mobile: открыть панель управления (статус/приоритет/исполнитель) как bottom-sheet
  const [mobileManageOpen, setMobileManageOpen] = useState(false);

  const isStaff =
    hasRole("admin") || hasRole("supervisor") || hasRole("manager") || hasRole("accountant");
  const canEdit = hasPermission("ticket", "edit");
  const canDeleteMsg = hasRole("admin") || hasRole("supervisor") || hasRole("manager");

  const { data: staffData } = useApi(
    async () => {
      const res = await api("/api/users?limit=200");
      const data = await res.json();
      return Array.isArray(data) ? data : data.users || [];
    },
    [],
    { enabled: isStaff },
  );
  const staff = staffData ?? [];

  // Кого мы ждём в качестве «читателя» (для индикатора ✓✓ на наших сообщениях)
  const otherSideReadAt = isStaff ? ticket?.lastReadByClientAt : ticket?.lastReadByStaffAt;
  // id моего последнего НЕ-внутреннего сообщения (только на нём показываем индикатор)
  const myLastVisibleMessageId = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m.author?.id === user?.id && !m.isInternal && !m.deletedAt) return m.id;
    }
    return null;
  })();

  const fetchTicket = useCallback(
    async (cursorId) => {
      if (cursorId) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (cursorId) params.set("cursor", cursorId);
        params.set("limit", "50");
        const res = await api(`/api/tickets/${id}?${params}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setTicket(data.ticket);
        if (cursorId) {
          setMessages((prev) => [...data.messages, ...prev]);
        } else {
          setMessages(data.messages);
        }
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);
      } catch {
        setError("Не удалось загрузить тикет");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [id],
  );

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  // Отметить тикет прочитанным текущей стороной (после первой успешной загрузки)
  const markRead = useCallback(async () => {
    try {
      await api(`/api/tickets/${id}/read`, { method: "POST" });
    } catch {
      // не критично — индикатор просто не обновится
    }
  }, [id]);

  useEffect(() => {
    if (!loading && ticket) {
      markRead();
    }
  }, [loading, ticket, markRead]);

  const initialScrollDone = useRef(false);
  useEffect(() => {
    if (loading) return;
    // First load: оставляем пользователя у шапки тикета, не дёргаем страницу
    if (!initialScrollDone.current) {
      initialScrollDone.current = true;
      return;
    }
    // Последующие обновления (новое сообщение / отправили своё) — догоняем к низу
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, loading]);

  async function handleSend(e) {
    e.preventDefault();
    if (!msgBody.trim() && files.length === 0) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append("body", msgBody.trim() || " ");
      if (isInternal) formData.append("isInternal", "true");
      files.forEach((f) => formData.append("files", f));

      const res = await api(`/api/tickets/${id}/messages`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Ошибка отправки");
      }
      const msg = await res.json();
      setMessages((prev) => [...prev, msg]);
      setMsgBody("");
      setFiles([]);
      setIsInternal(false);
      // Своё сообщение → мы его «видели». Чтобы свежие индикаторы были корректны, маркаем read.
      markRead();
      // Refresh ticket for updated status / read timestamps
      const ticketRes = await api(`/api/tickets/${id}?limit=0`);
      if (ticketRes.ok) {
        const data = await ticketRes.json();
        setTicket(data.ticket);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSending(false);
    }
  }

  async function handleStatusChange(newStatus) {
    try {
      const res = await api(`/api/tickets/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setTicket((t) => ({ ...t, status: updated.status, closedAt: updated.closedAt }));
    } catch {
      alert("Не удалось обновить статус");
    }
  }

  async function handlePriorityChange(newPriority) {
    try {
      const res = await api(`/api/tickets/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ priority: newPriority }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setTicket((t) => ({ ...t, priority: updated.priority }));
    } catch {
      alert("Не удалось обновить приоритет");
    }
  }

  async function handleAssignChange(assignedToId) {
    try {
      const res = await api(`/api/tickets/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ assignedToId: assignedToId || null }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setTicket((t) => ({
        ...t,
        assignedToId: updated.assignedToId,
        assignedTo: updated.assignedTo,
      }));
    } catch {
      alert("Не удалось назначить");
    }
  }

  async function handleDeleteMessage(msgId) {
    if (!confirm("Удалить сообщение?")) return;
    try {
      const res = await api(`/api/tickets/${id}/messages/${msgId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, deletedAt: new Date().toISOString() } : m)),
      );
    } catch {
      alert("Не удалось удалить");
    }
  }

  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-16 text-subtle">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  if (error || !ticket)
    return (
      <div className="text-center py-16 text-red-500 dark:text-red-400">
        {error || "Тикет не найден"}
      </div>
    );

  const apiBase = import.meta.env.VITE_API_URL || "";

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
      {/* Main chat area */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-start gap-2 sm:gap-3 mb-3 sm:mb-4">
          <Link
            to="/tickets"
            className="p-2 -ml-1 mt-0.5 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors shrink-0"
            aria-label="Назад к списку тикетов"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-subtle font-mono tabular-nums">#{ticket.number}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[ticket.status]}`}
              >
                {STATUS_LABELS[ticket.status]}
              </span>
            </div>
            <h1 className="text-base sm:text-lg font-bold text-heading leading-snug break-words">
              {ticket.subject}
            </h1>
          </div>
          {/* Mobile: открыть управление (только для staff с правами) */}
          {isStaff && canEdit && (
            <button
              type="button"
              onClick={() => setMobileManageOpen(true)}
              className="lg:hidden p-2 -mr-1 mt-0.5 rounded-lg text-subtle hover:text-primary hover:bg-primary/5 transition-colors shrink-0"
              aria-label="Управление"
              title="Управление"
            >
              <SlidersHorizontal size={20} />
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="bg-surface sm:rounded-2xl sm:shadow-lg sm:border sm:border-line flex flex-col h-[calc(100dvh-13rem)] sm:h-[calc(100vh-280px)] -mx-3 sm:mx-0 border-y border-line sm:border-y">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {hasMore && (
              <button
                onClick={() => fetchTicket(nextCursor)}
                disabled={loadingMore}
                className="w-full text-center py-2 text-sm text-primary hover:bg-primary/5 rounded-lg transition-colors"
              >
                {loadingMore ? (
                  <Loader2 size={16} className="animate-spin mx-auto" />
                ) : (
                  <span className="flex items-center justify-center gap-1">
                    <ChevronUp size={14} /> Загрузить ранние сообщения
                  </span>
                )}
              </button>
            )}

            {messages.map((msg) => {
              const isOwn = msg.author?.id === user?.id;
              const isDeleted = !!msg.deletedAt;
              const showReceipt = isOwn && !msg.isInternal && msg.id === myLastVisibleMessageId;
              const seenByOther =
                showReceipt &&
                otherSideReadAt &&
                new Date(otherSideReadAt) > new Date(msg.createdAt);

              if (isDeleted) {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <span className="text-xs text-subtle italic">Сообщение удалено</span>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={`group flex ${isOwn ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                      msg.isInternal
                        ? "bg-yellow-50 dark:bg-yellow-500/15 border-2 border-dashed border-yellow-300 dark:border-yellow-500/30"
                        : isOwn
                          ? "bg-primary text-white"
                          : "bg-muted text-heading"
                    }`}
                  >
                    {msg.isInternal && (
                      <div className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-300 font-medium mb-1">
                        <EyeOff size={12} /> Внутренняя заметка
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs font-medium ${msg.isInternal ? "text-yellow-700 dark:text-yellow-300" : isOwn ? "text-white/80" : "text-subtle"}`}
                      >
                        {msg.author?.firstName} {msg.author?.lastName}
                      </span>
                      <span
                        className={`text-xs ${msg.isInternal ? "text-yellow-500 dark:text-yellow-400" : isOwn ? "text-white/60" : "text-subtle"}`}
                      >
                        {new Date(msg.createdAt).toLocaleString("ru", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {canDeleteMsg && (
                        <button
                          onClick={() => handleDeleteMessage(msg.id)}
                          className={`opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-black/10 transition-opacity ${isOwn ? "text-white/60" : "text-subtle"}`}
                          title="Удалить"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    <p
                      className={`text-sm whitespace-pre-wrap ${msg.isInternal ? "text-yellow-900 dark:text-yellow-300" : ""}`}
                    >
                      {msg.body}
                    </p>

                    {msg.attachments?.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {msg.attachments.map((att) => (
                          <a
                            key={att.id}
                            href={`${apiBase}/api/tickets/attachments/${att.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg transition-colors ${
                              isOwn
                                ? "bg-surface/20 hover:bg-surface/30 text-white"
                                : "bg-surface hover:bg-canvas text-body border border-line"
                            }`}
                          >
                            <FileText size={14} />
                            <span className="truncate flex-1">{att.fileName}</span>
                            <span className="text-[10px] opacity-70">
                              {(att.fileSize / 1024).toFixed(0)} KB
                            </span>
                            <Download size={12} />
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Read receipt — только на последнем своём сообщении */}
                    {showReceipt && (
                      <div
                        className={`flex items-center justify-end gap-1 mt-1.5 text-[11px] ${isOwn ? "text-white/70" : "text-subtle"}`}
                      >
                        {seenByOther ? (
                          <>
                            <CheckCheck size={13} />
                            <span>Прочитано</span>
                          </>
                        ) : (
                          <>
                            <Check size={13} />
                            <span>Отправлено</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          {ticket.status !== "CLOSED" && (
            <form onSubmit={handleSend} className="border-t border-line p-4">
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {files.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1 bg-muted rounded-lg px-2 py-1 text-xs text-body"
                    >
                      <FileText size={12} />
                      <span className="truncate max-w-[120px]">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="text-subtle hover:text-red-500 dark:hover:text-red-400"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-1.5 sm:gap-2">
                {isStaff && (
                  <button
                    type="button"
                    onClick={() => setIsInternal(!isInternal)}
                    className={`p-2.5 sm:p-2 rounded-lg transition-colors shrink-0 ${isInternal ? "bg-yellow-100 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300" : "text-subtle hover:text-body hover:bg-muted"}`}
                    title={
                      isInternal
                        ? "Внутренняя заметка (видна только сотрудникам)"
                        : "Обычное сообщение"
                    }
                    aria-label={isInternal ? "Внутренняя заметка" : "Обычное сообщение"}
                  >
                    {isInternal ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 sm:p-2 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors shrink-0"
                  title="Прикрепить файл"
                  aria-label="Прикрепить файл"
                >
                  <Paperclip size={18} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip"
                  className="hidden"
                  onChange={(e) => {
                    const newFiles = Array.from(e.target.files || []);
                    setFiles((prev) => [...prev, ...newFiles].slice(0, 5));
                    e.target.value = "";
                  }}
                />
                <textarea
                  rows={1}
                  value={msgBody}
                  onChange={(e) => setMsgBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(e);
                    }
                  }}
                  placeholder={isInternal ? "Внутренняя заметка..." : "Введите сообщение..."}
                  className={`flex-1 min-w-0 px-3 py-2.5 sm:py-2 border rounded-lg text-base sm:text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary ${
                    isInternal
                      ? "border-yellow-300 dark:border-yellow-500/30 bg-yellow-50 dark:bg-yellow-500/15"
                      : "border-line"
                  }`}
                />
                <button
                  type="submit"
                  disabled={sending || (!msgBody.trim() && files.length === 0)}
                  className="p-2.5 sm:p-2 rounded-lg bg-primary text-white hover:bg-[#5557E1] disabled:opacity-50 transition-colors shrink-0"
                  aria-label="Отправить"
                >
                  {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </div>
              {isInternal && (
                <p className="text-xs text-yellow-600 dark:text-yellow-300 mt-1">
                  Это внутренняя заметка — клиент её не увидит
                </p>
              )}
            </form>
          )}
        </div>
      </div>

      {/* Desktop sidebar (staff only) */}
      {isStaff && (
        <div className="hidden lg:flex w-72 flex-col gap-4">
          <div className="bg-surface rounded-2xl shadow-lg border border-line p-4 space-y-4">
            <h3 className="text-sm font-bold text-heading">Информация</h3>
            <div>
              <label className="text-xs text-subtle">Организация</label>
              <Link
                to={`/organizations/${ticket.organization?.id}`}
                className="block text-sm text-primary hover:underline"
              >
                {ticket.organization?.name}
              </Link>
            </div>
            <div>
              <label className="text-xs text-subtle">Автор</label>
              <p className="text-sm text-heading">
                {ticket.createdBy?.firstName} {ticket.createdBy?.lastName}
              </p>
            </div>
            <div>
              <label className="text-xs text-subtle">Создан</label>
              <p className="text-sm text-heading">
                {new Date(ticket.createdAt).toLocaleString("ru")}
              </p>
            </div>
          </div>

          {canEdit && (
            <div className="bg-surface rounded-2xl shadow-lg border border-line p-4 space-y-4">
              <h3 className="text-sm font-bold text-heading">Управление</h3>
              <div>
                <label className="text-xs text-subtle mb-1 block">Статус</label>
                <select
                  value={ticket.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="w-full px-2 py-1.5 border border-line rounded-lg text-sm bg-surface"
                >
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-subtle mb-1 block">Приоритет</label>
                <select
                  value={ticket.priority}
                  onChange={(e) => handlePriorityChange(e.target.value)}
                  className="w-full px-2 py-1.5 border border-line rounded-lg text-sm bg-surface"
                >
                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-subtle mb-1 block">Назначен</label>
                <select
                  value={ticket.assignedToId || ""}
                  onChange={(e) => handleAssignChange(e.target.value)}
                  className="w-full px-2 py-1.5 border border-line rounded-lg text-sm bg-surface"
                >
                  <option value="">Не назначен</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mobile: bottom-sheet с управлением */}
      {isStaff && mobileManageOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={() => setMobileManageOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-surface w-full max-h-[88vh] rounded-t-3xl shadow-2xl border-x border-t border-line flex flex-col animate-slide-up"
          >
            <div className="pt-2 pb-1 flex justify-center shrink-0">
              <div className="w-10 h-1 rounded-full bg-line" />
            </div>
            <div className="flex items-center justify-between px-5 pt-2 pb-3 border-b border-line shrink-0">
              <h2 className="text-base font-bold text-heading">Управление</h2>
              <button
                type="button"
                onClick={() => setMobileManageOpen(false)}
                className="p-2 -mr-1 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors"
                aria-label="Закрыть"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Информация */}
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-subtle">Организация</label>
                  <Link
                    to={`/organizations/${ticket.organization?.id}`}
                    className="block text-sm text-primary hover:underline"
                  >
                    {ticket.organization?.name}
                  </Link>
                </div>
                <div>
                  <label className="text-xs text-subtle">Автор</label>
                  <p className="text-sm text-heading">
                    {ticket.createdBy?.firstName} {ticket.createdBy?.lastName}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-subtle">Создан</label>
                  <p className="text-sm text-heading">
                    {new Date(ticket.createdAt).toLocaleString("ru")}
                  </p>
                </div>
              </div>

              {canEdit && (
                <div className="space-y-3 pt-3 border-t border-line">
                  <div>
                    <label className="text-xs text-subtle mb-1 block">Статус</label>
                    <select
                      value={ticket.status}
                      onChange={(e) => handleStatusChange(e.target.value)}
                      className="w-full px-3 py-3 border border-line rounded-lg text-base bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    >
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-subtle mb-1 block">Приоритет</label>
                    <select
                      value={ticket.priority}
                      onChange={(e) => handlePriorityChange(e.target.value)}
                      className="w-full px-3 py-3 border border-line rounded-lg text-base bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    >
                      {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-subtle mb-1 block">Назначен</label>
                    <select
                      value={ticket.assignedToId || ""}
                      onChange={(e) => handleAssignChange(e.target.value)}
                      className="w-full px-3 py-3 border border-line rounded-lg text-base bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    >
                      <option value="">Не назначен</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.firstName} {s.lastName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
