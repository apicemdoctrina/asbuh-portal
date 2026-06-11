import { useState } from "react";
import { Link } from "react-router";
import {
  Pencil,
  Trash2,
  CalendarDays,
  Building2,
  MessageSquare,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import {
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_CATEGORY_LABELS,
  STATUS_COLORS,
  PRIORITY_COLORS,
  CATEGORY_COLORS,
  formatDueDate,
  isOverdue,
} from "./taskConstants.js";

export default function KanbanGroupCard({
  tasks,
  canEdit,
  canEditTask,
  onEdit,
  onDelete,
  onStatusChange,
  onComment,
  onDragStart,
  onDragEnd,
  isDragging,
}) {
  const [expanded, setExpanded] = useState(false);
  const first = tasks[0];
  const overdue = tasks.some(isOverdue);
  const doneCount = tasks.filter((t) => t.status === "DONE").length;

  return (
    <div
      draggable={canEdit}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group bg-surface rounded-xl border transition-all select-none ${
        isDragging ? "opacity-40 rotate-1 scale-95" : "hover:shadow-md"
      } ${overdue ? "border-red-200 dark:border-red-500/30" : "border-line"} ${canEdit ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      {/* Card header */}
      <div className="p-3">
        {/* Priority + category */}
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[10px] text-subtle font-medium shrink-0">Приоритет:</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide ${PRIORITY_COLORS[first.priority]}`}
          >
            {TASK_PRIORITY_LABELS[first.priority]}
          </span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide ${CATEGORY_COLORS[first.category]}`}
          >
            {TASK_CATEGORY_LABELS[first.category]}
          </span>
          {first.recurrenceType && (
            <RefreshCw size={10} className="text-primary ml-auto shrink-0" />
          )}
        </div>

        {/* Title */}
        <p className="text-sm font-medium leading-snug mb-1 text-heading">{first.title}</p>

        {/* Description */}
        {first.description && (
          <p className="text-[11px] text-subtle leading-snug line-clamp-2 mb-1.5">
            {first.description}
          </p>
        )}

        {/* Group badge + progress */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
            <Building2 size={9} />
            {tasks.length} орг.
          </span>
          <span className="text-[10px] text-subtle">
            {doneCount}/{tasks.length} выполнено
          </span>
          {/* Progress bar */}
          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400 rounded-full transition-all"
              style={{ width: `${(doneCount / tasks.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Due date */}
        {first.dueDate && (
          <div
            className={`flex items-center gap-1 text-[11px] mb-2 ${overdue ? "text-red-500 dark:text-red-400 font-semibold" : "text-subtle"}`}
          >
            <CalendarDays size={10} />
            {formatDueDate(first.dueDate)}
            {overdue && " ⚠"}
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-between mt-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((x) => !x);
            }}
            className="flex items-center gap-1 text-[11px] text-subtle hover:text-primary transition-colors"
          >
            <ChevronRight
              size={12}
              className={`transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
            />
            {expanded ? "Скрыть" : "Показать орг."}
          </button>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {canEdit && (
              <button
                onClick={() => onEdit(first)}
                className="p-1 text-subtle hover:text-primary transition-colors"
                title="Редактировать"
              >
                <Pencil size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expanded org list */}
      {expanded && (
        <div className="border-t border-line divide-y divide-line">
          {tasks.map((task) => {
            const taskOverdue = isOverdue(task);
            return (
              <div
                key={task.id}
                className={`flex items-center gap-2 px-3 py-1.5 ${taskOverdue ? "bg-red-50/30 dark:bg-red-500/15" : ""}`}
              >
                <Building2 size={10} className="text-subtle shrink-0" />
                {task.organization ? (
                  <Link
                    to={`/organizations/${task.organization.id}`}
                    className="text-[11px] text-body hover:text-primary transition-colors truncate flex-1 min-w-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {task.organization.name}
                  </Link>
                ) : (
                  <span className="text-[11px] text-body truncate flex-1 min-w-0">—</span>
                )}
                {canEditTask(task) ? (
                  <select
                    value={task.status}
                    onChange={(e) => {
                      e.stopPropagation();
                      onStatusChange(task, e.target.value);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className={`text-[10px] border rounded px-1.5 py-0.5 bg-surface focus:outline-none cursor-pointer font-medium shrink-0 ${STATUS_COLORS[task.status]}`}
                  >
                    {["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"].map((s) => (
                      <option key={s} value={s}>
                        {TASK_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${STATUS_COLORS[task.status]}`}
                  >
                    {TASK_STATUS_LABELS[task.status]}
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onComment(task);
                  }}
                  className={`relative p-1 transition-colors hover:text-primary shrink-0 ${task.hasUnreadComments ? "text-orange-500 dark:text-orange-400" : task._count?.comments > 0 ? "text-primary" : "text-subtle"}`}
                  title={`Комментарии${task._count?.comments > 0 ? ` (${task._count.comments})` : ""}${task.hasUnreadComments ? " · новые" : ""}`}
                >
                  <MessageSquare size={11} />
                  {task._count?.comments > 0 && (
                    <span
                      className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 text-white text-[6px] font-bold rounded-full flex items-center justify-center ${task.hasUnreadComments ? "bg-orange-500" : "bg-primary"}`}
                    >
                      {task._count.comments}
                    </span>
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(task);
                  }}
                  className="p-1 text-subtle hover:text-red-500 dark:hover:text-red-400 transition-colors shrink-0"
                  title="Удалить"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
