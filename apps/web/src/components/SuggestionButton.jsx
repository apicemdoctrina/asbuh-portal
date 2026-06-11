import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Lightbulb, Loader2, Send, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "../lib/api.js";
import Modal from "./ui/Modal.jsx";

export default function SuggestionButton({ className = "" }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => bodyRef.current?.focus(), 100);
  }, [open]);

  function closeAll() {
    setOpen(false);
    setTimeout(() => {
      setBody("");
      setError("");
      setDone(false);
    }, 200);
  }

  async function submit(e) {
    e?.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await api("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: body.trim(),
          pageUrl: window.location.pathname,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Не удалось отправить");
      }
      setDone(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-body hover:bg-muted hover:text-heading transition-colors w-full text-left"
        }
        title="Поделиться идеей или предложением"
      >
        <Lightbulb size={18} />
        Предложения и пожелания
      </button>

      {open &&
        createPortal(
          <Modal
            onClose={() => !submitting && closeAll()}
            size="lg"
            title={
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-300 to-yellow-500 text-white flex items-center justify-center shrink-0">
                  <Lightbulb size={20} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-bold text-heading">
                    Предложения и пожелания
                  </h2>
                  <p className="text-xs text-subtle">
                    Анонимно — что улучшить, что добавить, что нравится или мешает
                  </p>
                </div>
              </div>
            }
            bodyClassName="p-0"
          >
            {done ? (
              <div className="p-6 flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 size={28} />
                </div>
                <h3 className="text-base font-semibold text-heading">Спасибо!</h3>
                <p className="text-sm text-subtle">
                  Ваше предложение отправлено администратору. Мы прочитаем каждое.
                </p>
                <button
                  onClick={closeAll}
                  className="mt-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white text-sm font-medium shadow-lg shadow-[#6567F1]/30 hover:from-[#5557E1] hover:to-[#4547D1] transition-all"
                >
                  Закрыть
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="p-4 sm:p-5 flex flex-col gap-3">
                <div>
                  <label className="block text-xs font-medium text-body mb-1">
                    Ваше предложение
                  </label>
                  <textarea
                    ref={bodyRef}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Например: было бы удобно фильтровать задачи по нескольким исполнителям. Или: страница «Финансы» грузится долго."
                    rows={6}
                    maxLength={10_000}
                    className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                  />
                  <p className="text-[11px] text-subtle mt-1">
                    Отправляется анонимно — администратор не видит, кто написал.
                  </p>
                </div>

                {error && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeAll}
                    disabled={submitting}
                    className="px-4 py-2 rounded-lg text-sm text-body hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || body.trim().length < 3}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white text-sm font-medium shadow-lg shadow-[#6567F1]/30 hover:from-[#5557E1] hover:to-[#4547D1] disabled:opacity-50 transition-all"
                  >
                    {submitting ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Send size={16} />
                    )}
                    Отправить
                  </button>
                </div>
              </form>
            )}
          </Modal>,
          document.body,
        )}
    </>
  );
}
