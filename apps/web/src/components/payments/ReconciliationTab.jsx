import { useState, useEffect, Fragment } from "react";
import { Link } from "react-router";
import { Calculator, Scale } from "lucide-react";
import { api } from "../../lib/api.js";
import { fmt } from "./paymentsConstants.js";
import NoteCell from "./NoteCell.jsx";
import ReconcileSummaryCards from "./ReconcileSummaryCards.jsx";

/** Full reconciliation of bank payments since 01.01.2025, with client-group rollups. */
export default function ReconciliationTab() {
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState({ expected: 0, received: 0, debt: 0, debtorCount: 0 });
  const [reconciling, setReconciling] = useState(false);
  const [done, setDone] = useState(false);
  const [filter, setFilter] = useState("all"); // all | debtors | paid
  const [sortBy, setSortBy] = useState("debt"); // alpha | debt
  const [sectionFilter, setSectionFilter] = useState(""); // "" = all sections

  const [writingOff, setWritingOff] = useState(null); // orgId or groupId being written off

  useEffect(() => {
    handleReconcile();
  }, []);

  async function handleWriteOff(orgId, groupId) {
    const target = groupId || orgId;
    if (!confirm("Выполнить взаимозачёт? Баланс будет обнулён.")) return;
    setWritingOff(target);
    try {
      const body = groupId ? { groupId } : { organizationId: orgId };
      const res = await api("/api/payments/write-off", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
    setReconciling(true);
    try {
      const res = await api("/api/payments/reconcile", {
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
      setReconciling(false);
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
    const base = results
      .filter((r) => {
        if (filter === "debtors") return r.groupId ? (r.groupDebt ?? 0) > 0 : r.debt > 0;
        if (filter === "paid") return r.groupId ? (r.groupDebt ?? 0) === 0 : r.debt === 0;
        return true;
      })
      .filter((r) => {
        if (!sectionFilter) return true;
        return r.sectionId === sectionFilter;
      });
    // Sort then group: when an org has a group,
    // place all group members right after the first alphabetical member
    const sorted = [...base].sort((a, b) => {
      if (sortBy === "debt") {
        const debtA = a.groupId ? (a.groupDebt ?? 0) : a.debt;
        const debtB = b.groupId ? (b.groupDebt ?? 0) : b.debt;
        if (debtA !== debtB) return debtB - debtA; // descending by debt
      }
      return a.orgName.localeCompare(b.orgName, "ru");
    });
    const grouped = [];
    const placed = new Set();
    for (const r of sorted) {
      if (placed.has(r.orgId)) continue;
      placed.add(r.orgId);
      grouped.push(r);
      if (r.groupId) {
        // Add remaining group members right after
        for (const g of sorted) {
          if (g.groupId === r.groupId && !placed.has(g.orgId)) {
            placed.add(g.orgId);
            grouped.push(g);
          }
        }
      }
    }
    return grouped;
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
        <button
          onClick={handleReconcile}
          disabled={reconciling}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white rounded-lg text-sm font-medium shadow-lg shadow-[#6567F1]/30 hover:from-[#5557E1] hover:to-[#4547D1] disabled:opacity-50"
        >
          <Calculator size={16} className={reconciling ? "animate-spin" : ""} />
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
        {done && <span className="text-xs text-subtle">Расчёт с 01.01.2025 по текущий месяц</span>}
      </div>

      {done && (
        <>
          <ReconcileSummaryCards summary={summary} />

          {/* Results table */}
          {filtered.length === 0 ? (
            <div className="text-subtle text-sm py-8 text-center">Нет данных</div>
          ) : (
            <div className="bg-surface rounded-2xl shadow-lg border border-line overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-canvas/50">
                    <th className="text-left px-4 py-3 font-medium text-subtle">Организация</th>
                    <th className="text-right px-4 py-3 font-medium text-subtle">Ожидалось</th>
                    <th className="text-right px-4 py-3 font-medium text-subtle">Поступило</th>
                    <th className="text-right px-4 py-3 font-medium text-subtle">Баланс</th>
                    <th className="text-left px-4 py-3 font-medium text-subtle">Примечание</th>
                    <th className="px-4 py-3 w-[50px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    const isGroupStart =
                      r.groupId && (i === 0 || filtered[i - 1]?.groupId !== r.groupId);
                    const isInGroup = !!r.groupId;
                    const isGroupEnd =
                      r.groupId &&
                      (i === filtered.length - 1 || filtered[i + 1]?.groupId !== r.groupId);

                    return (
                      <Fragment key={r.orgId}>
                        {isGroupStart && (
                          <tr
                            key={`gh-${r.groupId}`}
                            className="bg-amber-50/80 dark:bg-amber-500/15 border-b border-amber-200 dark:border-amber-500/30"
                          >
                            <td className="px-4 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                              <Link to={`/client-groups/${r.groupId}`} className="hover:underline">
                                {r.groupName || "Группа"}
                              </Link>
                              <span className="ml-2 text-amber-500 dark:text-amber-400 font-normal">
                                {filtered.filter((x) => x.groupId === r.groupId).length} орг.
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right text-xs font-semibold text-amber-700 dark:text-amber-300">
                              {fmt(r.groupExpected)}
                            </td>
                            <td className="px-4 py-2 text-right text-xs font-semibold text-green-700 dark:text-green-300">
                              {fmt(r.groupReceived)}
                            </td>
                            <td
                              className={`px-4 py-2 text-right text-xs font-semibold ${(r.groupExpected ?? 0) !== (r.groupReceived ?? 0) ? ((r.groupDebt ?? 0) > 0 ? "text-red-600 dark:text-red-300" : "text-blue-600 dark:text-blue-300") : "text-amber-700 dark:text-amber-300"}`}
                            >
                              {(() => {
                                const diff = (r.groupExpected ?? 0) - (r.groupReceived ?? 0);
                                if (diff > 0) return fmt(diff);
                                if (diff < 0) return "+" + fmt(Math.abs(diff));
                                return "—";
                              })()}
                            </td>
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2">
                              {(r.groupExpected ?? 0) !== (r.groupReceived ?? 0) && (
                                <button
                                  onClick={() => handleWriteOff(null, r.groupId)}
                                  disabled={writingOff === r.groupId}
                                  className="p-1 text-subtle hover:text-primary hover:bg-primary/10 rounded transition-colors"
                                  title="Взаимозачёт"
                                >
                                  <Scale size={14} />
                                </button>
                              )}
                            </td>
                          </tr>
                        )}
                        <tr
                          key={r.orgId}
                          className={`border-b hover:bg-canvas/50 ${isInGroup ? "bg-amber-50/30 dark:bg-amber-500/15 border-amber-100 dark:border-amber-500/30" : "border-line"} ${isGroupEnd ? "border-b-2 border-b-amber-200" : ""}`}
                        >
                          <td className={`py-3 ${isInGroup ? "pl-8 pr-4" : "px-4"}`}>
                            <Link
                              to={`/organizations/${r.orgId}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {r.orgName}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isInGroup ? (
                              <span className="text-subtle">{fmt(r.expected)}</span>
                            ) : (
                              fmt(r.expected)
                            )}
                          </td>
                          {isInGroup ? (
                            <>
                              <td className="px-4 py-3"></td>
                              <td className="px-4 py-3"></td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3 text-right text-green-600 dark:text-green-300 font-medium">
                                {fmt(r.received)}
                              </td>
                              <td className="px-4 py-3 text-right font-medium">
                                {(() => {
                                  const diff = r.expected - r.received;
                                  if (diff > 0)
                                    return (
                                      <span className="text-red-600 dark:text-red-300">
                                        {fmt(diff)}
                                      </span>
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
                            </>
                          )}
                          <td className="px-4 py-3">
                            <NoteCell orgId={r.orgId} initialNote={r.paymentNote} />
                          </td>
                          <td className="px-4 py-3">
                            {!isInGroup && r.expected !== r.received && (
                              <button
                                onClick={() => handleWriteOff(r.orgId, null)}
                                disabled={writingOff === r.orgId}
                                className="p-1 text-subtle hover:text-primary hover:bg-primary/10 rounded transition-colors"
                                title="Взаимозачёт"
                              >
                                <Scale size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!done && !reconciling && (
        <div className="text-subtle text-sm py-8 text-center">
          Нажмите «Пересчитать» для сверки всех оплат с 01.01.2025
        </div>
      )}
    </div>
  );
}
