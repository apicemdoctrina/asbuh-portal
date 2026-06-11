import { useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router";
import { Bug, Loader2, Send, Camera, AlertCircle } from "lucide-react";
import { api } from "../lib/api.js";
import Modal from "./ui/Modal.jsx";

function pageTitle() {
  const h1 = document.querySelector("h1")?.textContent?.trim();
  return h1 || document.title || "страница";
}

function systemInfo() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const sw = window.screen?.width || 0;
  const sh = window.screen?.height || 0;
  return {
    url: window.location.href,
    path: window.location.pathname,
    viewport: `${w}×${h}`,
    screen: `${sw}×${sh}`,
    userAgent: navigator.userAgent,
    locale: navigator.language,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    when: new Date().toISOString(),
  };
}

function shortBrowser(ua) {
  if (!ua) return "—";
  // короткое имя из UA для тайтлов/превью
  const m =
    ua.match(/(Edg|Edge)\/[\d.]+/) ||
    ua.match(/Chrome\/[\d.]+/) ||
    ua.match(/Firefox\/[\d.]+/) ||
    ua.match(/Safari\/[\d.]+/);
  const os = ua.match(/Windows NT [\d.]+|Mac OS X [\d_]+|Android \d+|iPhone OS [\d_]+|Linux/);
  return [m?.[0], os?.[0]].filter(Boolean).join(" · ") || ua.slice(0, 80);
}

function formatSystemBlock(info) {
  return [
    "---",
    "🔧 Системная информация (захвачена автоматически):",
    `Страница: ${info.path}`,
    `URL: ${info.url}`,
    `Окно: ${info.viewport} · Экран: ${info.screen}`,
    `Браузер: ${info.userAgent}`,
    `Локаль: ${info.locale} · TZ: ${info.tz}`,
    `Время: ${info.when}`,
  ].join("\n");
}

