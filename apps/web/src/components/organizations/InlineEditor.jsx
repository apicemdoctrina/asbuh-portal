import { useState, useEffect, useRef } from "react";

export default function InlineEditor({ col, org, sections, onSave, onCancel }) {
  const fieldKey = col.key === "section" ? "sectionId" : col.key;

  const getRawValue = () => {
    if (col.editType === "section") return org.section?.id || "";
    if (col.editType === "date") {
      if (!org[col.key]) return "";
      return new Date(org[col.key]).toISOString().slice(0, 10);
    }
    if (col.editType === "number") return org[col.key] ?? "";
    if (col.editType === "boolean") return !!org[col.key];
    if (col.editType === "multiselect") return org[col.key] || [];
    return org[col.key] ?? "";
  };

  const [value, setValue] = useState(getRawValue);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const save = () => {
    let payload;
    if (col.editType === "number") {
      payload = value === "" ? null : Number(value);
    } else if (col.editType === "boolean") {
      payload = value;
    } else if (col.editType === "date") {
      payload = value || null;
    } else if (col.editType === "section") {
      payload = value || null;
    } else if (col.editType === "select") {
      payload = value || null;
    } else if (col.editType === "multiselect") {
      payload = value;
    } else {
      payload = value || null;
    }
    onSave(fieldKey, payload);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
    if (e.key === "Escape") onCancel();
  };

  const cls =
    "w-full px-2 py-1 border border-primary rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-surface";

  if (col.editType === "boolean") {
    return (
      <select
        ref={inputRef}
        value={value ? "true" : "false"}
        onChange={(e) => {
          const next = e.target.value === "true";
          setValue(next);
        }}
        onKeyDown={handleKeyDown}
        onBlur={save}
        className={cls}
      >
        <option value="true">Да</option>
        <option value="false">Нет</option>
      </select>
    );
  }

  if (col.editType === "select") {
    return (
      <select
        ref={inputRef}
        value={value || ""}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={save}
        className={cls}
      >
        <option value="">—</option>
        {Object.entries(col.options).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    );
  }

  if (col.editType === "section") {
    return (
      <select
        ref={inputRef}
        value={value || ""}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={save}
        className={cls}
      >
        <option value="">—</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>
            №{s.number} {s.name || ""}
          </option>
        ))}
      </select>
    );
  }

  if (col.editType === "multiselect") {
    return (
      <div className="flex flex-wrap gap-1">
        {Object.entries(col.options).map(([k, v]) => (
          <label
            key={k}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs cursor-pointer border ${
              value.includes(k)
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-surface border-line text-subtle"
            }`}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={value.includes(k)}
              onChange={(e) => {
                if (e.target.checked) setValue([...value, k]);
                else setValue(value.filter((x) => x !== k));
              }}
              onKeyDown={handleKeyDown}
            />
            {v}
          </label>
        ))}
        <button
          onClick={save}
          className="px-2 py-0.5 rounded text-xs bg-primary text-white hover:bg-[#5557E1]"
        >
          ✓
        </button>
        <button
          onClick={onCancel}
          className="px-2 py-0.5 rounded text-xs bg-muted text-body hover:bg-line"
        >
          ✕
        </button>
      </div>
    );
  }

  if (col.editType === "date") {
    return (
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={save}
        className={cls}
      />
    );
  }

  // text / number
  return (
    <input
      ref={inputRef}
      type={col.editType === "number" ? "number" : "text"}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={save}
      className={cls}
      step={col.editType === "number" ? "any" : undefined}
    />
  );
}
