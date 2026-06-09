import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { LifeBuoy, Plus, Send, Loader2, CheckCircle2, X, Mail } from "lucide-react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";

const STATUS_LABEL = {
  OPEN: {
    text: "Открыто",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  RESOLVED: {
    text: "Решено",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  CLOSED: {
    text: "Закрыто",
    cls: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  },
};

function formatTime(d) {
  if (!d) return "";
  const date = new Date(d);
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  return sameDay
    ? date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function fullName(u) {
  if (!u) return "—";
  return `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email;
}

function avatarUrl(u) {
  if (!u?.avatarUrl) return null;
  return `${import.meta.env.VITE_API_URL || ""}${u.avatarUrl}`;
}

function Avatar({ user, size = 32 }) {
  const url = avatarUrl(user);
  if (url) {
    return (
      <img
        src={url}
        alt=""
        style={{ width: size, height: size }}
        className="rounded-full object-cover border border-line shrink-0"
      />
    );
  }
  const initials = `${(user?.firstName?.[0] || "").toUpperCase()}${(user?.lastName?.[0] || "").toUpperCase()}`;
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs shrink-0"
    >
      {initials || "?"}
    </div>
  );
}

export default function SupportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const isStaff = hasRole("admin") || hasRole("supervisor");

  const [threads, setThreads] = useState(null);
  const [thread, setThread] = useState(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef(null);

  const loadThreads = useCallback(async () => {
    try {
      const res = await api("/api/support/threads");
      if (!res.ok) throw new Error("Не удалось загрузить");
      setThreads(await res.json());
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const loadThread = useCallback(async (threadId) => {
    setLoadingThread(true);
    try {
      const res = await api(`/api/support/threads/${threadId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("Тред не найден");
          setThread(null);
          return;
        }
        throw new Error("Не удалось загрузить тред");
      }
      setThread(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    loadThreads();
    const t = setInterval(loadThreads, 15_000);
    return () => clearInterval(t);
  }, [loadThreads]);

  useEffect(() => {
    if (id) loadThread(id);
    else setThread(null);
  }, [id, loadThread]);

  useEffect(() => {
    if (!id) return;
    const t = setInterval(() => loadThread(id), 8_000);
    return () => clearInterval(t);
  }, [id, loadThread]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [thread?.messages?.length]);

  async function submitNewThread(e) {
    e.preventDefault();
    if (!newSubject.trim() || !newBody.trim()) return;
    setCreating(true);
    setError("");
    try {
      const res = await api("/api/support/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: newSubject.trim(), body: newBody.trim() }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Не удалось создать тред");
      }
      const created = await res.json();
      setShowNewForm(false);
      setNewSubject("");
      setNewBody("");
      await loadThreads();
      navigate(`/support/${created.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function submitReply(e) {
    e.preventDefault();
    if (!body.trim() || !thread) return;
    setSending(true);
    setError("");
    try {
      const res = await api(`/api/support/threads/${thread.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Ошибка отправки");
      }
      setBody("");
      await loadThread(thread.id);
      await loadThreads();
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  async function changeStatus(status) {
    try {
      const res = await api(`/api/support/threads/${thread.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Не удалось");
      await loadThread(thread.id);
      await loadThreads();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <LifeBuoy size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-heading">Техподдержка сервиса</h1>
            <p className="text-sm text-subtle">
              {isStaff
                ? "Все обращения пользователей по работе сайта"
                : "Чат с разработчиками — баги, ошибки, проблемы с сайтом"}
            </p>
          </div>
        </div>
        {!isStaff && (
          <button
            onClick={() => setShowNewForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white text-sm font-medium shadow-lg shadow-[#6567F1]/30 hover:from-[#5557E1] hover:to-[#4547D1] transition-all"
          >
            <Plus size={16} />
            Новое обращение
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 text-sm px-4 py-2 rounded-lg flex items-center gap-2">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError("")} className="p-1 hover:opacity-70">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 min-h-[calc(100vh-260px)]">
        {/* Список тредов */}
        <aside className="bg-surface rounded-2xl shadow-sm border border-line overflow-hidden flex flex-col">
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
                  const isActive = thread?.id === t.id;
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
                          <div className="text-xs text-subtle truncate mb-1">
                            от {fullName(t.user)}
                          </div>
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
            <div className="p-3 border-t border-line bg-canvas text-[11px] text-subtle flex items-center gap-2">
              <Mail size={12} />
              <span className="truncate">Альтернативно: support@asbuh.com</span>
            </div>
          )}
        </aside>

        {/* Окно треда */}
        <section className="bg-surface rounded-2xl shadow-sm border border-line flex flex-col overflow-hidden">
          {showNewForm ? (
            <form onSubmit={submitNewThread} className="p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-heading">Новое обращение</h2>
                <button
                  type="button"
                  onClick={() => setShowNewForm(false)}
                  className="p-1.5 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-body mb-1">Тема</label>
                <input
                  type="text"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="Кратко опишите проблему"
                  required
                  minLength={3}
                  maxLength={200}
                  className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-body mb-1">Сообщение</label>
                <textarea
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  placeholder="Опишите проблему подробно. Что вы делали? Что ожидали? Что произошло? Шаги для воспроизведения, если возможно."
                  rows={8}
                  required
                  maxLength={10_000}
                  className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={creating || !newSubject.trim() || !newBody.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white text-sm font-medium shadow-lg shadow-[#6567F1]/30 hover:from-[#5557E1] hover:to-[#4547D1] disabled:opacity-50 transition-all"
                >
                  {creating ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  Отправить
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewForm(false)}
                  className="px-4 py-2 rounded-lg text-sm text-body hover:bg-muted transition-colors"
                >
                  Отмена
                </button>
              </div>
            </form>
          ) : !thread ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-10 gap-3">
              <LifeBuoy size={48} className="text-subtle" />
              <h3 className="text-lg font-semibold text-heading">
                {isStaff ? "Выберите обращение слева" : "Выберите обращение или создайте новое"}
              </h3>
              <p className="text-sm text-subtle max-w-md">
                {isStaff
                  ? "Здесь — все обращения по работе сайта от пользователей сервиса."
                  : "Это отдельный канал для багов и проблем с сайтом. Для вопросов по бухгалтерии — раздел «Тикеты»."}
              </p>
            </div>
          ) : (
            <>
              <header className="p-4 border-b border-line flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h2 className="text-lg font-bold text-heading">{thread.subject}</h2>
                    <span
                      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${STATUS_LABEL[thread.status].cls}`}
                    >
                      {STATUS_LABEL[thread.status].text}
                    </span>
                  </div>
                  <div className="text-xs text-subtle">
                    Открыто {formatTime(thread.createdAt)}
                    {isStaff && ` · ${fullName(thread.user)}`}
                  </div>
                </div>
                {isStaff && thread.status !== "CLOSED" && (
                  <div className="flex items-center gap-2">
                    {thread.status === "OPEN" && (
                      <button
                        onClick={() => changeStatus("RESOLVED")}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200/70 dark:hover:bg-emerald-500/25 transition-colors"
                      >
                        <CheckCircle2 size={14} />
                        Решено
                      </button>
                    )}
                    <button
                      onClick={() => changeStatus("CLOSED")}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-body hover:bg-line transition-colors"
                    >
                      Закрыть
                    </button>
                  </div>
                )}
                {isStaff && thread.status === "CLOSED" && (
                  <button
                    onClick={() => changeStatus("OPEN")}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-body hover:bg-line transition-colors"
                  >
                    Переоткрыть
                  </button>
                )}
              </header>

              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-canvas/50">
                {loadingThread && !thread.messages ? (
                  <div className="flex items-center justify-center py-8 text-subtle">
                    <Loader2 size={20} className="animate-spin" />
                  </div>
                ) : (
                  (thread.messages || []).map((m) => {
                    const mine = m.authorId === user?.id;
                    return (
                      <div
                        key={m.id}
                        className={`flex gap-2 ${mine ? "flex-row-reverse" : "flex-row"}`}
                      >
                        <Avatar user={m.author} size={32} />
                        <div
                          className={`max-w-[78%] ${mine ? "items-end" : "items-start"} flex flex-col gap-0.5`}
                        >
                          <div
                            className={`text-[11px] text-subtle ${mine ? "text-right" : "text-left"}`}
                          >
                            {fullName(m.author)}
                            {m.isStaff && (
                              <span className="ml-1 text-primary font-medium">(поддержка)</span>
                            )}
                            <span className="ml-2">{formatTime(m.createdAt)}</span>
                          </div>
                          <div
                            className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                              mine
                                ? "bg-primary text-white rounded-tr-sm"
                                : "bg-surface border border-line rounded-tl-sm text-body"
                            }`}
                          >
                            {m.body}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {thread.status !== "CLOSED" ? (
                <form
                  onSubmit={submitReply}
                  className="border-t border-line p-3 flex items-end gap-2"
                >
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        submitReply(e);
                      }
                    }}
                    placeholder="Ответ… (Ctrl+Enter — отправить)"
                    rows={2}
                    maxLength={10_000}
                    className="flex-1 px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                  />
                  <button
                    type="submit"
                    disabled={sending || !body.trim()}
                    className="flex items-center justify-center gap-1 px-4 py-2 h-[44px] rounded-lg bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white text-sm font-medium shadow-lg shadow-[#6567F1]/30 hover:from-[#5557E1] hover:to-[#4547D1] disabled:opacity-50 transition-all"
                  >
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </form>
              ) : (
                <div className="border-t border-line p-4 text-center text-sm text-subtle bg-muted">
                  Тред закрыт. Если есть новые вопросы — создайте новое обращение.
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
