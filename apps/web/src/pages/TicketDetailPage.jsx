import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "react-router";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
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
  NEW: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-yellow-100 text-yellow-700",
  WAITING_CLIENT: "bg-orange-100 text-orange-700",
  ON_HOLD: "bg-slate-100 text-slate-600",
  ESCALATED: "bg-red-100 text-red-700",
  CLOSED: "bg-green-100 text-green-700",
  REOPENED: "bg-purple-100 text-purple-700",
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

  const [staff, setStaff] = useState([]);

  const isStaff =
    hasRole("admin") || hasRole("supervisor") || hasRole("manager") || hasRole("accountant");
  const canEdit = hasPermission("ticket", "edit");
  const canDeleteMsg = hasRole("admin") || hasRole("supervisor") || hasRole("manager");

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

  useEffect(() => {
    if (!isStaff) return;
    api("/api/users?limit=200")
      .then((r) => r.json())
      .then((data) => {
        setStaff(Array.isArray(data) ? data : data.users || []);
      })
      .catch(() => {});
  }, [isStaff]);

  useEffect(() => {
    if (!loading) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
      // Refresh ticket for updated status
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
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  if (error || !ticket)
    return <div className="text-center py-16 text-red-500">{error || "Тикет не найден"}</div>;

  const apiBase = import.meta.env.VITE_API_URL || "";

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Main chat area */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Link
            to="/tickets"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">#{ticket.number}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[ticket.status]}`}
              >
                {STATUS_LABELS[ticket.status]}
              </span>
            </div>
            <h1 className="text-lg font-bold text-slate-900 truncate">{ticket.subject}</h1>
          </div>
        </div>

        {/* Messages */}
        <div
          className="bg-white rounded-2xl shadow-lg border border-slate-200 flex flex-col"
          style={{ height: "calc(100vh - 280px)" }}
        >
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {hasMore && (
              <button
                onClick={() => fetchTicket(nextCursor)}
                disabled={loadingMore}
                className="w-full text-center py-2 text-sm text-[#6567F1] hover:bg-[#6567F1]/5 rounded-lg transition-colors"
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

              if (isDeleted) {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <span className="text-xs text-slate-400 italic">Сообщение удалено</span>
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
                        ? "bg-yellow-50 border-2 border-dashed border-yellow-300"
                        : isOwn
                          ? "bg-[#6567F1] text-white"
                          : "bg-slate-100 text-slate-900"
                    }`}
                  >
                    {msg.isInternal && (
                      <div className="flex items-center gap-1 text-xs text-yellow-600 font-medium mb-1">
                        <EyeOff size={12} /> Внутренняя заметка
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs font-medium ${msg.isInternal ? "text-yellow-700" : isOwn ? "text-white/80" : "text-slate-500"}`}
                      >
                        {msg.author?.firstName} {msg.author?.lastName}
                      </span>
                      <span
                        className={`text-xs ${msg.isInternal ? "text-yellow-500" : isOwn ? "text-white/60" : "text-slate-400"}`}
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
                          className={`opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-black/10 transition-opacity ${isOwn ? "text-white/60" : "text-slate-400"}`}
                          title="Удалить"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    <p
                      className={`text-sm whitespace-pre-wrap ${msg.isInternal ? "text-yellow-900" : ""}`}
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
                                ? "bg-white/20 hover:bg-white/30 text-white"
                                : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200"
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
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          {ticket.status !== "CLOSED" && (
            <form onSubmit={handleSend} className="border-t border-slate-200 p-4">
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {files.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1 bg-slate-100 rounded-lg px-2 py-1 text-xs text-slate-600"
                    >
                      <FileText size={12} />
                      <span className="truncate max-w-[120px]">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="text-slate-400 hover:text-red-500"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2">
                {isStaff && (
                  <button
                    type="button"
                    onClick={() => setIsInternal(!isInternal)}
                    className={`p-2 rounded-lg transition-colors ${isInternal ? "bg-yellow-100 text-yellow-700" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"}`}
                    title={
                      isInternal
                        ? "Внутренняя заметка (видна только сотрудникам)"
                        : "Обычное сообщение"
                    }
                  >
                    {isInternal ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  title="Прикрепить файл"
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
                  className={`flex-1 px-3 py-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] ${
                    isInternal ? "border-yellow-300 bg-yellow-50" : "border-slate-200"
                  }`}
                />
                <button
                  type="submit"
                  disabled={sending || (!msgBody.trim() && files.length === 0)}
                  className="p-2 rounded-lg bg-[#6567F1] text-white hover:bg-[#5557E1] disabled:opacity-50 transition-colors"
                >
                  {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </div>
              {isInternal && (
                <p className="text-xs text-yellow-600 mt-1">
                  Это внутренняя заметка — клиент её не увидит
                </p>
              )}
            </form>
          )}
        </div>
      </div>

      {/* Sidebar (staff only) */}
      {isStaff && (
        <div className="w-full lg:w-72 space-y-4">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-4 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Информация</h3>
            <div>
              <label className="text-xs text-slate-500">Организация</label>
              <Link
                to={`/organizations/${ticket.organization?.id}`}
                className="block text-sm text-[#6567F1] hover:underline"
              >
                {ticket.organization?.name}
              </Link>
            </div>
            <div>
              <label className="text-xs text-slate-500">Автор</label>
              <p className="text-sm text-slate-900">
                {ticket.createdBy?.firstName} {ticket.createdBy?.lastName}
              </p>
            </div>
            <div>
              <label className="text-xs text-slate-500">Создан</label>
              <p className="text-sm text-slate-900">
                {new Date(ticket.createdAt).toLocaleString("ru")}
              </p>
            </div>
          </div>

          {canEdit && (
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-4 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Управление</h3>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Статус</label>
                <select
                  value={ticket.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                >
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Приоритет</label>
                <select
                  value={ticket.priority}
                  onChange={(e) => handlePriorityChange(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                >
                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Назначен</label>
                <select
                  value={ticket.assignedToId || ""}
                  onChange={(e) => handleAssignChange(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
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
    </div>
  );
}
