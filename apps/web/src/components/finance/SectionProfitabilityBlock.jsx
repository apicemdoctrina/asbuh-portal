import { Map } from "lucide-react";
import { fmt, MarginBadge } from "./financeShared.jsx";

/** Per-section revenue vs payroll bars + margin table. */
export default function SectionProfitabilityBlock({ sectionProfitability }) {
  if (sectionProfitability.length === 0) return null;

  return (
    <div className="bg-surface rounded-2xl shadow-lg border border-line overflow-hidden">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-line flex items-center gap-2">
        <Map size={16} className="text-subtle shrink-0" />
        <h2 className="text-sm sm:text-base font-semibold text-heading">Маржинальность участков</h2>
        <span className="hidden sm:inline text-xs text-subtle ml-1">
          Выручка vs ФОТ (активные организации)
        </span>
      </div>
      <div className="relative px-4 sm:px-6 py-4 space-y-3 border-b border-line overflow-hidden">
        <div
          className="pointer-events-none absolute -top-12 -right-12 w-56 h-56 rounded-full opacity-30 dark:opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, #a855f7 0%, transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-16 -left-16 w-56 h-56 rounded-full opacity-25 dark:opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, #fb7185 0%, transparent 70%)" }}
        />
        {sectionProfitability.map((s) => {
          const maxRev = Math.max(...sectionProfitability.map((x) => x.revenue), 1);
          const revPct = (s.revenue / maxRev) * 100;
          const payPct = (s.payroll / maxRev) * 100;
          return (
            <div key={s.sectionId} className="relative group">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-body">
                  №{s.number}
                  {s.name ? ` — ${s.name}` : ""}
                </span>
                <MarginBadge margin={s.margin} />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 bg-primary/10 dark:bg-primary/15 rounded-full overflow-visible flex-1 relative">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${revPct}%`,
                        background: "linear-gradient(90deg, #a855f7 0%, #6567F1 60%, #06b6d4 100%)",
                        boxShadow: "0 0 8px rgba(101,103,241,0.55), 0 0 16px rgba(168,85,247,0.35)",
                      }}
                    />
                  </div>
                  <span className="text-xs text-subtle w-20 sm:w-24 text-right tabular-nums">
                    {fmt(s.revenue)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2.5 bg-red-100/60 dark:bg-red-500/10 rounded-full overflow-visible flex-1 relative">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${payPct}%`,
                        background: "linear-gradient(90deg, #fbbf24 0%, #fb7185 60%, #ef4444 100%)",
                        boxShadow: "0 0 8px rgba(251,113,133,0.55), 0 0 16px rgba(239,68,68,0.35)",
                      }}
                    />
                  </div>
                  <span className="text-xs text-subtle w-20 sm:w-24 text-right tabular-nums">
                    {fmt(s.payroll)}
                  </span>
                </div>
              </div>
              <div
                className="pointer-events-none absolute inset-x-0 -inset-y-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(168,85,247,0.06) 0%, rgba(101,103,241,0.06) 50%, rgba(6,182,212,0.06) 100%)",
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas/50">
              <th className="text-left px-4 py-3 font-medium text-subtle">Участок</th>
              <th className="text-center px-4 py-3 font-medium text-subtle">Орг-ций</th>
              <th className="text-right px-4 py-3 font-medium text-subtle">Выручка</th>
              <th className="text-right px-4 py-3 font-medium text-subtle hidden sm:table-cell">
                ФОТ
              </th>
              <th className="text-right px-4 py-3 font-medium text-subtle hidden md:table-cell">
                Прибыль
              </th>
              <th className="text-center px-4 py-3 font-medium text-subtle">Маржа</th>
            </tr>
          </thead>
          <tbody>
            {sectionProfitability.map((s) => (
              <tr key={s.sectionId} className="border-b border-line hover:bg-canvas/50">
                <td className="px-4 py-3 font-medium text-heading">
                  №{s.number}
                  {s.name ? ` — ${s.name}` : ""}
                </td>
                <td className="px-4 py-3 text-center text-body">{s.orgCount}</td>
                <td className="px-4 py-3 text-right text-heading font-medium tabular-nums">
                  {fmt(s.revenue)}
                </td>
                <td className="px-4 py-3 text-right text-body tabular-nums hidden sm:table-cell">
                  {fmt(s.payroll)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                  <span
                    className={
                      s.profit >= 0
                        ? "text-emerald-600 dark:text-emerald-300"
                        : "text-red-600 dark:text-red-300"
                    }
                  >
                    {s.profit >= 0 ? "+" : ""}
                    {fmt(s.profit)}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <MarginBadge margin={s.margin} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
