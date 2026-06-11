import { useState } from "react";
import { Link } from "react-router";
import {
  Pencil,
  Trash2,
  CalendarDays,
  Building2,
  User,
  MessageSquare,
  CheckSquare,
  ChevronRight,
} from "lucide-react";
import {
  TASK_STATUS_LABELS,
  TASK_CATEGORY_LABELS,
  STATUS_COLORS,
  CATEGORY_COLORS,
  PRIORITY_BAR,
  formatDueDate,
  isOverdue,
  aggStatus,
  getNextStatuses,
} from "./taskConstants.js";

export default function GroupedTaskRow({
  tasks,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onStatusChange,
  onComment,
  onChecklist,
}) {
  const [expanded, setExpanded] = useState(false);
  const first = tasks[0];
  const overdue = tasks.some(isOverdue);
  const doneCount = tasks.filter((t) => t.status === "DONE").length;
  const status = aggStatus(tasks);

  return (
    <div
      className={`rounded-xl border overflow-hidden transition-shadow ${expanded ? "shadow-md" : "hover:shadow-md"} ${overdue ? "border-red-200 dark:border-red-500/30" : "border-line"}`}
    >
      {/* Group header row */}
      <div
        className={`group flex items-center gap-3 bg-surface px-3 py-2.5 cursor-pointer select-none ${overdue ? "bg-red-50/30 dark:bg-red-500/15" : ""}`}
        onClick={() => setExpanded((e) => !e)}
      >
        <ChevronRight
          size={14}
          className={`text-subtle shrink-0 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
        />
        <div className={`w-1 h-8 rounded-full shrink-0 ${PRIORITY_BAR[first.priority]}`} />
        <span
          className={`hidden sm:inline-flex shrink-0 text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide uppercase ${CATEGORY_COLORS[first.category]}`}
        >
          {TASK_CATEGORY_LABELS[first.category]}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight truncate text-heading">{first.title}</p>
          {first.description && (
            <p className="text-[11px] text-subtle leading-snug truncate mt-0.5">
              {first.description}
            </p>
          )}
          <div className="flex items-center gap-2.5 mt-0.5 text-[11px] flex-wrap">
            <span className="flex items-center gap-0.5 font-medium text-primary">
              <Building2 size={10} />
              {tasks.length} орг. · {doneCount}/{tasks.length} выполнено
            </span>
            {first.dueDate && (
              <span
                className={`flex items-center gap-0.5 ${overdue ? "text-red-500 dark:text-red-400 font-semibold" : "text-subtle"}`}
              >
                <CalendarDays size={10} />
                {formatDueDate(first.dueDate)}
                {overdue && " ⚠"}
              </span>
            )}
            {first.assignees?.length > 0 && (
              <span
                className="flex items-center gap-0.5 text-subtle truncate max-w-[140px]"
                title={first.assignees
                  .map((a) => `${a.user.lastName} ${a.user.firstName}`)
                  .join(", ")}
              >
                <User size={10} />
                <span className="truncate">
                  {first.assignees.map((a) => a.user.firstName).join(", ")}
                </span>
              </span>
            )}
          </div>
        </div>
        <span
          className={`text-[11px] px-2 py-1 rounded-lg font-medium shrink-0 ${STATUS_COLORS[status]}`}
        >
          {TASK_STATUS_LABELS[status]}
        </span>
      </div>

      {/* Sub-rows — one per org */}
      {expanded && (
        <div className="border-t border-line divide-y divide-line bg-canvas/40">
          {tasks.map((task) => {
            const taskOverdue = isOverdue(task);
            const ce = canEdit(task);
            const cd = canDelete(task);
            const nextSt = getNextStatuses(task.status);
            return (
              <div
                key={task.id}
                className={`flex items-center gap-2 pl-10 pr-3 py-2 ${taskOverdue ? "bg-red-50/30 dark:bg-red-500/15" : ""}`}
              >
                <Building2 size={12} className="text-subtle shrink-0" />
                <Link
                  to={`/organizations/${task.organization?.id}`}
                  className="text-sm text-body hover:text-primary transition-colors truncate flex-1 min-w-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {task.organization?.name ?? "—"}
                </Link>
                {taskOverdue && (
                  <span className="text-[10px] text-red-500 dark:text-red-400 font-semibold shrink-0">
                    ⚠ просрочено
                  </span>
                )}
                <div className="flex items-center gap-0.5 shrink-0">
                  {ce && nextSt.length > 0 ? (
                    <select
                      value={task.status}
                      onChange={(e) => {
                        e.stopPropagation();
                        onStatusChange(task, e.target.value);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className={`text-[11px] border rounded-lg px-2 py-1 bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer font-medium ${STATUS_COLORS[task.status]}`}
                    >
                      <option value={task.status}>{TASK_STATUS_LABELS[task.status]}</option>
                      {nextSt.map((s) => (
                        <option key={s} value={s}>
                          {TASK_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span
                      className={`text-[11px] px-2 py-1 rounded-lg font-medium ${STATUS_COLORS[task.status]}`}
                    >
                      {TASK_STATUS_LABELS[task.status]}
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onChecklist(task);
                    }}
                    className="p-1.5 text-subtle hover:text-primary transition-colors"
                    title="Чек-лист"
                  >
                    <CheckSquare size={13} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onComment(task);
                    }}
                    className={`relative p-1.5 transition-colors hover:text-primary ${task.hasUnreadComments ? "text-orange-500 dark:text-orange-400" : task._count?.comments > 0 ? "text-primary" : "text-subtle"}`}
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
                  {ce && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(task);
                      }}
                      className="p-1.5 text-subtle hover:text-primary transition-colors"
                      title="Редактировать"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  {cd && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(task);
                      }}
                      className="p-1.5 text-subtle hover:text-red-500 dark:hover:text-red-400 transition-colors"
                      title="Удалить"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
