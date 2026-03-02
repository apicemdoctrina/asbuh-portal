import { useState, useEffect, useRef } from "react";
import { api } from "../lib/api.js";
import { X, Send } from "lucide-react";

export default function TaskCommentsModal({ task, onClose }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
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

  function formatDate(iso) {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="min-w-0 pr-4">
            <h2 className="text-base font-bold text-slate-900">Комментарии</h2>
            <p className="text-xs text-slate-400 mt-0.5 truncate">{task.title}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Comments list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
          {loading ? (
            <p className="text-sm text-slate-400">Загрузка...</p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-slate-400">Пока нет комментариев. Напишите первый.</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-[#6567F1]/10 flex items-center justify-center text-[#6567F1] text-xs font-bold shrink-0 mt-0.5">
                  {(c.author.firstName[0] || "").toUpperCase()}
                  {(c.author.lastName[0] || "").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-slate-700">
                      {c.author.lastName} {c.author.firstName}
                    </span>
                    <span className="text-[10px] text-slate-400">{formatDate(c.createdAt)}</span>
                  </div>
                  <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap break-words">
                    {c.text}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={handleSend}
          className="px-6 pb-5 pt-3 border-t border-slate-100 flex gap-2 items-end"
        >
          <textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Написать комментарий… (Enter — отправить, Shift+Enter — перенос строки)"
            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] resize-none"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="shrink-0 p-2.5 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 transition-all disabled:opacity-40"
          >
            <Send size={15} />
          </button>
        </form>
      </div>
    </div>
  );
}
