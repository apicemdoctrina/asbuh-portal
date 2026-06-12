import { useState, useEffect, Fragment } from "react";
import { Link } from "react-router";
import { Check, X as XIcon, Calculator, Plus, Scale } from "lucide-react";
import { api } from "../../lib/api.js";
import { DEST_LABELS, DEST_COLORS, fmt } from "./paymentsConstants.js";
import NoteCell from "./NoteCell.jsx";
import ReconcileSummaryCards from "./ReconcileSummaryCards.jsx";

/** Reconciliation of cash/card payments with inline manual payment entry. */
export default function CashCardTab() {
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState({ expected: 0, received: 0, debt: 0, debtorCount: 0 });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("debt");
  const [sectionFilter, setSectionFilter] = useState("");
  const [adding, setAdding] = useState(null); // orgId being added
  const [addForm, setAddForm] = useState({ amount: "", date: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [writingOff, setWritingOff] = useState(null);

  useEffect(() => {
    handleReconcile();
  }, []);

  async function handleWriteOff(orgId) {
    if (!confirm("Выполнить взаимозачёт? Баланс будет обнулён.")) return;
    setWritingOff(orgId);
    try {
      const res = await api("/api/payments/write-off", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });
      if (!res.ok) throw new Error();
      handleReconcile();
    } catch {
      /* */
    } finally {
      setWritingOff(null);
    }
  }

  async function handleReconcile() {
    setLoading(true);
    try {
      const res = await api("/api/payments/reconcile-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setResults(data.results);
      setSummary({
        expected: data.totalExpected,
        received: data.totalReceived,
        debt: data.totalDebt,
        debtorCount: data.debtorCount,
      });
      setDone(true);
    } catch {
      /* */
    } finally {
      setLoading(false);
    }
  }

  async function handleAddPayment(orgId) {
    if (!addForm.amount || !addForm.date) return;
    setSaving(true);
    try {
      const res = await api("/api/payments/transactions/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(addForm.amount),
          date: addForm.date,
          organizationId: orgId,
          purpose: addForm.note || "Оплата нал/карта",
        }),
      });
      if (!res.ok) throw new Error();
      setAdding(null);
      setAddForm({ amount: "", date: "", note: "" });
      handleReconcile();
    } catch {
      /* */
    } finally {
      setSaving(false);
    }
  }

  const sections = (() => {
    const map = new Map();
    for (const r of results) {
      if (r.sectionId && !map.has(r.sectionId)) map.set(r.sectionId, r.sectionName);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "ru"));
  })();

  const filtered = (() => {
    return results
      .filter((r) => {
        if (filter === "debtors") return r.debt > 0;
        if (filter === "paid") return r.debt === 0;
        return true;
      })
      .filter((r) => !sectionFilter || r.sectionId === sectionFilter)
      .sort((a, b) => {
        if (sortBy === "debt" && a.debt !== b.debt) return b.debt - a.debt;
        return a.orgName.localeCompare(b.orgName, "ru");
      });
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
        <button
          onClick={handleReconcile}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white rounded-lg text-sm font-medium shadow-lg shadow-[#6567F1]/30 hover:from-[#5557E1] hover:to-[#4547D1] disabled:opacity-50"
        >
          <Calculator size={16} className={loading ? "animate-spin" : ""} />
          Пересчитать
        </button>
        {done && (
          <>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-3 py-2 border border-line rounded-lg text-sm bg-surface"
            >
              <option value="all">Все ({results.length})</option>
              <option value="debtors">Должники ({summary.debtorCount})</option>
              <option value="paid">Без долга ({results.length - summary.debtorCount})</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 border border-line rounded-lg text-sm bg-surface"
            >
              <option value="debt">Сначала с долгом</option>
              <option value="alpha">По алфавиту</option>
            </select>
            {sections.length > 0 && (
              <select
                value={sectionFilter}
                onChange={(e) => setSectionFilter(e.target.value)}
                className="px-3 py-2 border border-line rounded-lg text-sm bg-surface"
              >
                <option value="">Все участки</option>
                {sections.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
      </div>

      {done && (
        <>
          <ReconcileSummaryCards summary={summary} />

          {filtered.length === 0 ? (
            <div className="text-subtle text-sm py-8 text-center">Нет данных</div>
          ) : (
            <div className="bg-surface rounded-2xl shadow-lg border border-line overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-canvas/50">
                    <th className="text-left px-4 py-3 font-medium text-subtle">Организация</th>
                    <th className="text-left px-4 py-3 font-medium text-subtle w-[90px]">Способ</th>
                    <th className="text-right px-4 py-3 font-medium text-subtle">Ожидалось</th>
                    <th className="text-right px-4 py-3 font-medium text-subtle">Поступило</th>
                    <th className="text-right px-4 py-3 font-medium text-subtle">Баланс</th>
                    <th className="text-left px-4 py-3 font-medium text-subtle">Примечание</th>
                    <th className="px-4 py-3 w-[100px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <Fragment key={r.orgId}>
                      <tr className="border-b border-line hover:bg-canvas/50">
                        <td className="px-4 py-3">
                          <Link
                            to={`/organizations/${r.orgId}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {r.orgName}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${DEST_COLORS[r.paymentDestination] || "bg-muted text-subtle"}`}
                          >
                            {DEST_LABELS[r.paymentDestination] || r.paymentDestination}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">{fmt(r.expected)}</td>
                        <td className="px-4 py-3 text-right text-green-600 dark:text-green-300 font-medium">
                          {fmt(r.received)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {(() => {
                            const diff = r.expected - r.received;
                            if (diff > 0)
                              return (
                                <span className="text-red-600 dark:text-red-300">{fmt(diff)}</span>
                              );
                            if (diff < 0)
                              return (
                                <span className="text-blue-600 dark:text-blue-300">
                                  +{fmt(Math.abs(diff))}
                                </span>
                              );
                            return <span className="text-subtle">—</span>;
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          <NoteCell orgId={r.orgId} initialNote={r.paymentNote} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {r.expected !== r.received && (
                              <button
                                onClick={() => handleWriteOff(r.orgId)}
                                disabled={writingOff === r.orgId}
                                className="p-1 text-subtle hover:text-primary hover:bg-primary/10 rounded transition-colors"
                                title="Взаимозачёт"
                              >
                                <Scale size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setAdding(adding === r.orgId ? null : r.orgId);
                                setAddForm({
                                  amount: "",
                                  date: new Date().toISOString().slice(0, 10),
                                  note: "",
                                });
                              }}
                              className="p-1 text-primary hover:bg-primary/10 rounded"
                              title="Внести оплату"
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {adding === r.orgId && (
                        <tr className="border-b border-line bg-canvas/80">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="flex items-center gap-3 flex-wrap">
                              <input
                                type="number"
                                placeholder="Сумма"
                                value={addForm.amount}
                                onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })}
                                className="w-32 px-3 py-1.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                autoFocus
                              />
                              <input
                                type="date"
                                value={addForm.date}
                                onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
                                className="px-3 py-1.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                              />
                              <input
                                type="text"
                                placeholder="Комментарий (необязательно)"
                                value={addForm.note}
                                onChange={(e) => setAddForm({ ...addForm, note: e.target.value })}
                                className="w-48 px-3 py-1.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                              />
                              <button
                                onClick={() => handleAddPayment(r.orgId)}
                                disabled={saving || !addForm.amount || !addForm.date}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white rounded-lg text-sm font-medium shadow-sm hover:from-[#5557E1] hover:to-[#4547D1] disabled:opacity-50"
                              >
                                <Check size={14} />
                                Сохранить
                              </button>
                              <button
                                onClick={() => setAdding(null)}
                                className="p-1.5 text-subtle hover:text-body hover:bg-muted rounded-lg"
                              >
                                <XIcon size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!done && !loading && (
        <div className="text-subtle text-sm py-8 text-center">
          Нажмите «Пересчитать» для сверки оплат наличными и картой с 01.01.2026
        </div>
      )}
    </div>
  );
}
