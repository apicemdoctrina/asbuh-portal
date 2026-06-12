import {
  BarChart,
  Bar,
  Line,
  Area,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  MONTHS_RU,
  fmt,
  fmtShort,
  tooltipStyle,
  tooltipLabelStyle,
  tooltipItemStyle,
  chartGridStroke,
  chartCursorFill,
} from "./financeShared.jsx";

/** Historical analytics: revenue/profit, costs comparison, margin, client base + history table. */
export default function FinanceHistorySection({ histData, snapshots }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-heading border-t border-line pt-4">
        История показателей
      </h2>

      <div className="relative bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-5 overflow-hidden">
        <div
          className="pointer-events-none absolute -top-12 -right-12 w-56 h-56 rounded-full opacity-40 dark:opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, #10b981 0%, transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-16 -left-16 w-56 h-56 rounded-full opacity-30 dark:opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, #a855f7 0%, transparent 70%)" }}
        />
        <h3 className="relative text-sm font-semibold text-body mb-4">Выручка и прибыль</h3>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={histData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="rpRevGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#6567F1" stopOpacity={0.5} />
              </linearGradient>
              <linearGradient id="rpProfitGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
              <filter id="rpRevGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feFlood floodColor="#6567F1" floodOpacity="0.55" />
                <feComposite in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="rpRevGlowHover" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feFlood floodColor="#a855f7" floodOpacity="0.9" />
                <feComposite in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="rpProfitGlow" x="-20%" y="-50%" width="140%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feFlood floodColor="#10b981" floodOpacity="0.75" />
                <feComposite in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={fmtShort}
              width={52}
            />
            <Tooltip
              formatter={(v, name) => [fmt(v), name === "revenue" ? "Выручка" : "Прибыль"]}
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
              cursor={chartCursorFill}
            />
            <Legend
              formatter={(v) => (v === "revenue" ? "Выручка" : "Прибыль")}
              iconSize={10}
              wrapperStyle={{ fontSize: 12 }}
            />
            <Bar
              dataKey="revenue"
              fill="url(#rpRevGrad)"
              radius={[8, 8, 0, 0]}
              filter="url(#rpRevGlow)"
              animationDuration={900}
              activeBar={{ filter: "url(#rpRevGlowHover)", fill: "url(#rpRevGrad)" }}
            />
            <Line
              dataKey="profit"
              stroke="url(#rpProfitGrad)"
              strokeWidth={2.5}
              filter="url(#rpProfitGlow)"
              dot={{ r: 3, fill: "#10b981", stroke: "#fff", strokeWidth: 1 }}
              activeDot={{
                r: 6,
                fill: "#10b981",
                stroke: "#10b981",
                strokeOpacity: 0.4,
                strokeWidth: 8,
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="relative bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-5 overflow-hidden">
          <div
            className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-40 dark:opacity-30 blur-3xl"
            style={{ background: "radial-gradient(circle, #f59e0b 0%, transparent 70%)" }}
          />
          <h3 className="relative text-sm font-semibold text-body mb-4">
            Выручка vs ФОТ vs Расходы
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={histData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="vsRevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#6567F1" stopOpacity={0.55} />
                </linearGradient>
                <linearGradient id="vsPayGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.55} />
                </linearGradient>
                <linearGradient id="vsExpGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fb7185" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#f87171" stopOpacity={0.55} />
                </linearGradient>
                {[
                  { id: "vsRevGlow", color: "#6567F1" },
                  { id: "vsPayGlow", color: "#f59e0b" },
                  { id: "vsExpGlow", color: "#f87171" },
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
                  { id: "vsRevGlowHover", color: "#a855f7" },
                  { id: "vsPayGlowHover", color: "#fbbf24" },
                  { id: "vsExpGlowHover", color: "#fb7185" },
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
              <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={fmtShort}
                width={52}
              />
              <Tooltip
                formatter={(v, name) => [
                  fmt(v),
                  name === "revenue" ? "Выручка" : name === "payroll" ? "ФОТ" : "Пост. расходы",
                ]}
                contentStyle={tooltipStyle}
                labelStyle={tooltipLabelStyle}
                itemStyle={tooltipItemStyle}
                cursor={chartCursorFill}
              />
              <Legend
                formatter={(v) =>
                  v === "revenue" ? "Выручка" : v === "payroll" ? "ФОТ" : "Пост. расходы"
                }
                iconSize={10}
                wrapperStyle={{ fontSize: 12 }}
              />
              <Bar
                dataKey="revenue"
                fill="url(#vsRevGrad)"
                radius={[6, 6, 0, 0]}
                filter="url(#vsRevGlow)"
                activeBar={{ filter: "url(#vsRevGlowHover)", fill: "url(#vsRevGrad)" }}
              />
              <Bar
                dataKey="payroll"
                fill="url(#vsPayGrad)"
                radius={[6, 6, 0, 0]}
                filter="url(#vsPayGlow)"
                activeBar={{ filter: "url(#vsPayGlowHover)", fill: "url(#vsPayGrad)" }}
              />
              <Bar
                dataKey="expenses"
                fill="url(#vsExpGrad)"
                radius={[6, 6, 0, 0]}
                filter="url(#vsExpGlow)"
                activeBar={{ filter: "url(#vsExpGlowHover)", fill: "url(#vsExpGrad)" }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="relative bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-5 overflow-hidden">
          <div
            className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-40 dark:opacity-30 blur-3xl"
            style={{ background: "radial-gradient(circle, #a855f7 0%, transparent 70%)" }}
          />
          <h3 className="relative text-sm font-semibold text-body mb-4">Маржинальность %</h3>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={histData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="marginLineGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#a855f7" />
                  <stop offset="100%" stopColor="#6567F1" />
                </linearGradient>
                <linearGradient id="marginAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6567F1" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#6567F1" stopOpacity={0} />
                </linearGradient>
                <filter id="marginGlow" x="-20%" y="-50%" width="140%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feFlood floodColor="#a855f7" floodOpacity="0.75" />
                  <feComposite in2="blur" operator="in" result="glow" />
                  <feMerge>
                    <feMergeNode in="glow" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v.toFixed(0)}%`}
                width={44}
              />
              <Tooltip
                formatter={(v) => [`${Number(v).toFixed(1)}%`, "Маржа"]}
                contentStyle={tooltipStyle}
                labelStyle={tooltipLabelStyle}
                itemStyle={tooltipItemStyle}
              />
              <Area
                dataKey="margin"
                stroke="none"
                fill="url(#marginAreaGrad)"
                isAnimationActive={false}
              />
              <Line
                dataKey="margin"
                stroke="url(#marginLineGrad)"
                strokeWidth={2.5}
                filter="url(#marginGlow)"
                dot={{ r: 3, fill: "#6567F1", stroke: "#fff", strokeWidth: 1 }}
                activeDot={{
                  r: 6,
                  fill: "#a855f7",
                  stroke: "#a855f7",
                  strokeOpacity: 0.4,
                  strokeWidth: 8,
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="relative bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-5 overflow-hidden">
        <div
          className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-40 dark:opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, #06b6d4 0%, transparent 70%)" }}
        />
        <h3 className="relative text-sm font-semibold text-body mb-4">Клиентская база</h3>
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={histData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="newClientsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.95} />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.5} />
              </linearGradient>
              <linearGradient id="orgCountLineGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#6567F1" />
              </linearGradient>
              <filter id="newClientsGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feFlood floodColor="#06b6d4" floodOpacity="0.55" />
                <feComposite in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="newClientsGlowHover" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="7" result="blur" />
                <feFlood floodColor="#22d3ee" floodOpacity="0.9" />
                <feComposite in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="orgCountGlow" x="-20%" y="-50%" width="140%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feFlood floodColor="#6567F1" floodOpacity="0.7" />
                <feComposite in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              width={32}
              allowDecimals={false}
            />
            <Tooltip
              formatter={(v, name) => [
                v,
                name === "orgCount" ? "Активных клиентов" : "Новых за месяц",
              ]}
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
              cursor={chartCursorFill}
            />
            <Legend
              formatter={(v) => (v === "orgCount" ? "Активных клиентов" : "Новых за месяц")}
              iconSize={10}
              wrapperStyle={{ fontSize: 12 }}
            />
            <Bar
              dataKey="clientsNew"
              fill="url(#newClientsGrad)"
              radius={[6, 6, 0, 0]}
              filter="url(#newClientsGlow)"
              activeBar={{ filter: "url(#newClientsGlowHover)", fill: "url(#newClientsGrad)" }}
            />
            <Line
              dataKey="orgCount"
              stroke="url(#orgCountLineGrad)"
              strokeWidth={2.5}
              filter="url(#orgCountGlow)"
              dot={{ r: 3, fill: "#6567F1", stroke: "#fff", strokeWidth: 1 }}
              activeDot={{
                r: 6,
                fill: "#a855f7",
                stroke: "#a855f7",
                strokeOpacity: 0.4,
                strokeWidth: 8,
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-body mb-4">Таблица истории</h3>

        {/* Mobile: card list per period */}
        <div className="sm:hidden -mx-4 divide-y divide-line border-t border-line">
          {[...snapshots].reverse().map((s) => {
            const gross = Number(s.grossProfit);
            const isPos = gross >= 0;
            return (
              <div key={s.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-sm font-semibold text-heading">
                    {MONTHS_RU[s.month - 1]} {s.year}
                  </span>
                  <span
                    className={`text-xs font-medium ${isPos ? "text-emerald-600 dark:text-emerald-300" : "text-red-500 dark:text-red-400"}`}
                  >
                    {Number(s.margin).toFixed(1)}% маржа
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div className="text-subtle">Выручка</div>
                  <div className="text-right text-heading tabular-nums">
                    {fmt(Number(s.totalRevenue))}
                  </div>
                  <div className="text-subtle">ФОТ</div>
                  <div className="text-right tabular-nums text-amber-600 dark:text-amber-300">
                    {fmt(Number(s.payrollTotal))}
                  </div>
                  <div className="text-subtle">Пост. расходы</div>
                  <div className="text-right tabular-nums text-red-400">
                    {fmt(Number(s.recurringExpenses))}
                  </div>
                  <div className="text-subtle">Прибыль</div>
                  <div
                    className={`text-right font-medium tabular-nums ${isPos ? "text-emerald-600 dark:text-emerald-300" : "text-red-500 dark:text-red-400"}`}
                  >
                    {fmt(gross)}
                  </div>
                  <div className="text-subtle">Клиентов</div>
                  <div className="text-right text-body tabular-nums">
                    {s.orgCount}{" "}
                    <span className="text-primary">
                      {s.clientsNew > 0 ? `(+${s.clientsNew})` : ""}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* sm+: full table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-subtle border-b border-line">
                <th className="pb-2 font-medium pr-4">Период</th>
                <th className="pb-2 font-medium text-right pr-4">Выручка</th>
                <th className="pb-2 font-medium text-right pr-4">ФОТ</th>
                <th className="pb-2 font-medium text-right pr-4">Пост. расходы</th>
                <th className="pb-2 font-medium text-right pr-4">Прибыль</th>
                <th className="pb-2 font-medium text-right pr-4">Маржа</th>
                <th className="pb-2 font-medium text-right pr-4">Клиентов</th>
                <th className="pb-2 font-medium text-right">Новых</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...snapshots].reverse().map((s) => {
                const gross = Number(s.grossProfit);
                const isPos = gross >= 0;
                return (
                  <tr key={s.id} className="hover:bg-canvas transition-colors">
                    <td className="py-2.5 pr-4 text-body font-medium whitespace-nowrap">
                      {MONTHS_RU[s.month - 1]} {s.year}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-heading">
                      {fmt(Number(s.totalRevenue))}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-amber-600 dark:text-amber-300">
                      {fmt(Number(s.payrollTotal))}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-red-400">
                      {fmt(Number(s.recurringExpenses))}
                    </td>
                    <td
                      className={`py-2.5 pr-4 text-right font-medium ${isPos ? "text-emerald-600 dark:text-emerald-300" : "text-red-500 dark:text-red-400"}`}
                    >
                      {fmt(gross)}
                    </td>
                    <td
                      className={`py-2.5 pr-4 text-right ${isPos ? "text-emerald-600 dark:text-emerald-300" : "text-red-500 dark:text-red-400"}`}
                    >
                      {Number(s.margin).toFixed(1)}%
                    </td>
                    <td className="py-2.5 pr-4 text-right text-body">{s.orgCount}</td>
                    <td className="py-2.5 text-right text-primary">+{s.clientsNew}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
