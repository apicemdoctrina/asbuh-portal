import { useState, useEffect, useRef } from "react";

export default function AssigneeMultiSelect({ options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggle(id) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  const selectedLabels = options
    .filter((u) => value.includes(u.id))
    .map((u) => `${u.lastName} ${u.firstName}`)
    .join(", ");

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 border border-line rounded-lg text-sm text-left bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary flex items-center justify-between"
      >
        <span className={selectedLabels ? "text-heading" : "text-subtle"}>
          {selectedLabels || "Не назначено"}
        </span>
        <span className="text-subtle text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 w-full bottom-full mb-1 bg-surface border border-line rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-subtle">Нет сотрудников</div>
          ) : (
            options.map((u) => (
              <label
                key={u.id}
                className="flex items-center gap-2 px-3 py-2 hover:bg-canvas cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={value.includes(u.id)}
                  onChange={() => toggle(u.id)}
                  className="accent-[#6567F1]"
                />
                {u.lastName} {u.firstName}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}
