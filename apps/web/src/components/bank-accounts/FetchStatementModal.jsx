import { useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { api } from "../../lib/api.js";
import Modal from "../ui/Modal.jsx";
import { money, isoDay, firstDayOfMonth } from "./bankConstants.js";

/** Забор выписки из банка по API за период. После сохранения показывает результат сверки. */
export default function FetchStatementModal({ organizationId, acc, onClose, onSaved }) {
  const [start, setStart] = useState(acc.lastFetchAt ? isoDay(acc.lastFetchAt) : firstDayOfMonth());
  const [end, setEnd] = useState(isoDay(Date.now()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(null); // { status, diff, id, docCount }

  async function runSave() {
    setBusy(true);
    setError("");
    try {
      const res = await api("/api/statements/fetch", {
        method: "POST",
        body: JSON.stringify({
          organizationId,
          bankAccountId: acc.id,
          start,
          end,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ошибка запроса к банку");
      setSaved({
        status: data.reconcile.status,
        diff: data.reconcile.totalDiff,
        id: data.statement.id,
        docCount: data.statement.docCount ?? 0,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      onClose={() => {
        if (!busy) onClose();
      }}
      title={`Выписка из банка: ${acc.bankName}`}
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border-2 border-primary/20 text-primary hover:bg-primary/5 rounded-lg text-sm font-medium transition-colors"
            disabled={busy}
          >
            {saved ? "Закрыть" : "Отмена"}
          </button>
          {!saved && (
            <button
              type="button"
              onClick={runSave}
              disabled={busy}
              className="px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50 inline-flex items-center gap-2"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              Сохранить файл
            </button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-3">
          <label className="text-xs text-subtle">
            С
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="block mt-0.5 rounded-md border border-line bg-surface text-body text-sm px-2 py-1"
            />
          </label>
          <label className="text-xs text-subtle">
            По
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="block mt-0.5 rounded-md border border-line bg-surface text-body text-sm px-2 py-1"
            />
          </label>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg text-sm flex items-center gap-2">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {saved && (
          <div
            className={`p-3 rounded-lg text-sm border ${
              saved.docCount === 0
                ? "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30"
                : saved.status === "OK"
                  ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30"
                  : "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30"
            }`}
          >
            <div className="flex items-center gap-2">
              {saved.docCount === 0 ? (
                <>
                  <AlertTriangle size={16} /> Выписка сохранена, но операций за период нет.
                </>
              ) : saved.status === "OK" ? (
                <>
                  <CheckCircle2 size={16} /> Сохранено {saved.docCount} операций, сверка сошлась.
                </>
              ) : (
                <>
                  <AlertTriangle size={16} /> Сохранено {saved.docCount} операций, расхождение{" "}
                  {money(saved.diff)} ₽.
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
