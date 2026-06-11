import { useState, useEffect, useRef } from "react";
import { SlidersHorizontal } from "lucide-react";
import { COLUMN_DEFS, DEFAULT_COLS } from "./orgConstants.jsx";

export default function ColumnPicker({ visibleCols, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function toggle(key) {
    const next = visibleCols.includes(key)
      ? visibleCols.filter((k) => k !== key)
      : [...visibleCols, key];
    onChange(next);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
          open
            ? "border-primary text-primary bg-primary/5"
            : "border-line text-body hover:bg-canvas"
        }`}
      >
        <SlidersHorizontal size={15} />
        Столбцы
        {visibleCols.length !== DEFAULT_COLS.length && (
          <span className="ml-0.5 bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
            {visibleCols.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-surface border border-line rounded-xl shadow-xl p-3 w-52">
          <p className="text-[11px] font-semibold text-subtle uppercase tracking-wide mb-2 px-1">
            Название — всегда
          </p>
          <div className="space-y-0.5">
            {COLUMN_DEFS.map(({ key, label }) => (
              <label
                key={key}
                className="flex items-center gap-2.5 px-1 py-1 rounded-lg hover:bg-canvas cursor-pointer text-sm text-body"
              >
                <input
                  type="checkbox"
                  checked={visibleCols.includes(key)}
                  onChange={() => toggle(key)}
                  className="w-4 h-4 rounded border-line text-primary focus:ring-primary/30"
                />
                {label}
              </label>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-line flex gap-2">
            <button
              onClick={() => onChange(COLUMN_DEFS.map((c) => c.key))}
              className="flex-1 text-xs text-primary hover:underline text-center"
            >
              Все
            </button>
            <button
              onClick={() => onChange(DEFAULT_COLS)}
              className="flex-1 text-xs text-subtle hover:underline text-center"
            >
              По умолчанию
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
