import { useEffect } from "react";
import { X } from "lucide-react";

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  "2xl": "max-w-2xl",
  "4xl": "max-w-4xl",
};

/**
 * Общий модальный контейнер: оверлей + панель + заголовок с кнопкой X.
 * Закрывается по Escape и клику по оверлею (клик внутри панели — нет).
 *
 * @param {object} props
 * @param {boolean} [props.open=true] — false скрывает модал (для постоянного монтирования)
 * @param {() => void} props.onClose
 * @param {React.ReactNode} [props.title] — заголовок; строка или произвольный узел
 * @param {keyof typeof SIZES} [props.size="md"]
 * @param {React.ReactNode} [props.footer] — нижняя панель с кнопками (с border-t)
 * @param {boolean} [props.closeOnOverlay=true]
 * @param {string} [props.bodyClassName] — классы контентной области (по умолчанию p-5)
 */
export default function Modal({
  open = true,
  onClose,
  title,
  size = "md",
  footer,
  closeOnOverlay = true,
  bodyClassName = "p-5",
  children,
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={closeOnOverlay ? (e) => e.target === e.currentTarget && onClose?.() : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`bg-surface rounded-2xl shadow-xl border border-line w-full ${SIZES[size] || SIZES.md} max-h-[90vh] overflow-y-auto flex flex-col`}
      >
        {title != null && (
          <div className="flex items-center justify-between p-5 border-b border-line shrink-0">
            {typeof title === "string" ? (
              <h2 className="text-lg font-semibold text-heading">{title}</h2>
            ) : (
              title
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="p-1.5 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className={`overflow-y-auto ${bodyClassName}`}>{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-3 p-5 border-t border-line shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
