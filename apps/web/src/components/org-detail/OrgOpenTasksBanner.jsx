import { CalendarDays, ClipboardList, MessageSquare } from "lucide-react";

const BANNER_PRIORITY_COLORS = {
  LOW: "bg-muted text-subtle",
  MEDIUM: "bg-yellow-100 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  HIGH: "bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300",
  URGENT: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
};
const BANNER_PRIORITY_LABELS = {
  LOW: "Низкий",
  MEDIUM: "Средний",
  HIGH: "Высокий",
  URGENT: "Срочно",
};
const BANNER_STATUS_LABELS = { OPEN: "Открыта", IN_PROGRESS: "В работе" };
const BANNER_STATUS_COLORS = {
  OPEN: "bg-muted text-body",
  IN_PROGRESS: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
};

/** Open tasks banner shown at the top of the org card. */
export default function OrgOpenTasksBanner({ tasks, onComment }) {
  const open = tasks.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS");
  if (!open.length) return null;

  return (
    <div className="mb-3 bg-primary/5 border border-primary/20 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardList size={15} className="text-primary shrink-0" />
        <span className="text-sm font-semibold text-primary">Открытые задачи — {open.length}</span>
      </div>
      <div className="space-y-2">
        {open.map((task) => {
          const overdue =
            task.dueDate &&
            task.status !== "DONE" &&
            task.status !== "CANCELLED" &&
            new Date(task.dueDate) < new Date();
          return (
            <button
              key={task.id}
              type="button"
              onClick={() => onComment(task)}
              className="w-full text-left px-2 -mx-2 py-1.5 rounded-lg hover:bg-primary/10 transition-colors"
              title="Открыть карточку задачи"
            >
              {/* Title row */}
              <div className="flex items-center gap-2 text-sm">
                <span className="flex-1 text-heading font-medium truncate">{task.title}</span>
                <span
                  className="shrink-0 relative inline-flex items-center justify-center text-subtle"
                  aria-hidden="true"
                >
                  <MessageSquare size={13} />
                  {task._count?.comments > 0 && (
                    <span className="absolute -top-1 -right-1.5 w-3 h-3 bg-primary text-white text-[7px] font-bold rounded-full flex items-center justify-center leading-none">
                      {task._count.comments > 9 ? "9+" : task._count.comments}
                    </span>
                  )}
                </span>
              </div>
              {/* Meta row */}
              <div className="flex items-center flex-wrap gap-1 mt-1">
                <span
                  className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${BANNER_STATUS_COLORS[task.status]}`}
                >
                  {BANNER_STATUS_LABELS[task.status]}
                </span>
                <span
                  className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${BANNER_PRIORITY_COLORS[task.priority]}`}
                >
                  {BANNER_PRIORITY_LABELS[task.priority]}
                </span>
                {task.dueDate && (
                  <span
                    className={`shrink-0 inline-flex items-center gap-1 text-[11px] ${overdue ? "text-red-600 dark:text-red-300 font-semibold" : "text-subtle"}`}
                  >
                    <CalendarDays size={11} />
                    {new Date(task.dueDate).toLocaleDateString("ru-RU")}
                    {overdue && " ⚠"}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
