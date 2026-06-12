import { useState, useEffect } from "react";
import { Trash2, Download, Loader2, ChevronDown, ChevronRight, FileText } from "lucide-react";
import { api } from "../../lib/api.js";
import { money, ruDay } from "./bankConstants.js";

async function downloadStatement(stId, format) {
  try {
    const res = await api(`/api/statements/${stId}/download?format=${format}`);
    if (!res.ok) throw new Error("Не удалось скачать");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = format === "pdf" ? `statement-${stId}.pdf` : `kl_to_1c-${stId}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    alert(err.message);
  }
}

/** One statement row with lazily loaded operations table. */
function StatementRow({ st, canEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function toggleOps() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (accounts) return;
    setLoading(true);
    setErr("");
    try {
      const res = await api(`/api/statements/${st.id}`);
      if (!res.ok) throw new Error("Не удалось загрузить операции");
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch (e) {
      setErr(e.message);
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="text-xs">
      <div className="flex items-center justify-between gap-2 py-1">
        <button
          onClick={toggleOps}
          className="flex items-center gap-1.5 text-body hover:text-primary transition-colors truncate text-left"
          title={st.originalName}
        >
          {open ? (
            <ChevronDown size={12} className="shrink-0" />
          ) : (
            <ChevronRight size={12} className="shrink-0" />
          )}
          <FileText size={12} className="shrink-0" />
          <span className="font-medium">
            {ruDay(st.periodStart)} — {ruDay(st.periodEnd)}
          </span>
          <span className="text-subtle">· {st.docCount} опер.</span>
          {st.reconcileStatus !== "OK" && (
            <span className="text-amber-600 dark:text-amber-400">
              · расх. {money(Number(st.reconcileDiff ?? 0))} ₽
            </span>
          )}
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => downloadStatement(st.id, "txt")}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] uppercase tracking-wide bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors font-medium"
            title="Скачать в формате 1С (txt)"
          >
            <Download size={11} /> 1С
          </button>
          <button
            onClick={() => downloadStatement(st.id, "pdf")}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] uppercase tracking-wide bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors font-medium"
            title="Скачать PDF"
          >
            <Download size={11} /> PDF
          </button>
          {canEdit && (
            <button
              onClick={() => onDelete(st.id)}
              className="px-1 py-0.5 rounded text-subtle hover:text-red-500 dark:hover:text-red-400 transition-colors"
              title="Удалить выписку"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="ml-4 mt-1 mb-2 rounded border border-line bg-surface overflow-hidden">
          {loading && (
            <div className="flex items-center gap-2 p-2 text-subtle">
              <Loader2 size={12} className="animate-spin" /> Загрузка операций…
            </div>
          )}
          {err && <div className="p-2 text-red-500">{err}</div>}
          {!loading && !err && accounts?.length === 0 && (
            <div className="p-2 text-subtle">Нет данных</div>
          )}
          {!loading &&
            !err &&
            accounts?.map((a) =>
              a.operations.length === 0 ? (
                <div key={a.accountNumber} className="p-2 text-subtle text-center">
                  По счёту {a.accountNumber} операций нет
                </div>
              ) : (
                <table key={a.accountNumber} className="w-full border-collapse">
                  <thead className="bg-canvas">
                    <tr className="text-subtle">
                      <th className="text-left px-2 py-1 font-medium">Дата</th>
                      <th className="text-left px-2 py-1 font-medium">№</th>
                      <th className="text-left px-2 py-1 font-medium">Контрагент</th>
                      <th className="text-left px-2 py-1 font-medium">Назначение</th>
                      <th className="text-right px-2 py-1 font-medium">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.operations.map((op, i) => {
                      const cp = op.direction === "in" ? op.payerName : op.payeeName;
                      return (
                        <tr key={i} className="border-t border-line hover:bg-canvas/60">
                          <td className="px-2 py-1 whitespace-nowrap">{op.date}</td>
                          <td className="px-2 py-1 text-subtle">{op.number}</td>
                          <td className="px-2 py-1 truncate max-w-[200px]">{cp || "—"}</td>
                          <td className="px-2 py-1 truncate max-w-[300px] text-subtle">
                            {op.purpose || "—"}
                          </td>
                          <td
                            className={`px-2 py-1 text-right font-medium whitespace-nowrap ${
                              op.direction === "in"
                                ? "text-emerald-600 dark:text-emerald-300"
                                : "text-rose-600 dark:text-rose-300"
                            }`}
                          >
                            {op.direction === "in" ? "+" : "−"}
                            {money(op.amount)} ₽
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ),
            )}
        </div>
      )}
    </div>
  );
}

/**
 * Collapsible statements list of one bank account.
 * `refreshSignal` > 0 forces a reload + expand (used after a fresh fetch from the bank).
 */
export default function AccountStatements({
  organizationId,
  account,
  canEdit,
  onDataChanged,
  refreshSignal = 0,
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const res = await api(
        `/api/organizations/${organizationId}/bank-accounts/${account.id}/statements`,
      );
      if (!res.ok) throw new Error("Не удалось загрузить выписки");
      setItems(await res.json());
    } catch (e) {
      setErr(e.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (refreshSignal > 0) {
      setOpen(true);
      load();
    }
  }, [refreshSignal]);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!items) await load();
  }

  async function deleteStatement(stId) {
    if (!confirm("Удалить выписку? Действие нельзя отменить.")) return;
    try {
      const res = await api(`/api/statements/${stId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось удалить выписку");
      }
      await load();
      onDataChanged?.({ silent: true });
    } catch (err2) {
      alert(err2.message);
    }
  }

  if (!account.accountNumber) return null;

  return (
    <>
      <button
        onClick={toggle}
        className="mt-2 inline-flex items-center gap-1 text-xs text-subtle hover:text-primary transition-colors"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Выписки
        {items ? ` (${items.length})` : ""}
      </button>
      {open && (
        <div className="mt-2 pl-4 border-l-2 border-line space-y-1">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-subtle">
              <Loader2 size={12} className="animate-spin" /> Загрузка…
            </div>
          )}
          {err && <div className="text-xs text-red-500">{err}</div>}
          {!loading && !err && items?.length === 0 && (
            <div className="text-xs text-subtle">Выписок пока нет</div>
          )}
          {!loading &&
            items?.map((st) => (
              <StatementRow key={st.id} st={st} canEdit={canEdit} onDelete={deleteStatement} />
            ))}
        </div>
      )}
    </>
  );
}
