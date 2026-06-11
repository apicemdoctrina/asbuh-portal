import { useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { STATUS_TABS } from "./taskConstants.js";

export default function StatusTabsDropdown({ value, onChange, showArchived }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (!open) return;
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open]);

  const options = STATUS_TABS.filter((t) => t.key !== "ARCHIVED" || showArchived);
  const current = options.find((t) => t.key === value) || options[0];

  return (
    <div ref={ref} className="sm:hidden relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-xl text-sm font-medium shadow-sm shadow-primary/20 active:scale-95 transition-transform"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{current.label}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute z-30 left-0 top-full mt-1.5 min-w-[180px] bg-surface border border-line rounded-xl shadow-xl overflow-hidden py-1"
        >
          {options.map((t) => {
            const active = t.key === value;
            return (
              <button
                key={t.key}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(t.key);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-primary/10 text-primary" : "text-body hover:bg-muted"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
