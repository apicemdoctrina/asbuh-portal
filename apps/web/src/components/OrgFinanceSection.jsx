import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Loader2,
  Upload,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext.jsx";

const money = (n) =>
  Number(n).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function OrgFinanceSection({ organizationId, financeVisibleToClient, onToggle }) {
  const { hasPermission } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null); // { ok, status, diff, id } | { error }
  const [opSearch, setOpSearch] = useState("");
  const [opMin, setOpMin] = useState("");
  const [opMax, setOpMax] = useState("");
  const [opFrom, setOpFrom] = useState("");
  const [opTo, setOpTo] = useState("");
  const [opExpanded, setOpExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    (async () => {
      try {
        const res = await api(`/api/organizations/${organizationId}/finance?${qs.toString()}`);
        if (!active) return;
        if (res.ok) setData(await res.json());
      } catch {
        // игнорируем сетевую ошибку — покажем пустое состояние
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [organizationId, from, to, reloadKey]);

  async function onUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("organizationId", organizationId);
      const res = await api("/api/statements", { method: "POST", body: fd });
      if (res.ok) {
        const body = await res.json();
        setUploadResult({
          ok: true,
          status: body.reconcile.status,
          diff: body.reconcile.totalDiff,
          id: body.statement.id,
        });
        setReloadKey((k) => k + 1); // обновить аналитику
      } else {
        const body = await res.json().catch(() => ({}));
        setUploadResult({ error: body.error || "Ошибка загрузки" });
      }
    } catch {
      setUploadResult({ error: "Сеть недоступна" });
    } finally {
      setUploading(false);
    }
  }

  const canEdit = hasPermission("organization", "edit");
  const canUpload = hasPermission("bank_statement", "create");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-subtle">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  const s = data?.summary;
  const empty = !s || s.count === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <label className="text-xs text-subtle">
            С
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="block mt-0.5 rounded-md border border-line bg-surface text-body text-sm px-2 py-1"
            />
          </label>
          <label className="text-xs text-subtle">
            По
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="block mt-0.5 rounded-md border border-line bg-surface text-body text-sm px-2 py-1"
            />
          </label>
        </div>
        <div className="flex items-center gap-4">
          {canEdit && (
            <label className="flex items-center gap-2 text-sm text-body cursor-pointer">
              <input
                type="checkbox"
                checked={!!financeVisibleToClient}
                onChange={(e) => onToggle(e.target.checked)}
              />
              Показывать клиенту
            </label>
          )}
          {canUpload && (
            <label className="px-3 py-2 rounded-lg bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white shadow-lg shadow-[#6567F1]/30 flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="file"
                accept=".txt"
                className="hidden"
                onChange={onUpload}
                disabled={uploading}
              />
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              Загрузить выписку
            </label>
          )}
        </div>
      </div>

      {uploadResult && (
        <div
          className={`p-3 rounded-xl text-sm border flex items-center gap-2 ${
            uploadResult.error
              ? "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30"
              : uploadResult.status === "OK"
                ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30"
                : "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30"
          }`}
        >
          {uploadResult.error ? (
            <>
              <AlertTriangle size={16} /> {uploadResult.error}
            </>
          ) : uploadResult.status === "OK" ? (
            <>
              <CheckCircle2 size={16} /> Выписка загружена, остатки сошлись.
            </>
          ) : (
            <>
              <AlertTriangle size={16} /> Выписка загружена, расхождение {money(uploadResult.diff)}{" "}
              ₽.
            </>
          )}
        </div>
      )}

      {empty ? (
        <div className="py-12 text-center text-subtle">Нет данных по выпискам</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-surface rounded-2xl border border-line p-4">
              <div className="text-xs text-subtle">Приход</div>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-300">
                {money(s.totals.in)} ₽
              </div>
            </div>
            <div className="bg-surface rounded-2xl border border-line p-4">
              <div className="text-xs text-subtle">Расход</div>
              <div className="text-xl font-bold text-red-600 dark:text-red-300">
                {money(s.totals.out)} ₽
              </div>
            </div>
            <div className="bg-surface rounded-2xl border border-line p-4">
              <div className="text-xs text-subtle">Сальдо</div>
              <div className="text-xl font-bold text-heading">{money(s.totals.net)} ₽</div>
            </div>
          </div>

          <div className="bg-surface rounded-2xl border border-line p-4">
            <div className="text-sm font-medium text-body mb-3">Динамика по месяцам</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={s.byMonth}>
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  formatter={(v) => `${money(v)} ₽`}
                  cursor={{ fill: "var(--color-muted)", fillOpacity: 0.5 }}
                  contentStyle={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-line)",
                    borderRadius: 12,
                    color: "var(--color-heading)",
                  }}
                  labelStyle={{ color: "var(--color-body)" }}
                />
                <Legend />
                <Bar dataKey="in" name="Приход" fill="#10b981" />
                <Bar dataKey="out" name="Расход" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TopList title="Топ по приходу" icon={TrendingUp} items={s.topIn} color="emerald" />
            <TopList title="Топ по расходу" icon={TrendingDown} items={s.topOut} color="red" />
          </div>

          <OperationsBlock
            transactions={data.transactions}
            opSearch={opSearch}
            setOpSearch={setOpSearch}
            opMin={opMin}
            setOpMin={setOpMin}
            opMax={opMax}
            setOpMax={setOpMax}
            opFrom={opFrom}
            setOpFrom={setOpFrom}
            opTo={opTo}
            setOpTo={setOpTo}
            opExpanded={opExpanded}
            setOpExpanded={setOpExpanded}
          />
        </>
      )}
    </div>
  );
}

