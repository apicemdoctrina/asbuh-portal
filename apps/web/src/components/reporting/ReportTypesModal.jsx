import { useState, useEffect } from "react";
import { api } from "../../lib/api.js";
import { useApi, jsonFetcher } from "../../hooks/useApi.js";
import Modal from "../ui/Modal.jsx";
import { Loader2, Plus, Pencil, Trash2, Save } from "lucide-react";
import { FREQUENCY_LABELS, FREQUENCY_OPTIONS } from "./reportingHelpers.js";

export default function ReportTypesModal({ onClose, onSaved }) {
  const {
    data: typesData,
    loading,
    refetch: loadTypes,
  } = useApi(
    jsonFetcher(() => api("/api/reporting/types")),
    [],
  );
  const types = typesData ?? [];
  const [form, setForm] = useState(null); // null = closed, {} = new/edit

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function handleSave() {
    const method = form.id ? "PUT" : "POST";
    const url = form.id ? `/api/reporting/types/${form.id}` : "/api/reporting/types";
    const res = await api(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        code: form.code,
        frequency: form.frequency,
        order: Number(form.order) || 0,
        isActive: form.isActive !== false,
      }),
    });
    if (res.ok) {
      setForm(null);
      loadTypes();
      onSaved?.();
    }
  }

  async function handleDelete(id) {
    if (!confirm("Удалить тип отчёта?")) return;
    const res = await api(`/api/reporting/types/${id}`, { method: "DELETE" });
    if (res.ok) {
      loadTypes();
      onSaved?.();
    }
  }

  return (
    <Modal
      onClose={onClose}
      title="Типы отчётов"
      size="2xl"
      sheet
      bodyClassName="p-4 sm:p-6"
      footer={
        <button
          onClick={() =>
            setForm({
              name: "",
              code: "",
              frequency: "QUARTERLY",
              order: types.length + 1,
              isActive: true,
            })
          }
          className="mr-auto flex items-center gap-1.5 text-sm text-primary font-medium hover:text-[#4547D1] transition-colors"
        >
          <Plus size={16} />
          Добавить тип
        </button>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-16 text-subtle">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {types.map((t) => (
            <div
              key={t.id}
              className="flex items-start gap-2 p-3 rounded-lg border border-line transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-heading break-words leading-snug">{t.name}</div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span className="text-[11px] text-subtle bg-muted rounded px-1.5 py-0.5 font-mono">
                    {t.code}
                  </span>
                  <span
                    className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${t.isActive ? "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300" : "bg-muted text-subtle"}`}
                  >
                    {t.isActive ? "Активен" : "Выключен"}
                  </span>
                  <span className="text-[11px] text-subtle">
                    {FREQUENCY_LABELS[t.frequency]} · №{t.order}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => setForm({ ...t })}
                  className="p-2 rounded-lg text-subtle hover:text-primary hover:bg-primary/5 transition-colors"
                  aria-label="Редактировать"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="p-2 rounded-lg text-subtle hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors"
                  aria-label="Удалить"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit form */}
      {form !== null && (
        <div className="mt-4 p-4 rounded-xl border-2 border-primary/20 bg-primary/5 space-y-3">
          <h3 className="text-sm font-semibold text-heading">
            {form.id ? "Редактировать" : "Новый тип"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              className="border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Название"
              value={form.name || ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              className="border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Код (уникальный)"
              value={form.code || ""}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            <select
              className="border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={form.frequency || "QUARTERLY"}
              onChange={(e) => setForm({ ...form, frequency: e.target.value })}
            >
              {FREQUENCY_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_LABELS[f]}
                </option>
              ))}
            </select>
            <input
              type="number"
              className="border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Порядок"
              value={form.order ?? 0}
              onChange={(e) => setForm({ ...form, order: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-body">
            <input
              type="checkbox"
              checked={form.isActive !== false}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="rounded border-line"
            />
            Активен
          </label>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white text-sm font-medium shadow-lg shadow-[#6567F1]/30 transition-all"
            >
              <Save size={14} />
              Сохранить
            </button>
            <button
              onClick={() => setForm(null)}
              className="px-4 py-2 rounded-lg text-sm text-body hover:bg-muted transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
