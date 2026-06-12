import { useEffect, useRef } from "react";
import { X } from "lucide-react";

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "4xl": "max-w-4xl",
};

// Tailwind не генерирует динамически собранные классы — карта должна быть статичной
const SHEET_SIZES = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  "2xl": "sm:max-w-2xl",
  "4xl": "sm:max-w-4xl",
};

// Стек открытых модалок: Escape закрывает только верхнюю
const modalStack = [];

/**
 * Общий модальный контейнер: оверлей + панель + заголовок с кнопкой X.
 * Закрывается по Escape (только верхняя из открытых) и клику по оверлею
 * (клик внутри панели — нет).
 *
 * @param {object} props
 * @param {boolean} [props.open=true] — false скрывает модал (для постоянного монтирования)
 * @param {() => void} props.onClose
 * @param {React.ReactNode} [props.title] — заголовок; строка или произвольный узел
 * @param {keyof typeof SIZES} [props.size="md"]
 * @param {React.ReactNode} [props.footer] — нижняя панель с кнопками (с border-t)
 * @param {boolean} [props.closeOnOverlay=true]
 * @param {boolean} [props.sheet=false] — на мобильных bottom-sheet (панель прижата
 *   к низу, rounded-t-3xl, drag-handle, animate-slide-up), на sm+ обычный центр
 * @param {string} [props.bodyClassName] — классы контентной области (по умолчанию p-5)
 */
export default function Modal({
  open = true,
  onClose,
  title,
  size = "md",
  footer,
  closeOnOverlay = true,
  sheet = false,
  bodyClassName = "p-5",
  children,
}) {
  const stackIdRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const id = (stackIdRef.current = {});
    modalStack.push(id);
    function onKeyDown(e) {
      if (e.key === "Escape" && modalStack[modalStack.length - 1] === id) onClose?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const idx = modalStack.indexOf(id);
      if (idx !== -1) modalStack.splice(idx, 1);
    };
  }, [open, onClose]);

  if (!open) return null;

  const maxW = SIZES[size] || SIZES.md;
  const sheetMaxW = SHEET_SIZES[size] || SHEET_SIZES.md;

  return (
    <div
      className={
        sheet
          ? "fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4"
          : "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      }
      onMouseDown={closeOnOverlay ? (e) => e.target === e.currentTarget && onClose?.() : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={
          sheet
            ? `bg-surface w-full ${sheetMaxW} max-h-[92vh] sm:max-h-[90vh] rounded-t-3xl sm:rounded-2xl shadow-2xl border-x border-t sm:border border-line flex flex-col animate-slide-up sm:animate-none`
            : `bg-surface rounded-2xl shadow-xl border border-line w-full ${maxW} max-h-[90vh] overflow-y-auto flex flex-col`
        }
      >
        {sheet && (
          <div className="sm:hidden pt-2 pb-1 flex justify-center shrink-0">
            <div className="w-10 h-1 rounded-full bg-line" />
          </div>
        )}
        {title != null && (
          <div
            className={`flex items-center justify-between border-b border-line shrink-0 ${
              sheet ? "px-5 pt-2 sm:pt-4 pb-3" : "p-5"
            }`}
          >
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
        <div className={`overflow-y-auto ${sheet ? "flex-1 " : ""}${bodyClassName}`}>
          {children}
        </div>
        {footer && (
          <div className="flex items-center justify-end gap-3 p-5 border-t border-line shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
