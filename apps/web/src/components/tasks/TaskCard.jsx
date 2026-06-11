import { Link } from "react-router";
import {
  Pencil,
  Trash2,
  CalendarDays,
  Building2,
  User,
  MessageSquare,
  CheckSquare,
  RefreshCw,
} from "lucide-react";
import {
  TASK_STATUS_LABELS,
  TASK_CATEGORY_LABELS,
  STATUS_COLORS,
  CATEGORY_COLORS,
  RECURRENCE_LABELS,
  PRIORITY_BORDER,
  formatDueDate,
  isOverdue,
  getNextStatuses,
} from "./taskConstants.js";

export default function TaskCard({
  task,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onStatusChange,
  onComment,
  onChecklist,
}) {
  const overdue = isOverdue(task);
  const nextStatuses = getNextStatuses(task.status);
  const checklistTotal = task.checklistItems?.length ?? 0;
  const checklistDone = task.checklistItems?.filter((i) => i.done).length ?? 0;
  const cancelled = task.status === "CANCELLED";
  const isReport = !!task.reportType;

  const borderColorCls = isReport
    ? "border-l-purple-400"
    : overdue
      ? "border-l-red-500"
      : PRIORITY_BORDER[task.priority];

  return (
    <div
      className={`group border border-l-4 rounded-xl transition-shadow hover:shadow-md flex flex-col sm:flex-row sm:items-center sm:gap-3 sm:px-3 sm:py-2.5 ${borderColorCls} ${
        isReport
          ? "bg-gradient-to-r from-purple-50/80 to-white dark:from-purple-500/10 dark:to-surface border-purple-200/60 dark:border-purple-500/30 ring-1 ring-purple-100/50 dark:ring-purple-500/20"
          : overdue
            ? "bg-red-50/30 dark:bg-red-500/15 border-red-200 dark:border-red-500/30"
            : "bg-surface border-line"
      }`}
    >
      {/* Title + meta */}
      <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0 px-3 pt-3 sm:p-0">
        {/* Category badge — desktop only (mobile shows it inline in meta) */}
        <span
          className={`hidden sm:inline-flex shrink-0 text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide uppercase ${CATEGORY_COLORS[task.category]}`}
        >
          {TASK_CATEGORY_LABELS[task.category]}
        </span>

        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => onComment(task)}
            className={`block text-left w-full text-[15px] sm:text-sm font-semibold sm:font-medium leading-snug hover:text-primary transition-colors ${cancelled ? "line-through text-subtle" : isReport ? "text-purple-900 dark:text-purple-300" : "text-heading"}`}
            title="Открыть карточку задачи"
          >
            {task.title}
          </button>
          <div className="flex items-center gap-x-2 gap-y-1 mt-1.5 sm:mt-0.5 text-[11px] text-subtle flex-wrap">
            <span
              className={`sm:hidden inline-flex shrink-0 text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide uppercase ${CATEGORY_COLORS[task.category]}`}
            >
              {TASK_CATEGORY_LABELS[task.category]}
            </span>
            {isReport && checklistTotal > 0 && (
              <span className="flex items-center gap-0.5 font-medium text-purple-600 dark:text-purple-300">
                <Building2 size={11} />
                {checklistDone}/{checklistTotal}
              </span>
            )}
            {!isReport && task.organization && (
              <Link
                to={`/organizations/${task.organization.id}`}
                className="flex items-center gap-0.5 hover:text-primary transition-colors truncate max-w-[160px]"
              >
                <Building2 size={11} />
                <span className="truncate">{task.organization.name}</span>
              </Link>
            )}
            {task.dueDate && (
              <span
                className={`flex items-center gap-0.5 shrink-0 tabular-nums ${overdue ? "text-red-500 dark:text-red-400 font-semibold" : ""}`}
              >
                <CalendarDays size={11} />
                {formatDueDate(task.dueDate)}
                {overdue && " ⚠"}
              </span>
            )}
            {task.assignees?.length > 0 && (
              <span
                className="flex items-center gap-0.5 truncate max-w-[160px]"
                title={task.assignees
                  .map((a) => `${a.user.lastName} ${a.user.firstName}`)
                  .join(", ")}
              >
                <User size={11} />
                <span className="truncate">
                  {task.assignees.map((a) => a.user.firstName).join(", ")}
                </span>
              </span>
            )}
            {task.recurrenceType && (
              <span
                className="flex items-center gap-0.5 text-primary shrink-0"
                title={RECURRENCE_LABELS[`${task.recurrenceType}:${task.recurrenceInterval}`]}
              >
                <RefreshCw size={11} />
                <span className="hidden sm:inline">
                  {RECURRENCE_LABELS[`${task.recurrenceType}:${task.recurrenceInterval}`]}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions row — divider above on mobile, inline on sm+ */}
      <div className="flex items-center gap-1 mt-2 sm:mt-0 px-2 py-1.5 sm:p-0 border-t sm:border-t-0 border-line/60">
        {canEdit && nextStatuses.length > 0 ? (
          <select
            value={task.status}
            onChange={(e) => onStatusChange(task, e.target.value)}
            className={`text-xs sm:text-[11px] border-0 rounded-full pl-3 pr-7 py-1.5 sm:py-1 focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer font-semibold appearance-none bg-[length:14px] bg-no-repeat bg-[right_0.5rem_center] bg-[image:var(--chevron-svg)] ${STATUS_COLORS[task.status]}`}
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
            }}
          >
            <option value={task.status}>{TASK_STATUS_LABELS[task.status]}</option>
            {nextStatuses.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        ) : (
          <span
            className={`text-xs sm:text-[11px] px-2.5 py-1.5 sm:py-1 rounded-full font-semibold ${STATUS_COLORS[task.status]}`}
          >
            {TASK_STATUS_LABELS[task.status]}
          </span>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          {isReport && checklistTotal > 0 ? (
            <button
              onClick={() => onChecklist(task)}
              className="flex items-center gap-1 px-2.5 py-1.5 sm:py-1 rounded-full bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 text-xs sm:text-[11px] font-semibold hover:bg-purple-200 transition-colors"
              title="Организации"
            >
              <CheckSquare size={13} />
              {checklistDone}/{checklistTotal}
            </button>
          ) : (
            <button
              onClick={() => onChecklist(task)}
              className="relative p-2 sm:p-1.5 text-subtle hover:text-primary transition-colors rounded-lg hover:bg-muted"
              title="Чек-лист"
              aria-label="Чек-лист"
            >
              <CheckSquare size={16} className="sm:size-[14px]" />
              {checklistTotal > 0 && (
                <span
                  className={`absolute top-0.5 right-0.5 w-3.5 h-3.5 text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none ${checklistDone === checklistTotal ? "bg-emerald-500" : "bg-slate-400"}`}
                >
                  {checklistDone === checklistTotal ? "✓" : checklistTotal}
                </span>
              )}
            </button>
          )}

          <button
            onClick={() => onComment(task)}
            className={`relative p-2 sm:p-1.5 transition-colors hover:text-primary rounded-lg hover:bg-muted ${task.hasUnreadComments ? "text-orange-500 dark:text-orange-400" : task._count?.comments > 0 ? "text-primary" : "text-subtle"}`}
            title={`Комментарии${task._count?.comments > 0 ? ` (${task._count.comments})` : ""}${task.hasUnreadComments ? " · новые" : ""}`}
            aria-label="Комментарии"
          >
            <MessageSquare size={16} className="sm:size-[14px]" />
            {task._count?.comments > 0 && (
              <span
                className={`absolute top-0.5 right-0.5 w-3.5 h-3.5 text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none ${task.hasUnreadComments ? "bg-orange-500" : "bg-primary"}`}
              >
                {task._count.comments > 9 ? "9+" : task._count.comments}
              </span>
            )}
          </button>

          {canEdit && (
            <button
              onClick={() => onEdit(task)}
              className="p-2 sm:p-1.5 text-subtle hover:text-primary transition-colors rounded-lg hover:bg-muted sm:opacity-0 sm:group-hover:opacity-100"
              title="Редактировать"
              aria-label="Редактировать"
            >
              <Pencil size={16} className="sm:size-[14px]" />
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => onDelete(task)}
              className="p-2 sm:p-1.5 text-subtle hover:text-red-500 dark:hover:text-red-400 transition-colors rounded-lg hover:bg-muted sm:opacity-0 sm:group-hover:opacity-100"
              title="Удалить"
              aria-label="Удалить"
            >
              <Trash2 size={16} className="sm:size-[14px]" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
