import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router";
import { LifeBuoy, Plus, X } from "lucide-react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import ThreadList from "../components/support/ThreadList.jsx";
import NewThreadForm from "../components/support/NewThreadForm.jsx";
import ThreadView from "../components/support/ThreadView.jsx";

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
  // pending attachments в текущем композере (reply или new thread)
  const [replyAttachments, setReplyAttachments] = useState([]);
  const [newAttachments, setNewAttachments] = useState([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const messagesEndRef = useRef(null);

  async function uploadOne(file) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await api("/api/support/upload", { method: "POST", body: fd });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || "Не удалось загрузить файл");
    }
    return res.json();
  }

  async function handleFiles(files, target) {
    if (!files || files.length === 0) return;
    setError("");
    setUploadingCount((n) => n + files.length);
    try {
      const uploaded = [];
      for (const f of files) {
        try {
          const att = await uploadOne(f);
          uploaded.push(att);
        } catch (e) {
          setError(`«${f.name}»: ${e.message}`);
        }
      }
      if (uploaded.length > 0) {
        if (target === "reply") setReplyAttachments((prev) => [...prev, ...uploaded]);
        else setNewAttachments((prev) => [...prev, ...uploaded]);
      }
    } finally {
      setUploadingCount((n) => n - files.length);
    }
  }

  function handlePaste(e, target) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (const it of items) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      handleFiles(files, target);
    }
  }

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
    if (!newSubject.trim()) return;
    if (!newBody.trim() && newAttachments.length === 0) return;
    setCreating(true);
    setError("");
    try {
      const res = await api("/api/support/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: newSubject.trim(),
          body: newBody.trim(),
          attachments: newAttachments,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Не удалось создать тред");
      }
      const created = await res.json();
      setShowNewForm(false);
      setNewSubject("");
      setNewBody("");
      setNewAttachments([]);
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
    if (!thread) return;
    if (!body.trim() && replyAttachments.length === 0) return;
    setSending(true);
    setError("");
    try {
      const res = await api(`/api/support/threads/${thread.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: body.trim(),
          attachments: replyAttachments,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Ошибка отправки");
      }
      setBody("");
      setReplyAttachments([]);
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

  // На мобилке показываем один режим за раз: список ИЛИ чат ИЛИ форму.
  // На lg+ — две колонки одновременно.
  const showListMobile = !id && !showNewForm;
  const showRightMobile = !!id || showNewForm;

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-3">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <LifeBuoy size={18} className="sm:hidden" />
            <LifeBuoy size={22} className="hidden sm:block" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-heading leading-tight truncate">
              Техподдержка сервиса
            </h1>
            <p className="text-xs sm:text-sm text-subtle hidden sm:block">
              {isStaff
                ? "Все обращения пользователей по работе сайта"
                : "Чат с разработчиками — баги, ошибки, проблемы с сайтом"}
            </p>
          </div>
        </div>
        {!isStaff && (
          <button
            onClick={() => setShowNewForm(true)}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white text-sm font-medium shadow-lg shadow-[#6567F1]/30 hover:from-[#5557E1] hover:to-[#4547D1] transition-all whitespace-nowrap"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Новое обращение</span>
            <span className="sm:hidden">Новое</span>
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

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-3 sm:gap-4">
        {/* Список тредов */}
        <ThreadList
          threads={threads}
          activeThreadId={thread?.id}
          isStaff={isStaff}
          visibleOnMobile={showListMobile}
        />

        {/* Окно треда */}
        <section
          className={`bg-surface rounded-2xl shadow-sm border border-line lg:flex flex-col overflow-hidden h-[calc(100vh-180px)] sm:h-[calc(100vh-220px)] lg:h-[calc(100vh-220px)] ${
            showRightMobile ? "flex" : "hidden"
          }`}
        >
          {showNewForm ? (
            <NewThreadForm
              subject={newSubject}
              onSubjectChange={setNewSubject}
              body={newBody}
              onBodyChange={setNewBody}
              attachments={newAttachments}
              onRemoveAttachment={(idx) => setNewAttachments((p) => p.filter((_, i) => i !== idx))}
              uploadingCount={uploadingCount}
              creating={creating}
              onSubmit={submitNewThread}
              onClose={() => setShowNewForm(false)}
              onFiles={(files) => handleFiles(files, "new")}
              onPaste={(e) => handlePaste(e, "new")}
            />
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
            <ThreadView
              thread={thread}
              loadingThread={loadingThread}
              isStaff={isStaff}
              userId={user?.id}
              onChangeStatus={changeStatus}
              body={body}
              onBodyChange={setBody}
              sending={sending}
              uploadingCount={uploadingCount}
              replyAttachments={replyAttachments}
              onRemoveReplyAttachment={(idx) =>
                setReplyAttachments((p) => p.filter((_, i) => i !== idx))
              }
              onSubmitReply={submitReply}
              onFiles={(files) => handleFiles(files, "reply")}
              onPaste={(e) => handlePaste(e, "reply")}
              messagesEndRef={messagesEndRef}
            />
          )}
        </section>
      </div>
    </div>
  );
}
