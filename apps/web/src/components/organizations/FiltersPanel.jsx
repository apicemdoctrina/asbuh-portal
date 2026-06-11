import { useState } from "react";
import { Filter, ChevronDown, ChevronRight as ChevronRightIcon } from "lucide-react";

// Collapsible on mobile, always visible on >=sm
export default function FiltersPanel({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4 sm:mb-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="sm:hidden w-full mb-3 inline-flex items-center justify-between px-3 py-2 border border-line rounded-lg text-sm font-medium text-body bg-surface"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2">
          <Filter size={15} className="text-subtle" />
          Фильтры и столбцы
        </span>
        {open ? <ChevronDown size={16} /> : <ChevronRightIcon size={16} />}
      </button>
      <div className={open ? "block" : "hidden sm:block"}>{children}</div>
    </div>
  );
}
