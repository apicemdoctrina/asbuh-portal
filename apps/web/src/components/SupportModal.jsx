import { useState } from "react";
import { X, Mail, Send, Copy, Check, LifeBuoy } from "lucide-react";

const SUPPORT_EMAIL = "support@asbuh.com";
const SUPPORT_TELEGRAM = "apicem_doctrina";

export default function SupportModal({ onClose }) {
  const [copied, setCopied] = useState("");

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      // clipboard may be unavailable on http or older browsers — silently ignore
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl shadow-xl border border-line w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <LifeBuoy size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-heading">Техподдержка сервиса</h2>
              <p className="text-xs text-subtle">Если что-то не работает — напишите нам</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-body mb-5">
          Это канал поддержки <strong>самого сайта</strong> (баги, ошибки интерфейса, проблемы со
          входом). Для вопросов по бухгалтерии используйте раздел «Тикеты».
        </p>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 p-3 rounded-xl border border-line bg-canvas hover:border-primary/30 transition-colors">
            <Mail size={18} className="text-subtle shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase tracking-wide text-subtle">Email</div>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-sm text-body hover:text-primary font-medium block truncate"
              >
                {SUPPORT_EMAIL}
              </a>
            </div>
            <button
              onClick={() => copy(SUPPORT_EMAIL, "email")}
              className="p-2 rounded-lg text-subtle hover:text-primary hover:bg-primary/5 transition-colors"
              title="Скопировать"
            >
              {copied === "email" ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>

          <a
            href={`https://t.me/${SUPPORT_TELEGRAM}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-xl border border-line bg-canvas hover:border-primary/30 transition-colors group"
          >
            <Send size={18} className="text-subtle shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase tracking-wide text-subtle">Telegram</div>
              <span className="text-sm text-body group-hover:text-primary font-medium block truncate">
                @{SUPPORT_TELEGRAM}
              </span>
            </div>
            <button
              onClick={(e) => {
                e.preventDefault();
                copy(`@${SUPPORT_TELEGRAM}`, "tg");
              }}
              className="p-2 rounded-lg text-subtle hover:text-primary hover:bg-primary/5 transition-colors"
              title="Скопировать"
            >
              {copied === "tg" ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </a>
        </div>

        <p className="mt-5 text-xs text-subtle">
          Среднее время ответа в рабочие часы — до 1 часа. Опишите проблему подробно и приложите
          скриншот, если возможно.
        </p>
      </div>
    </div>
  );
}