const OPS_PREVIEW = 10;

function OperationsBlock({
  transactions,
  opSearch,
  setOpSearch,
  opMin,
  setOpMin,
  opMax,
  setOpMax,
  opFrom,
  setOpFrom,
  opTo,
  setOpTo,
  opExpanded,
  setOpExpanded,
}) {
  const filtered = useMemo(() => {
    const q = opSearch.trim().toLowerCase();
    const min = opMin === "" ? null : Number(opMin);
    const max = opMax === "" ? null : Number(opMax);
    const from = opFrom ? new Date(opFrom + "T00:00:00") : null;
    const to = opTo ? new Date(opTo + "T23:59:59") : null;
    return transactions.filter((t) => {
      if (q) {
        const hay = `${t.counterparty || ""} ${t.purpose || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const amt = Number(t.amount);
      if (min !== null && amt < min) return false;
      if (max !== null && amt > max) return false;
      if (from || to) {
        const d = new Date(t.date);
        if (from && d < from) return false;
        if (to && d > to) return false;
      }
      return true;
    });
  }, [transactions, opSearch, opMin, opMax, opFrom, opTo]);

  const visible = opExpanded ? filtered : filtered.slice(0, OPS_PREVIEW);
  const hasMore = filtered.length > OPS_PREVIEW;
  const filterActive = opSearch || opMin || opMax || opFrom || opTo;

  return (
    <div className="bg-surface rounded-2xl border border-line overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex flex-wrap items-center gap-2">
        <div className="text-sm font-medium text-body shrink-0 mr-1">Операции</div>
        <input
          type="text"
          placeholder="Контрагент или назначение"
          value={opSearch}
          onChange={(e) => setOpSearch(e.target.value)}
          className="flex-1 min-w-[180px] px-2 py-1 rounded-md border border-line bg-canvas text-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
        <input
          type="date"
          title="С даты"
          value={opFrom}
          onChange={(e) => setOpFrom(e.target.value)}
          className="px-2 py-1 rounded-md border border-line bg-canvas text-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
        <input
          type="date"
          title="По дату"
          value={opTo}
          onChange={(e) => setOpTo(e.target.value)}
          className="px-2 py-1 rounded-md border border-line bg-canvas text-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
        <input
          type="number"
          inputMode="decimal"
          placeholder="Сумма от"
          value={opMin}
          onChange={(e) => setOpMin(e.target.value)}
          className="w-28 px-2 py-1 rounded-md border border-line bg-canvas text-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
        <input
          type="number"
          inputMode="decimal"
          placeholder="до"
          value={opMax}
          onChange={(e) => setOpMax(e.target.value)}
          className="w-24 px-2 py-1 rounded-md border border-line bg-canvas text-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
        {filterActive && (
          <button
            type="button"
            onClick={() => {
              setOpSearch("");
              setOpMin("");
              setOpMax("");
              setOpFrom("");
              setOpTo("");
            }}
            className="text-xs text-subtle hover:text-primary transition-colors"
          >
            Сбросить
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="py-8 text-center text-subtle text-sm">Ничего не найдено</div>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead className="bg-muted text-subtle text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Дата</th>
                <th className="px-4 py-2 font-medium">Контрагент</th>
                <th className="px-4 py-2 font-medium">Назначение</th>
                <th className="px-4 py-2 font-medium text-right">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr key={t.id} className="border-t border-line text-body">
                  <td className="px-4 py-2 whitespace-nowrap">
                    {new Date(t.date).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="px-4 py-2">{t.counterparty || "—"}</td>
                  <td className="px-4 py-2 text-subtle">{t.purpose || ""}</td>
                  <td
                    className={`px-4 py-2 text-right whitespace-nowrap ${
                      t.direction === "IN"
                        ? "text-emerald-600 dark:text-emerald-300"
                        : "text-red-600 dark:text-red-300"
                    }`}
                  >
                    {t.direction === "IN" ? "+" : "−"}
                    {money(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasMore && (
            <button
              type="button"
              onClick={() => setOpExpanded((v) => !v)}
              className="w-full px-4 py-2 border-t border-line text-sm text-primary hover:bg-primary/5 transition-colors flex items-center justify-center gap-1.5"
            >
              {opExpanded ? (
                <>
                  <ChevronUp size={14} /> Свернуть
                </>
              ) : (
                <>
                  <ChevronDown size={14} /> Показать все ({filtered.length})
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function TopList({ title, icon: Icon, items, color }) {
  const cls =
    color === "emerald"
      ? "text-emerald-600 dark:text-emerald-300"
      : "text-red-600 dark:text-red-300";
  return (
    <div className="bg-surface rounded-2xl border border-line p-4">
      <div className={`flex items-center gap-2 text-sm font-medium mb-3 ${cls}`}>
        <Icon size={16} /> {title}
      </div>
      {items.length === 0 ? (
        <div className="text-subtle text-sm">—</div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="flex justify-between text-sm">
              <span className="text-body truncate pr-2">{it.name}</span>
              <span className={`font-medium ${cls}`}>{money(it.sum)} ₽</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