export default function BugReportButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(null);
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [includeShot, setIncludeShot] = useState(true);
  const [shotAttachment, setShotAttachment] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const bodyRef = useRef(null);

  // На /support FAB прячем, чтобы не дублировать
  if (location.pathname.startsWith("/support")) return null;

  async function captureScreenshot() {
    setCapturing(true);
    setError("");
    try {
      // Ленивая загрузка html2canvas — он тяжёлый.
      const html2canvasMod = await import("html2canvas");
      const html2canvas = html2canvasMod.default || html2canvasMod;
      // Захват ДО открытия модалки (она будет поверх потом).
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        backgroundColor: null,
        scale: Math.min(window.devicePixelRatio || 1, 2),
        logging: false,
        ignoreElements: (el) => el.dataset?.bugReportSkip === "1",
      });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.92));
      if (!blob) throw new Error("Не удалось получить PNG");
      const fd = new FormData();
      const file = new File([blob], `screenshot-${Date.now()}.png`, { type: "image/png" });
      fd.append("file", file);
      const res = await api("/api/support/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Загрузка скриншота не удалась");
      }
      const att = await res.json();
      setShotAttachment(att);
    } catch (e) {
      // Скриншот не критичен — продолжаем без него.
      console.warn("[bug-report] screenshot failed:", e);
      setError(`Скриншот не удалось сделать (${e.message}). Можно отправить без него.`);
    } finally {
      setCapturing(false);
    }
  }

  async function openModal() {
    const sysInfo = systemInfo();
    setInfo(sysInfo);
    setSubject(`Баг на странице «${pageTitle()}»`.slice(0, 200));
    setBody("");
    setShotAttachment(null);
    setIncludeShot(true);
    setError("");
    setOpen(true);
    // Захватываем СРАЗУ — до того как пользователь видит модалку — так в кадре не будет самой модалки.
    captureScreenshot();
    // Фокусируем поле ввода после рендера.
    setTimeout(() => bodyRef.current?.focus(), 100);
  }

  async function submit(e) {
    e?.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const finalBody = `${body.trim()}\n\n${formatSystemBlock(info)}`;
      const attachments = includeShot && shotAttachment ? [shotAttachment] : [];
      const res = await api("/api/support/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim() || `Баг на ${info?.path || "странице"}`,
          body: finalBody,
          attachments,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Не удалось отправить");
      }
      const created = await res.json();
      setOpen(false);
      navigate(`/support/${created.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  // На /tasks и /tickets вместо жучка показываем FAB создания (см. TasksPage / TicketsPage)
  const hideFab = location.pathname === "/tasks" || location.pathname === "/tickets";

  return (
    <>
      {/* FAB — компактный круг 36px (data-bug-report-skip="1" убирает из скриншота) */}
      {!hideFab && (
        <button
          data-bug-report-skip="1"
          onClick={openModal}
          className="fixed z-40 bottom-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-orange-500/30 hover:shadow-lg hover:shadow-orange-500/40 hover:scale-110 transition-all"
          title="Сообщить о баге"
          aria-label="Сообщить о баге"
        >
          <Bug size={16} />
        </button>
      )}

      {open && (
        <div data-bug-report-skip="1">
          <Modal
            onClose={() => !submitting && setOpen(false)}
            size="lg"
            title={
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shrink-0">
                  <Bug size={20} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-bold text-heading">Сообщить о баге</h2>
                  <p className="text-xs text-subtle">
                    Опишите что пошло не так — контекст подтянется автоматически
                  </p>
                </div>
              </div>
            }
            bodyClassName="p-4 sm:p-5"
          >
            <form onSubmit={submit} className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-medium text-body mb-1">Тема</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={200}
                  className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-body mb-1">
                  Что произошло? <span className="text-subtle font-normal">(обязательно)</span>
                </label>
                <textarea
                  ref={bodyRef}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Например: нажал «Сохранить», и страница ничего не сделала. Ожидал что задача добавится."
                  rows={5}
                  maxLength={10_000}
                  className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                />
              </div>

              {/* Скриншот */}
              <div className="rounded-lg border border-line bg-canvas/60 p-3 flex items-center gap-3">
                {capturing ? (
                  <div className="flex items-center gap-2 text-xs text-subtle">
                    <Loader2 size={14} className="animate-spin" />
                    Делаю скриншот…
                  </div>
                ) : shotAttachment ? (
                  <>
                    <a
                      href={`${import.meta.env.VITE_API_URL || ""}/uploads/${shotAttachment.fileKey}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-16 h-16 rounded-lg overflow-hidden border border-line shrink-0 hover:opacity-90 transition-opacity"
                    >
                      <img
                        src={`${import.meta.env.VITE_API_URL || ""}/uploads/${shotAttachment.fileKey}`}
                        alt="скриншот"
                        className="w-full h-full object-cover"
                      />
                    </a>
                    <div className="flex-1 min-w-0">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeShot}
                          onChange={(e) => setIncludeShot(e.target.checked)}
                          className="accent-primary"
                        />
                        <span className="text-xs text-body">Приложить скриншот страницы</span>
                      </label>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={captureScreenshot}
                    className="inline-flex items-center gap-2 text-xs text-subtle hover:text-primary transition-colors"
                  >
                    <Camera size={14} />
                    Попробовать ещё раз
                  </button>
                )}
              </div>

              {/* Системная инфа — раскрывается */}
              <details className="text-xs">
                <summary className="cursor-pointer text-subtle hover:text-body select-none">
                  Что мы автоматически прикрепляем
                </summary>
                <div className="mt-2 p-3 rounded-lg bg-muted/50 border border-line text-[11px] text-subtle font-mono whitespace-pre-wrap break-all">
                  {info ? (
                    <>
                      Страница: {info.path}
                      {"\n"}
                      Окно: {info.viewport} · Экран: {info.screen}
                      {"\n"}
                      Браузер: {shortBrowser(info.userAgent)}
                      {"\n"}
                      Локаль: {info.locale} · TZ: {info.tz}
                    </>
                  ) : null}
                </div>
              </details>

              {error && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg text-sm text-body hover:bg-muted transition-colors disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={submitting || capturing || !body.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white text-sm font-medium shadow-lg shadow-[#6567F1]/30 hover:from-[#5557E1] hover:to-[#4547D1] disabled:opacity-50 transition-all"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  Отправить
                </button>
              </div>
            </form>
          </Modal>
        </div>
      )}
    </>
  );
}
