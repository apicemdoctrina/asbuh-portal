import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router";
import {
  ArrowLeft,
  Trash2,
  Save,
  RotateCcw,
  FileDown,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { api } from "../lib/api";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const money = (n) =>
  Number(n).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Контрагент = «другая сторона» относительно нашего счёта (зависит от направления)
function getCounterparty(op) {
  return op.direction === "in"
    ? { name: op.payerName, inn: op.payerInn }
    : { name: op.payeeName, inn: op.payeeInn };
}
function setCounterparty(op, field, value) {
  const key =
    op.direction === "in"
      ? field === "name"
        ? "payerName"
        : "payerInn"
      : field === "name"
        ? "payeeName"
        : "payeeInn";
  return { ...op, [key]: value || null };
}

function recAccount(acc) {
  const sumIn = round2(
    acc.operations
      .filter((o) => o.direction === "in")
      .reduce((s, o) => s + Number(o.amount || 0), 0),
  );
  const sumOut = round2(
    acc.operations
      .filter((o) => o.direction === "out")
      .reduce((s, o) => s + Number(o.amount || 0), 0),
  );
  const computed = round2(Number(acc.openingBalance || 0) + sumIn - sumOut);
  const declared = round2(acc.closingBalance);
  const ok = acc.hasClosing ? declared === computed : false;
  return { sumIn, sumOut, computed, declared, ok, diff: round2(declared - computed) };
}

export default function StatementEditPage() {
  const { id } = useParams();
  const [statement, setStatement] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    const res = await api(`/api/statements/${id}`);
    if (res.ok) {
      const data = await res.json();
      setStatement(data.statement);
      setAccounts(
        data.accounts.map((a) => ({
          ...a,
          openingBalance: String(a.openingBalance),
          closingBalance: String(a.closingBalance),
          operations: a.operations.map((o) => ({ ...o, amount: String(o.amount) })),
        })),
      );
      setDirty(false);
    } else {
      setError("Не удалось загрузить выписку");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

  function updateAccount(ai, patch) {
    setAccounts((prev) => prev.map((a, i) => (i === ai ? { ...a, ...patch } : a)));
    setDirty(true);
  }
  function updateOp(ai, oi, nextOp) {
    setAccounts((prev) =>
      prev.map((a, i) =>
        i === ai ? { ...a, operations: a.operations.map((o, j) => (j === oi ? nextOp : o)) } : a,
      ),
    );
    setDirty(true);
  }
  function deleteOp(ai, oi) {
    setAccounts((prev) =>
      prev.map((a, i) =>
        i === ai ? { ...a, operations: a.operations.filter((_, j) => j !== oi) } : a,
      ),
    );
    setDirty(true);
  }

  const live = useMemo(() => {
    const per = accounts.map(recAccount);
    return { per, ok: per.length > 0 && per.every((p) => p.ok) };
  }, [accounts]);

  async function save() {
    setSaving(true);
    setError(null);
    const payload = {
      accounts: accounts.map((a) => ({
        ...a,
        openingBalance: Number(a.openingBalance || 0),
        closingBalance: Number(a.closingBalance || 0),
        operations: a.operations.map((o) => ({ ...o, amount: Number(o.amount || 0) })),
      })),
    };
    const res = await api(`/api/statements/${id}/operations`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      await load();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Ошибка сохранения");
    }
    setSaving(false);
  }

  async function reset() {
    setSaving(true);
    const res = await api(`/api/statements/${id}/reset`, { method: "POST" });
    if (res.ok) await load();
    setSaving(false);
  }

  async function download(format) {
    const res = await api(`/api/statements/${id}/download?format=${format}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = format === "pdf" ? "statement.pdf" : "kl_to_1c.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  const inputCls =
    "rounded-md border border-line bg-surface text-body text-sm px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/40";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-subtle">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        to="/statements"
        className="inline-flex items-center gap-1 text-sm text-subtle hover:text-primary mb-4"
      >
        <ArrowLeft size={16} /> К списку выписок
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-heading">Редактирование выписки</h1>
          <p className="text-sm text-subtle mt-1">
            {statement?.organization?.name || "— не привязано —"} ·{" "}
            {statement?.bankName || "банк не указан"}
            {statement?.editedAt && " · правлено"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 text-sm font-medium ${
              live.ok ? "text-emerald-600 dark:text-emerald-300" : "text-red-600 dark:text-red-300"
            }`}
          >
            {live.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {live.ok ? "Остатки сходятся" : "Расхождение"}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30 text-sm">
          {error}
        </div>
      )}

      {accounts.map((acc, ai) => {
        const r = live.per[ai];
        return (
          <div
            key={acc.accountNumber + ai}
            className="bg-surface rounded-2xl shadow-lg border border-line mb-6 overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-line flex flex-wrap items-end gap-4">
              <div className="font-semibold text-body">Счёт {acc.accountNumber}</div>
              <label className="text-xs text-subtle">
                Нач. остаток
                <input
                  value={acc.openingBalance}
                  onChange={(e) => updateAccount(ai, { openingBalance: e.target.value })}
                  className={`${inputCls} block mt-0.5 w-32`}
                  inputMode="decimal"
                />
              </label>
              <label className="text-xs text-subtle">
                Кон. остаток
                <input
                  value={acc.closingBalance}
                  onChange={(e) => updateAccount(ai, { closingBalance: e.target.value })}
                  className={`${inputCls} block mt-0.5 w-32 ${
                    r.ok ? "" : "border-red-300 dark:border-red-500/50"
                  }`}
                  inputMode="decimal"
                />
              </label>
              <div className="text-xs text-subtle">
                Расчётный остаток:{" "}
                <span className="text-body font-medium">{money(r.computed)}</span>
                {!r.ok && (
                  <span className="text-red-600 dark:text-red-300"> · Δ {money(r.diff)}</span>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-subtle text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Дата</th>
                    <th className="px-3 py-2 font-medium">Тип</th>
                    <th className="px-3 py-2 font-medium">Сумма</th>
                    <th className="px-3 py-2 font-medium">Контрагент</th>
                    <th className="px-3 py-2 font-medium">ИНН</th>
                    <th className="px-3 py-2 font-medium">Назначение</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {acc.operations.map((op, oi) => {
                    const cp = getCounterparty(op);
                    return (
                      <tr key={oi} className="border-t border-line">
                        <td className="px-3 py-2">
                          <input
                            value={op.date}
                            onChange={(e) => updateOp(ai, oi, { ...op, date: e.target.value })}
                            className={`${inputCls} w-24`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={op.direction}
                            onChange={(e) => updateOp(ai, oi, { ...op, direction: e.target.value })}
                            className={inputCls}
                          >
                            <option value="in">Приход</option>
                            <option value="out">Расход</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={op.amount}
                            onChange={(e) => updateOp(ai, oi, { ...op, amount: e.target.value })}
                            className={`${inputCls} w-28 ${
                              op.direction === "in"
                                ? "text-emerald-600 dark:text-emerald-300"
                                : "text-red-600 dark:text-red-300"
                            }`}
                            inputMode="decimal"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={cp.name || ""}
                            onChange={(e) =>
                              updateOp(ai, oi, setCounterparty(op, "name", e.target.value))
                            }
                            className={`${inputCls} w-48`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={cp.inn || ""}
                            onChange={(e) =>
                              updateOp(ai, oi, setCounterparty(op, "inn", e.target.value))
                            }
                            className={`${inputCls} w-28`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={op.purpose || ""}
                            onChange={(e) =>
                              updateOp(ai, oi, { ...op, purpose: e.target.value || null })
                            }
                            className={`${inputCls} w-full min-w-[16rem]`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => deleteOp(ai, oi)}
                            title="Удалить операцию"
                            className="p-1.5 rounded-lg text-subtle hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {acc.operations.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-subtle">
                        Все операции удалены
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-3 sticky bottom-4">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white shadow-lg shadow-[#6567F1]/30 flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Сохранить правки
        </button>
        <button
          onClick={reset}
          disabled={saving}
          className="px-4 py-2 rounded-lg border-2 border-line text-body hover:bg-muted transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          <RotateCcw size={16} /> Сбросить к оригиналу
        </button>
        <div className="flex-1" />
        <button
          onClick={() => download("txt")}
          disabled={dirty}
          title={dirty ? "Сначала сохраните правки" : ""}
          className="px-4 py-2 rounded-lg border-2 border-primary/20 text-primary hover:bg-primary/5 flex items-center gap-2 disabled:opacity-50"
        >
          <FileDown size={16} /> .txt для 1С
        </button>
        <button
          onClick={() => download("pdf")}
          disabled={dirty}
          title={dirty ? "Сначала сохраните правки" : ""}
          className="px-4 py-2 rounded-lg border-2 border-primary/20 text-primary hover:bg-primary/5 flex items-center gap-2 disabled:opacity-50"
        >
          <FileText size={16} /> .pdf
        </button>
      </div>
    </div>
  );
}
