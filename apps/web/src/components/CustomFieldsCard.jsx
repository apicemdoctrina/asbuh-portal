import { useState, useEffect } from "react";
import { Settings, Pencil, Check, X, Trash2, Plus, Loader2, GripVertical } from "lucide-react";
import { api } from "../lib/api.js";

function FieldInput({ def, value, onChange }) {
  if (def.fieldType === "BOOLEAN") {
    return (
      <input
        type="checkbox"
        checked={value === "true"}
        onChange={(e) => onChange(e.target.checked ? "true" : "false")}
        className="h-4 w-4 rounded border-slate-300 text-[#6567F1] cursor-pointer"
      />
    );
  }
  if (def.fieldType === "DATE") {
    return (
      <input
        type="date"
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30"
      />
    );
  }
  if (def.fieldType === "NUMBER") {
    return (
      <input
        type="number"
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="border border-slate-300 rounded-lg px-2 py-1 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30"
      />
    );
  }
  return (
    <input
      type="text"
      value={value || ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="border border-slate-300 rounded-lg px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30"
    />
  );
}

function FieldDisplayValue({ def, value }) {
  if (!value && value !== "false") return <span className="text-slate-400">—</span>;
  if (def.fieldType === "BOOLEAN") {
    return <span>{value === "true" ? "Да" : "Нет"}</span>;
  }
  if (def.fieldType === "DATE") {
    try {
      return <span>{new Date(value).toLocaleDateString("ru-RU")}</span>;
    } catch {
      return <span>{value}</span>;
    }
  }
  return <span>{value}</span>;
}

const FIELD_TYPE_LABELS = { TEXT: "Текст", NUMBER: "Число", DATE: "Дата", BOOLEAN: "Да/Нет" };

function ManageDefsModal({ onClose, onChanged }) {
  const [defs, setDefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("TEXT");
  const [newRequired, setNewRequired] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  async function loadDefs() {
    setLoading(true);
    try {
      const res = await api("/api/organizations/custom-field-defs");
      const data = await res.json();
      setDefs(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDefs();
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api("/api/organizations/custom-field-defs", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          fieldType: newType,
          required: newRequired,
          order: defs.length,
        }),
      });
      setNewName("");
      setNewType("TEXT");
      setNewRequired(false);
      await loadDefs();
      onChanged();
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(defId) {
    await api(`/api/organizations/custom-field-defs/${defId}`, { method: "DELETE" });
    await loadDefs();
    onChanged();
  }

  async function handleSaveEdit(defId) {
    if (!editName.trim()) return;
    await api(`/api/organizations/custom-field-defs/${defId}`, {
      method: "PUT",
      body: JSON.stringify({ name: editName.trim() }),
    });
    setEditingId(null);
    await loadDefs();
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800">Управление полями</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : (
          <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
            {defs.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">Нет полей</p>
            )}
            {defs.map((def) => (
              <div
                key={def.id}
                className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50"
              >
                <GripVertical size={14} className="text-slate-300 shrink-0" />
                {editingId === def.id ? (
                  <>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 border border-slate-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveEdit(def.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                    <button
                      onClick={() => handleSaveEdit(def.id)}
                      className="p-1 text-green-600 hover:bg-green-50 rounded"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-slate-700">{def.name}</span>
                    <span className="text-xs text-slate-400 shrink-0">
                      {FIELD_TYPE_LABELS[def.fieldType]}
                    </span>
                    {def.required && <span className="text-xs text-red-400 shrink-0">*</span>}
                    <button
                      onClick={() => {
                        setEditingId(def.id);
                        setEditName(def.name);
                      }}
                      className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(def.id)}
                      className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-slate-200 pt-4">
          <p className="text-xs font-medium text-slate-500 mb-2">Добавить поле</p>
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              placeholder="Название"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 cursor-pointer"
            >
              {Object.entries(FIELD_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={newRequired}
                onChange={(e) => setNewRequired(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-[#6567F1] cursor-pointer"
              />
              Обяз.
            </label>
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white text-sm rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Добавить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CustomFieldsCard({
  organizationId,
  customFieldValues,
  canEdit,
  isAdmin,
  onDataChanged,
}) {
  const [defs, setDefs] = useState([]);
  const [defsLoading, setDefsLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [showManage, setShowManage] = useState(false);

  async function loadDefs() {
    setDefsLoading(true);
    try {
      const res = await api("/api/organizations/custom-field-defs");
      const data = await res.json();
      setDefs(data);
    } finally {
      setDefsLoading(false);
    }
  }

  useEffect(() => {
    loadDefs();
  }, []);

  function startEditing() {
    const initial = {};
    for (const def of defs) {
      const existing = customFieldValues.find((v) => v.fieldId === def.id);
      initial[def.id] = existing?.value ?? null;
    }
    setEditValues(initial);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setEditValues({});
  }

  async function handleSave() {
    setSaving(true);
    try {
      const values = Object.entries(editValues).map(([fieldId, value]) => ({ fieldId, value }));
      await api(`/api/organizations/${organizationId}/custom-fields`, {
        method: "PUT",
        body: JSON.stringify({ values }),
      });
      setEditing(false);
      setEditValues({});
      onDataChanged();
    } finally {
      setSaving(false);
    }
  }

  // Don't render if no defs and not admin
  if (!defsLoading && defs.length === 0 && !isAdmin) return null;

  return (
    <>
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800">Дополнительные поля</h2>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => setShowManage(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border-2 border-[#6567F1]/20 text-[#6567F1] hover:bg-[#6567F1]/5 rounded-lg transition-colors"
              >
                <Settings size={14} />
                Поля
              </button>
            )}
            {canEdit && !editing && defs.length > 0 && (
              <button
                onClick={startEditing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border-2 border-[#6567F1]/20 text-[#6567F1] hover:bg-[#6567F1]/5 rounded-lg transition-colors"
              >
                <Pencil size={14} />
                Редактировать
              </button>
            )}
            {editing && (
              <>
                <button
                  onClick={cancelEditing}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X size={16} />
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Сохранить
                </button>
              </>
            )}
          </div>
        </div>

        {defsLoading ? (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : defs.length === 0 ? (
          <p className="text-sm text-slate-400 py-2">Нет полей. Нажмите «Поля», чтобы добавить.</p>
        ) : (
          <div className="space-y-3">
            {defs.map((def) => {
              const existing = customFieldValues.find((v) => v.fieldId === def.id);
              const currentValue = editing ? editValues[def.id] : (existing?.value ?? null);

              return (
                <div key={def.id} className="flex items-center gap-3">
                  <span className="text-sm text-slate-500 w-40 shrink-0">
                    {def.name}
                    {def.required && <span className="text-red-400 ml-0.5">*</span>}
                  </span>
                  {editing ? (
                    <FieldInput
                      def={def}
                      value={currentValue}
                      onChange={(v) => setEditValues((prev) => ({ ...prev, [def.id]: v }))}
                    />
                  ) : (
                    <span className="text-sm text-slate-800">
                      <FieldDisplayValue def={def} value={currentValue} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showManage && (
        <ManageDefsModal
          onClose={() => setShowManage(false)}
          onChanged={() => {
            loadDefs();
            onDataChanged();
          }}
        />
      )}
    </>
  );
}
