import { Link } from "react-router";
import {
  Pencil,
  Trash2,
  CalendarDays,
  Building2,
  UserCircle,
  MessageSquare,
  CheckSquare,
  RefreshCw,
} from "lucide-react";
import {
  TASK_PRIORITY_LABELS,
  TASK_CATEGORY_LABELS,
  PRIORITY_COLORS,
  CATEGORY_COLORS,
  RECURRENCE_LABELS,
  formatDueDate,
  isOverdue,
} from "./taskConstants.js";

export default function KanbanCard({
  task,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onComment,
  onChecklist,
  onDragStart,
  onDragEnd,
  isDragging,
}) {
  const overdue = isOverdue(task);
  const checklistTotal = task.checklistItems?.length ?? 0;
  const checklistDone = task.checklistItems?.filter((i) => i.done).length ?? 0;
  const cancelled = task.status === "CANCELLED";
  const isReport = !!task.reportType;

  return (
    <div
      draggable={canEdit}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group rounded-xl border p-3 transition-all select-none ${
        isDragging ? "opacity-40 rotate-1 scale-95" : "hover:shadow-md"
      } ${
        isReport
          ? "bg-gradient-to-br from-purple-50 to-white dark:from-purple-500/10 dark:to-surface border-purple-200/60 dark:border-purple-500/30 ring-1 ring-purple-100/50 dark:ring-purple-500/20"
          : overdue
            ? "bg-surface border-red-200 dark:border-red-500/30"
            : "bg-surface border-line"
      } ${canEdit ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      {/* Priority + category + recurrence */}
      <div className="flex items-center gap-1.5 mb-2">
        {!isReport && (
          <span className="text-[10px] text-subtle font-medium shrink-0">Приоритет:</span>
        )}
        {!isReport && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide ${PRIORITY_COLORS[task.priority]}`}
          >
            {TASK_PRIORITY_LABELS[task.priority]}
          </span>
        )}
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide ${CATEGORY_COLORS[task.category]}`}
        >
          {TASK_CATEGORY_LABELS[task.category]}
        </span>
        {task.recurrenceType && (
          <RefreshCw
            size={10}
            className="text-primary ml-auto shrink-0"
            title={RECURRENCE_LABELS[`${task.recurrenceType}:${task.recurrenceInterval}`]}
          />
        )}
      </div>

      {/* Title */}
      <button
        type="button"
        onClick={() => onComment(task)}
        className={`block text-left w-full text-sm font-medium leading-snug mb-1.5 hover:text-primary transition-colors ${cancelled ? "line-through text-subtle" : isReport ? "text-purple-900 dark:text-purple-300" : "text-heading"}`}
        title="Открыть карточку задачи"
      >
        {task.title}
      </button>

      {/* Report progress bar */}
      {isReport && checklistTotal > 0 && (
        <div className="mb-2">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="font-medium text-purple-600 dark:text-purple-300 flex items-center gap-1">
              <Building2 size={10} />
              {checklistDone}/{checklistTotal} орг.
            </span>
            <span className="text-purple-400">
              {Math.round((checklistDone / checklistTotal) * 100)}%
            </span>
          </div>
          <div className="h-1.5 bg-purple-100 dark:bg-purple-500/15 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 rounded-full transition-all duration-300"
              style={{ width: `${(checklistDone / checklistTotal) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Description */}
      {!isReport && task.description && (
        <p className="text-[11px] text-subtle leading-snug line-clamp-2 mb-1.5">
          {task.description}
        </p>
      )}

      {/* Org */}
      {!isReport && task.organization && (
        <Link
          to={`/organizations/${task.organization.id}`}
          className="flex items-center gap-1 text-[11px] text-subtle hover:text-primary transition-colors mb-1.5 truncate"
          onClick={(e) => e.stopPropagation()}
        >
          <Building2 size={10} />
          <span className="truncate">{task.organization.name}</span>
        </Link>
      )}

      {/* Who assigned + when */}
      {task.createdBy && (
        <div className="flex items-center gap-1 text-[11px] text-subtle mb-2">
          <UserCircle size={10} />
          <span>
            {task.createdBy.lastName} {task.createdBy.firstName}
          </span>
          {task.createdAt && (
            <span className="text-subtle">
              ·{" "}
              {new Date(task.createdAt).toLocaleDateString("ru-RU", {
                day: "2-digit",
                month: "2-digit",
              })}
            </span>
          )}
        </div>
      )}

      {/* Footer: due date + assignees + actions */}
      <div className="flex items-center gap-2 mt-1">
        {task.dueDate && (
          <span
            className={`flex items-center gap-1 text-[11px] shrink-0 ${overdue ? "text-red-500 dark:text-red-400 font-semibold" : "text-subtle"}`}
          >
            <CalendarDays size={10} />
            {formatDueDate(task.dueDate)}
            {overdue && " ⚠"}
          </span>
        )}

        {task.assignees?.length > 0 && (
          <div
            className="flex items-center gap-0.5 ml-auto"
            title={task.assignees.map((a) => `${a.user.lastName} ${a.user.firstName}`).join(", ")}
          >
            {task.assignees.slice(0, 3).map((a) => (
              <div
                key={a.user.id}
                className="w-5 h-5 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[9px] font-bold text-primary"
              >
                {a.user.firstName?.[0]}
                {a.user.lastName?.[0]}
              </div>
            ))}
            {task.assignees.length > 3 && (
              <div className="w-5 h-5 rounded-full bg-muted border border-line flex items-center justify-center text-[9px] font-bold text-subtle">
                +{task.assignees.length - 3}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
          {isReport && checklistTotal > 0 ? (
            <button
              onClick={() => onChecklist(task)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 text-[10px] font-semibold hover:bg-purple-200 transition-colors !opacity-100"
              title="Организации"
            >
              <CheckSquare size={11} />
              {checklistDone}/{checklistTotal}
            </button>
          ) : (
            <button
              onClick={() => onChecklist(task)}
              className="relative p-1 text-subtle hover:text-primary transition-colors"
              title="Чек-лист"
            >
              <CheckSquare size={13} />
              {checklistTotal > 0 && (
                <span
                  className={`absolute -top-0.5 -right-0.5 w-3 h-3 text-white text-[7px] font-bold rounded-full flex items-center justify-center ${checklistDone === checklistTotal ? "bg-emerald-500" : "bg-slate-400"}`}
                >
                  {checklistDone === checklistTotal ? "✓" : checklistTotal}
                </span>
              )}
            </button>
          )}
          <button
            onClick={() => onComment(task)}
            className={`relative p-1 transition-colors hover:text-primary ${task.hasUnreadComments ? "text-orange-500 dark:text-orange-400" : task._count?.comments > 0 ? "text-primary" : "text-subtle"}`}
            title={`Комментарии${task._count?.comments > 0 ? ` (${task._count.comments})` : ""}${task.hasUnreadComments ? " · новые" : ""}`}
          >
            <MessageSquare size={13} />
            {task._count?.comments > 0 && (
              <span
                className={`absolute -top-0.5 -right-0.5 w-3 h-3 text-white text-[7px] font-bold rounded-full flex items-center justify-center ${task.hasUnreadComments ? "bg-orange-500" : "bg-primary"}`}
              >
                {task._count.comments > 9 ? "9+" : task._count.comments}
              </span>
            )}
          </button>
          {canEdit && (
            <button
              onClick={() => onEdit(task)}
              className="p-1 text-subtle hover:text-primary transition-colors"
              title="Редактировать"
            >
              <Pencil size={13} />
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => onDelete(task)}
              className="p-1 text-subtle hover:text-red-500 dark:hover:text-red-400 transition-colors"
              title="Удалить"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
