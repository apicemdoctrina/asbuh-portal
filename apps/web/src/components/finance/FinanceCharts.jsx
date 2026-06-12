import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  fmt,
  fmtShort,
  tooltipStyle,
  tooltipLabelStyle,
  tooltipItemStyle,
  chartGridStroke,
  chartCursorFill,
} from "./financeShared.jsx";

/** Bar chart of monthly revenue snapshots. */
export function RevenueHistoryChart({ histData }) {
  return (
    <div className="relative bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-5 overflow-hidden">
      <div
        className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-40 dark:opacity-30 blur-3xl"
        style={{
          background: "radial-gradient(circle, #a855f7 0%, transparent 70%)",
        }}
      />
      <h2 className="relative text-base font-semibold text-heading mb-4">Динамика выручки</h2>
      {histData.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-subtle text-sm">
          Данные появятся после первого сохранения снимка
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={histData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity={0.95} />
                <stop offset="50%" stopColor="#6567F1" stopOpacity={0.95} />
                <stop offset="100%" stopColor="#6567F1" stopOpacity={0.55} />
              </linearGradient>
              <filter id="revGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feFlood floodColor="#6567F1" floodOpacity="0.55" />
                <feComposite in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="revGlowHover" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feFlood floodColor="#a855f7" floodOpacity="0.9" />
                <feComposite in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
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
              formatter={(v) => [fmt(v), "Выручка"]}
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
              cursor={chartCursorFill}
            />
            <Bar
              dataKey="revenue"
              fill="url(#revGrad)"
              radius={[8, 8, 0, 0]}
              filter="url(#revGlow)"
              animationDuration={900}
              animationEasing="ease-out"
              activeBar={{ filter: "url(#revGlowHover)", fill: "url(#revGrad)" }}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/** Horizontal bar chart of revenue grouped by organization legal form. */
export function OrgFormChart({ data }) {
  return (
    <div className="relative bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-5 overflow-hidden">
      <div
        className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-40 dark:opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, #06b6d4 0%, transparent 70%)" }}
      />
      <h2 className="relative text-base font-semibold text-heading mb-4">
        Структура по форме организации
      </h2>
      {data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-subtle text-sm">Нет данных</div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 14, left: 4, bottom: 0 }}
          >
            <defs>
              <linearGradient id="orgFormGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#5557E1" stopOpacity={0.55} />
                <stop offset="50%" stopColor="#6567F1" stopOpacity={0.95} />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.95} />
              </linearGradient>
              <filter id="orgFormGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feFlood floodColor="#06b6d4" floodOpacity="0.55" />
                <feComposite in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="orgFormGlowHover" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feFlood floodColor="#06b6d4" floodOpacity="0.9" />
                <feComposite in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={fmtShort}
            />
            <YAxis
              type="category"
              dataKey="form"
              tick={{ fontSize: 12, fill: "#475569" }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip
              formatter={(v, _n, props) => [`${fmt(v)} (${props.payload.count} орг.)`, "Выручка"]}
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
              cursor={chartCursorFill}
            />
            <Bar
              dataKey="revenue"
              fill="url(#orgFormGrad)"
              radius={[0, 8, 8, 0]}
              filter="url(#orgFormGlow)"
              animationDuration={900}
              animationEasing="ease-out"
              activeBar={{ filter: "url(#orgFormGlowHover)", fill: "url(#orgFormGrad)" }}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
