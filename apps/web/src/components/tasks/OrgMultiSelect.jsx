import { useState } from "react";

export default function OrgMultiSelect({ options, value, onChange }) {
  const [search, setSearch] = useState("");

  function toggle(id) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  const filtered = options.filter(
    (o) =>
      !search ||
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      (o.inn && o.inn.includes(search)),
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по названию или ИНН..."
          className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-subtle hover:text-red-500 dark:hover:text-red-400 transition-colors"
          >
            Снять все ({value.length})
          </button>
        )}
      </div>
      <div className="border border-line rounded-lg overflow-y-auto max-h-28">
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-sm text-subtle">Не найдено</div>
        ) : (
          filtered.map((o) => (
            <label
              key={o.id}
              className="flex items-center gap-2 px-3 py-2 hover:bg-canvas cursor-pointer text-sm border-b border-line last:border-0"
            >
              <input
                type="checkbox"
                checked={value.includes(o.id)}
                onChange={() => toggle(o.id)}
                className="accent-[#6567F1] shrink-0"
              />
              <span className="text-heading flex-1 min-w-0 truncate">{o.name}</span>
              {o.inn && <span className="text-subtle text-xs shrink-0">{o.inn}</span>}
            </label>
          ))
        )}
      </div>
    </div>
  );
}
