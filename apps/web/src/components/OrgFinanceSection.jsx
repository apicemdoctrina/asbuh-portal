import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Loader2,
  Upload,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ArrowDownCircle,
  ArrowUpCircle,
  Scale,
  Filter,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext.jsx";

const money = (n) =>
  Number(n).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const moneyShort = (n) => {
  const abs = Math.abs(Number(n));
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(Math.round(n));
};

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
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end sm:justify-between gap-3">
        <div className="grid grid-cols-2 sm:flex sm:items-end gap-2 sm:gap-3">
          <label className="text-xs text-subtle">
            С
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="block mt-0.5 w-full sm:w-auto rounded-md border border-line bg-surface text-body text-sm px-2 py-1"
            />
          </label>
          <label className="text-xs text-subtle">
            По
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="block mt-0.5 w-full sm:w-auto rounded-md border border-line bg-surface text-body text-sm px-2 py-1"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
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
            <label className="px-3 py-2 rounded-lg bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white shadow-lg shadow-[#6567F1]/30 flex items-center gap-2 cursor-pointer text-sm whitespace-nowrap">
              <input
                type="file"
                accept=".txt"
                className="hidden"
                onChange={onUpload}
                disabled={uploading}
              />
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              <span className="hidden sm:inline">Загрузить выписку</span>
              <span className="sm:hidden">Выписка</span>
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
          {/* KPI cards with gradients + glow + aurora */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <FinKpiCard
              label="Приход"
              value={s.totals.in}
              icon={ArrowDownCircle}
              palette={{
                main: "#10b981",
                accent: "#06b6d4",
                ring: "rgba(16,185,129,0.45)",
                gradFrom: "#10b981",
                gradTo: "#06b6d4",
              }}
            />
            <FinKpiCard
              label="Расход"
              value={s.totals.out}
              icon={ArrowUpCircle}
              palette={{
                main: "#ef4444",
                accent: "#fb7185",
                ring: "rgba(239,68,68,0.45)",
                gradFrom: "#fb7185",
                gradTo: "#ef4444",
              }}
            />
            <FinKpiCard
              label="Сальдо"
              value={s.totals.net}
              icon={Scale}
              palette={
                s.totals.net >= 0
                  ? {
                      main: "#6567F1",
                      accent: "#a855f7",
                      ring: "rgba(101,103,241,0.45)",
                      gradFrom: "#a855f7",
                      gradTo: "#6567F1",
                    }
                  : {
                      main: "#f59e0b",
                      accent: "#fbbf24",
                      ring: "rgba(245,158,11,0.45)",
                      gradFrom: "#fbbf24",
                      gradTo: "#f59e0b",
                    }
              }
            />
          </div>

          {/* Monthly dynamics chart — gradient bars + glow + hover */}
          <div className="relative bg-surface rounded-2xl border border-line p-4 overflow-hidden">
            <div
              className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-40 dark:opacity-30 blur-3xl"
              style={{ background: "radial-gradient(circle, #10b981 0%, transparent 70%)" }}
            />
            <div
              className="pointer-events-none absolute -bottom-12 -left-12 w-48 h-48 rounded-full opacity-30 dark:opacity-25 blur-3xl"
              style={{ background: "radial-gradient(circle, #ef4444 0%, transparent 70%)" }}
            />
            <div className="relative text-sm font-semibold text-body mb-3">Динамика по месяцам</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={s.byMonth} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="orgFinInGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.55} />
                  </linearGradient>
                  <linearGradient id="orgFinOutGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fb7185" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.55} />
                  </linearGradient>
                  {[
                    { id: "orgFinInGlow", color: "#10b981" },
                    { id: "orgFinOutGlow", color: "#ef4444" },
                  ].map(({ id, color }) => (
                    <filter key={id} id={id} x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="2.5" result="blur" />
                      <feFlood floodColor={color} floodOpacity="0.6" />
                      <feComposite in2="blur" operator="in" result="glow" />
                      <feMerge>
                        <feMergeNode in="glow" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  ))}
                  {[
                    { id: "orgFinInGlowHover", color: "#06b6d4" },
                    { id: "orgFinOutGlowHover", color: "#fb7185" },
                  ].map(({ id, color }) => (
                    <filter key={id} id={id} x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="7" result="blur" />
                      <feFlood floodColor={color} floodOpacity="0.9" />
                      <feComposite in2="blur" operator="in" result="glow" />
                      <feMerge>
                        <feMergeNode in="glow" />
                        <feMergeNode in="glow" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  ))}
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(148,163,184,0.25)"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={moneyShort}
                  width={52}
                />
                <Tooltip
                  formatter={(v) => `${money(v)} ₽`}
                  cursor={{ fill: "rgba(101,103,241,0.08)" }}
                  contentStyle={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-line)",
                    borderRadius: 12,
                    color: "var(--color-heading)",
                    fontSize: 12,
                    boxShadow: "0 6px 16px -4px rgba(0,0,0,0.35)",
                  }}
                  labelStyle={{ color: "var(--color-body)" }}
                />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="in"
                  name="Приход"
                  fill="url(#orgFinInGrad)"
                  radius={[6, 6, 0, 0]}
                  filter="url(#orgFinInGlow)"
                  animationDuration={900}
                  activeBar={{ filter: "url(#orgFinInGlowHover)", fill: "url(#orgFinInGrad)" }}
                />
                <Bar
                  dataKey="out"
                  name="Расход"
                  fill="url(#orgFinOutGrad)"
                  radius={[6, 6, 0, 0]}
                  filter="url(#orgFinOutGlow)"
                  animationDuration={900}
                  activeBar={{ filter: "url(#orgFinOutGlowHover)", fill: "url(#orgFinOutGrad)" }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            <TopList
              title="Топ по приходу"
              icon={TrendingUp}
              items={s.topIn}
              color="emerald"
              onItemClick={(it) => setOpSearch(it.inn || it.name || "")}
            />
            <TopList
              title="Топ по расходу"
              icon={TrendingDown}
              items={s.topOut}
              color="red"
              onItemClick={(it) => setOpSearch(it.inn || it.name || "")}
            />
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

function FinKpiCard({ label, value, icon: Icon, palette }) {
  return (
    <div className="relative bg-surface rounded-2xl border border-line p-4 overflow-hidden">
      <div
        className="pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-40 dark:opacity-30 blur-3xl"
        style={{ background: `radial-gradient(circle, ${palette.main} 0%, transparent 70%)` }}
      />
      <div
        className="pointer-events-none absolute top-0 left-0 bottom-0 w-1"
        style={{
          background: `linear-gradient(180deg, ${palette.gradFrom} 0%, ${palette.gradTo} 100%)`,
          boxShadow: `0 0 12px 0 ${palette.ring}`,
        }}
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-subtle uppercase tracking-wider font-medium">{label}</span>
          <div
            className="p-1.5 rounded-lg"
            style={{
              background: `${palette.main}22`,
              color: palette.main,
            }}
          >
            <Icon size={16} />
          </div>
        </div>
        <div
          className="text-lg sm:text-xl font-bold tabular-nums leading-tight break-words"
          style={{
            background: `linear-gradient(90deg, ${palette.gradFrom}, ${palette.gradTo})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {money(value)} ₽
        </div>
      </div>
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
        const hay =
          `${t.counterparty || ""} ${t.counterpartyInn || ""} ${t.purpose || ""}`.toLowerCase();
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

  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="bg-surface rounded-2xl border border-line overflow-hidden">
      <div className="px-3 sm:px-4 py-3 border-b border-line flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
        <div className="flex items-center justify-between sm:justify-start gap-2 sm:shrink-0">
          <div className="text-sm font-semibold text-body">Операции</div>
          {filterActive && (
            <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
              фильтр
            </span>
          )}
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className="sm:hidden ml-auto inline-flex items-center gap-1 px-2 py-1 border border-line rounded-md text-xs text-body"
            aria-expanded={filtersOpen}
          >
            <Filter size={12} />
            Фильтры
            {filtersOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
        <div
          className={`${filtersOpen ? "grid" : "hidden"} sm:flex sm:flex-1 sm:flex-wrap grid-cols-2 gap-2 items-center`}
        >
          <input
            type="text"
            placeholder="Контрагент, ИНН или назначение"
            value={opSearch}
            onChange={(e) => setOpSearch(e.target.value)}
            className="col-span-2 flex-1 min-w-[160px] px-2 py-1 rounded-md border border-line bg-canvas text-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
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
            className="sm:w-28 px-2 py-1 rounded-md border border-line bg-canvas text-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          <input
            type="number"
            inputMode="decimal"
            placeholder="до"
            value={opMax}
            onChange={(e) => setOpMax(e.target.value)}
            className="sm:w-24 px-2 py-1 rounded-md border border-line bg-canvas text-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
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
              className="col-span-2 sm:col-span-1 text-xs text-subtle hover:text-primary transition-colors"
            >
              Сбросить
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-8 text-center text-subtle text-sm">Ничего не найдено</div>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="sm:hidden divide-y divide-line">
            {visible.map((t) => {
              const isIn = t.direction === "IN";
              return (
                <div key={t.id} className="px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <div className="text-xs text-subtle tabular-nums">
                      {new Date(t.date).toLocaleDateString("ru-RU")}
                    </div>
                    <div
                      className={`text-sm font-bold tabular-nums whitespace-nowrap ${
                        isIn
                          ? "text-emerald-600 dark:text-emerald-300"
                          : "text-red-600 dark:text-red-300"
                      }`}
                    >
                      {isIn ? "+" : "−"}
                      {money(t.amount)} ₽
                    </div>
                  </div>
                  <div className="text-sm text-body truncate font-medium">
                    {t.counterparty || "—"}
                  </div>
                  {t.purpose && (
                    <div className="text-xs text-subtle line-clamp-2 mt-0.5">{t.purpose}</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop: full table */}
          <table className="hidden sm:table w-full text-sm">
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

const TOP_PREVIEW = 5;

function TopList({ title, icon: Icon, items, color, onItemClick }) {
  const [expanded, setExpanded] = useState(false);
  const isEmerald = color === "emerald";
  const cls = isEmerald
    ? "text-emerald-600 dark:text-emerald-300"
    : "text-red-600 dark:text-red-300";
  const auroraColor = isEmerald ? "#10b981" : "#ef4444";
  const visible = expanded ? items : items.slice(0, TOP_PREVIEW);
  const hasMore = items.length > TOP_PREVIEW;
  const max = items.length > 0 ? Math.max(...items.map((i) => Number(i.sum))) : 0;

  return (
    <div className="relative bg-surface rounded-2xl border border-line p-4 overflow-hidden">
      <div
        className="pointer-events-none absolute -top-10 -right-10 w-36 h-36 rounded-full opacity-30 dark:opacity-25 blur-3xl"
        style={{ background: `radial-gradient(circle, ${auroraColor} 0%, transparent 70%)` }}
      />
      <div className={`relative flex items-center gap-2 text-sm font-semibold mb-3 ${cls}`}>
        <Icon size={16} /> {title}
      </div>
      {items.length === 0 ? (
        <div className="text-subtle text-sm">—</div>
      ) : (
        <>
          <ul className="relative space-y-1">
            {visible.map((it, i) => {
              const pct = max > 0 ? (Number(it.sum) / max) * 100 : 0;
              return (
                <li
                  key={i}
                  onClick={() => onItemClick?.(it)}
                  className={`relative rounded px-2 -mx-2 py-1 ${
                    onItemClick ? "cursor-pointer hover:bg-primary/5" : ""
                  }`}
                  title={onItemClick ? "Показать все операции этого контрагента" : undefined}
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-r opacity-10"
                    style={{
                      width: `${pct}%`,
                      background: isEmerald
                        ? "linear-gradient(90deg, #10b981, #06b6d4)"
                        : "linear-gradient(90deg, #ef4444, #fb7185)",
                    }}
                  />
                  <div className="relative flex justify-between text-sm gap-2">
                    <span className="text-body truncate pr-2">{it.name}</span>
                    <span className={`font-semibold tabular-nums ${cls} whitespace-nowrap`}>
                      {money(it.sum)} ₽
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="relative mt-3 w-full text-xs text-primary hover:text-[#5557E1] transition-colors flex items-center justify-center gap-1"
            >
              {expanded ? (
                <>
                  <ChevronUp size={12} /> Свернуть
                </>
              ) : (
                <>
                  <ChevronDown size={12} /> Показать все ({items.length})
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}
