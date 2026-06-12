import { Link } from "react-router";
import {
  Pencil,
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle,
  ListTodo,
  Wallet,
  FileSpreadsheet,
  Layers,
} from "lucide-react";
import SectionIcon from "../SectionIcon.jsx";
import {
  ROLE_LABELS,
  ACCOUNTANT_TYPE_LABELS,
  ROLE_BADGE_COLORS,
  getInitials,
  formatMoney,
  formatLastSeen,
} from "./staffConstants.js";

function KpiCell({ value, icon: Icon, label, valueClass = "text-body", title }) {
  return (
    <div
      className="flex flex-col items-center justify-center py-1.5 px-1 rounded-lg bg-canvas/60 lg:bg-transparent lg:py-0 lg:px-0 lg:rounded-none lg:w-auto"
      title={title}
    >
      <span className={`text-sm font-bold leading-none tabular-nums ${valueClass}`}>{value}</span>
      <div className="flex items-center gap-1 mt-1 lg:mt-0.5">
        <Icon size={11} className="text-subtle lg:hidden" />
        <Icon size={13} className="text-subtle hidden lg:block" />
        <span className="text-[10px] text-subtle lg:hidden">{label}</span>
      </div>
    </div>
  );
}

/** One staff member row: identity, sections, compensation, workload KPIs, actions. */
export default function StaffCard({
  u,
  w,
  online,
  avatarColor,
  isAdmin,
  canManageCompensation,
  canDelete,
  onComp,
  onEdit,
  onDelete,
}) {
  const openTasksClass =
    w?.openTasks > 10
      ? "text-red-600 dark:text-red-300"
      : w?.openTasks > 5
        ? "text-amber-500 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-300";
  const overdueClass = w?.overdueTasks > 0 ? "text-red-600 dark:text-red-300" : "text-subtle";
  const completenessClass =
    w?.avgCompleteness == null
      ? "text-subtle"
      : w.avgCompleteness >= 90
        ? "text-emerald-600 dark:text-emerald-300"
        : w.avgCompleteness >= 60
          ? "text-amber-600 dark:text-amber-300"
          : "text-red-600 dark:text-red-300";
  const reportingPct = w?.reportingProgress?.percent;
  const reportingClass =
    reportingPct == null
      ? "text-subtle"
      : reportingPct >= 90
        ? "text-emerald-600 dark:text-emerald-300"
        : reportingPct >= 60
          ? "text-amber-600 dark:text-amber-300"
          : "text-red-600 dark:text-red-300";

  return (
    <div
      className={`group bg-surface border border-line rounded-2xl p-3 sm:p-4 lg:px-5 lg:py-4 flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-200 ${!u.isActive ? "opacity-55" : ""}`}
    >
      {/* Top row on mobile, identity column on desktop */}
      <div className="flex items-start gap-3 lg:contents">
        {/* Avatar */}
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${avatarColor}`}
        >
          {getInitials(u.firstName, u.lastName)}
        </div>

        {/* Identity */}
        <div className="flex-1 lg:w-44 lg:flex-none shrink-0 min-w-0">
          <div className="font-semibold text-heading text-sm leading-tight truncate">
            {isAdmin ? (
              <Link to={`/users/${u.id}`} className="hover:text-primary transition-colors">
                {u.lastName} {u.firstName}
              </Link>
            ) : (
              `${u.lastName} ${u.firstName}`
            )}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {u.roles
              .filter((r) => r !== "client")
              .map((r) => (
                <span
                  key={r}
                  className={`px-1.5 py-0.5 rounded-md text-xs font-medium ${ROLE_BADGE_COLORS[r] ?? "bg-muted text-body"}`}
                >
                  {ROLE_LABELS[r] || r}
                </span>
              ))}
            {u.roles.includes("accountant") && u.accountantType && (
              <span
                className="px-1.5 py-0.5 rounded-md text-xs font-medium bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30"
                title="Тип бухгалтера"
              >
                {ACCOUNTANT_TYPE_LABELS[u.accountantType]}
              </span>
            )}
            {!u.isActive && (
              <span className="px-1.5 py-0.5 rounded-md text-xs font-medium bg-muted text-subtle">
                Неактивен
              </span>
            )}
          </div>
        </div>

        {/* Online status — mobile: top-right, desktop: own column later */}
        {u.isActive && (
          <div className="flex items-center gap-1.5 shrink-0 lg:hidden">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${online ? "bg-emerald-500" : "bg-slate-300"}`}
            />
            <span
              className={`text-xs font-medium ${online ? "text-emerald-600 dark:text-emerald-300" : "text-subtle"}`}
            >
              {formatLastSeen(u.lastSeenAt)}
            </span>
          </div>
        )}
      </div>

      {/* Sections */}
      <div className="flex-1 min-w-0 flex flex-wrap gap-1.5">
        {u.sections && u.sections.length > 0 ? (
          u.sections.map((s) => (
            <span
              key={s.id}
              className="flex items-center gap-1 bg-canvas border border-line text-subtle px-2 py-0.5 rounded-lg text-xs font-medium whitespace-nowrap"
              title={s.name ? `${s.name} (№${s.number})` : `Участок №${s.number}`}
            >
              <SectionIcon section={s} size={12} className="shrink-0" />№{s.number}
            </span>
          ))
        ) : (
          <span className="text-subtle text-xs">—</span>
        )}
      </div>

      {/* Compensation */}
      {canManageCompensation && (
        <div className="flex lg:flex-col items-baseline lg:items-end gap-2 lg:gap-0 w-full lg:w-24 shrink-0 text-xs leading-tight border-t lg:border-t-0 border-line pt-2 lg:pt-0">
          <span className="text-subtle lg:hidden">Оплата:</span>
          <span
            className={`font-semibold ${u.salary != null ? "text-body" : "text-subtle"}`}
            title="Зарплата"
          >
            {formatMoney(u.salary)} ₽
          </span>
          <span className="text-subtle" title="Налог">
            +{formatMoney(u.tax)} ₽
          </span>
        </div>
      )}

      {/* KPI stats — mobile: 3-col grid with labels, desktop: inline */}
      <div className="grid grid-cols-3 lg:flex lg:items-center gap-2 lg:gap-2 shrink-0 w-full lg:w-auto">
        <KpiCell
          value={w?.openTasks ?? "—"}
          icon={ListTodo}
          label="Активные"
          valueClass={w != null ? openTasksClass : "text-subtle"}
          title="Активные задачи"
        />
        <div className="hidden lg:block w-px h-6 bg-muted" />
        <KpiCell
          value={w?.overdueTasks ?? "—"}
          icon={AlertCircle}
          label="Просрочено"
          valueClass={w != null ? overdueClass : "text-subtle"}
          title="Просроченные задачи"
        />
        <div className="hidden lg:block w-px h-6 bg-muted" />
        <KpiCell
          value={w?.doneLast30d ?? "—"}
          icon={CheckCircle2}
          label="За 30д"
          valueClass={w != null ? "text-body" : "text-subtle"}
          title="Выполнено за 30 дней"
        />
        <div className="hidden lg:block w-px h-6 bg-muted" />
        <KpiCell
          value={w?.avgCompletionDays != null ? `${w.avgCompletionDays}д` : "—"}
          icon={Clock}
          label="Ср. время"
          valueClass={w?.avgCompletionDays != null ? "text-body" : "text-subtle"}
          title="Среднее время выполнения"
        />
        <div className="hidden lg:block w-px h-6 bg-muted" />
        <KpiCell
          value={w?.avgCompleteness != null ? `${w.avgCompleteness}%` : "—"}
          icon={Layers}
          label="Заполнен."
          valueClass={completenessClass}
          title="Средняя заполненность карточек организаций"
        />
        <div className="hidden lg:block w-px h-6 bg-muted" />
        <KpiCell
          value={reportingPct != null ? `${reportingPct}%` : "—"}
          icon={FileSpreadsheet}
          label="Отчётность"
          valueClass={reportingClass}
          title={
            w?.reportingProgress
              ? `${w.reportingProgress.submitted} из ${w.reportingProgress.total} отчётов сдано за прошедшие периоды`
              : undefined
          }
        />
      </div>

      {/* Online status — desktop column */}
      <div className="hidden lg:flex w-28 shrink-0 items-center gap-1.5">
        {u.isActive && (
          <>
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${online ? "bg-emerald-500" : "bg-slate-300"}`}
            />
            <span
              className={`text-xs font-medium truncate ${online ? "text-emerald-600 dark:text-emerald-300" : "text-subtle"}`}
            >
              {formatLastSeen(u.lastSeenAt)}
            </span>
          </>
        )}
      </div>

      {/* Actions — mobile: always visible at bottom, desktop: hover-revealed */}
      {(isAdmin || canManageCompensation) && (
        <div className="flex items-center justify-end gap-1 shrink-0 border-t lg:border-t-0 border-line pt-2 lg:pt-0 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-150">
          {canManageCompensation && (
            <button
              onClick={onComp}
              className="p-2 lg:p-1.5 text-subtle hover:text-emerald-600 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/15 rounded-lg transition-colors"
              title="Зарплата и налог"
              aria-label="Зарплата и налог"
            >
              <Wallet size={15} />
            </button>
          )}
          {isAdmin && (
            <button
              onClick={onEdit}
              className="p-2 lg:p-1.5 text-subtle hover:text-primary hover:bg-primary/8 rounded-lg transition-colors"
              title="Редактировать"
              aria-label="Редактировать"
            >
              <Pencil size={15} />
            </button>
          )}
          {isAdmin && canDelete && (
            <button
              onClick={onDelete}
              className="p-2 lg:p-1.5 text-subtle hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 rounded-lg transition-colors"
              title={u.isActive ? "Деактивировать" : "Удалить навсегда"}
              aria-label={u.isActive ? "Деактивировать" : "Удалить навсегда"}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
