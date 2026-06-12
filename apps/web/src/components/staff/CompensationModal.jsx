import { useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../../lib/api.js";
import Modal from "../ui/Modal.jsx";

/** Edits salary and tax of a staff member. */
export default function CompensationModal({ user: target, onClose, onSaved }) {
  const [salary, setSalary] = useState(target.salary != null ? String(target.salary) : "");
  const [tax, setTax] = useState(target.tax != null ? String(target.tax) : "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function parseInput(v) {
    const s = v.trim().replace(/\s+/g, "").replace(",", ".");
    if (s === "") return null;
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) return "invalid";
    return n;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const s = parseInput(salary);
    const t = parseInput(tax);
    if (s === "invalid" || t === "invalid") {
      setError("Суммы должны быть неотрицательными числами");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api(`/api/users/${target.id}/compensation`, {
        method: "PATCH",
        body: JSON.stringify({ salary: s, tax: t }),
      });
      if (res.ok) {
        onSaved();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Ошибка сохранения");
      }
    } catch {
      setError("Сетевая ошибка");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      size="sm"
      title={
        <div>
          <h2 className="text-lg font-bold text-heading">Зарплата и налог</h2>
          <p className="text-sm text-subtle mt-0.5">
            {target.lastName} {target.firstName}
          </p>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-body mb-1">Зарплата, ₽</label>
          <input
            type="text"
            inputMode="decimal"
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
            placeholder="0"
            className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-body mb-1">Налог, ₽</label>
          <input
            type="text"
            inputMode="decimal"
            value={tax}
            onChange={(e) => setTax(e.target.value)}
            placeholder="0"
            className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        {error && (
          <div className="text-sm text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-500/15 px-3 py-2 rounded-lg">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-body hover:text-heading transition-colors"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white shadow-lg shadow-[#6567F1]/30 transition-all disabled:opacity-50"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Сохранить
          </button>
        </div>
      </form>
    </Modal>
  );
}
