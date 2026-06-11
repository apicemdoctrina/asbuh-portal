export const TASK_STATUS_LABELS = {
  OPEN: "Открыта",
  IN_PROGRESS: "В работе",
  DONE: "Выполнена",
  CANCELLED: "Отменена",
};

export const TASK_PRIORITY_LABELS = {
  LOW: "Низкий",
  MEDIUM: "Средний",
  HIGH: "Высокий",
  URGENT: "Срочно",
};

export const TASK_CATEGORY_LABELS = {
  REPORTING: "Отчётность",
  DOCUMENTS: "Документы",
  PAYMENT: "Оплата",
  OTHER: "Прочее",
};

export const STATUS_COLORS = {
  OPEN: "bg-muted text-body",
  IN_PROGRESS: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
  DONE: "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300",
  CANCELLED: "bg-muted text-subtle line-through",
};

export const PRIORITY_COLORS = {
  LOW: "bg-muted text-subtle",
  MEDIUM: "bg-yellow-100 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  HIGH: "bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300",
  URGENT: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
};

export const CATEGORY_COLORS = {
  REPORTING: "bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300",
  DOCUMENTS: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
  PAYMENT: "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300",
  OTHER: "bg-muted text-body",
};

// value = "TYPE:interval", e.g. "MONTHLY:1"
export const RECURRENCE_OPTIONS = [
  { value: "", label: "Не повторяется" },
  { value: "DAILY:1", label: "Ежедневно" },
  { value: "WEEKLY:1", label: "Еженедельно" },
  { value: "MONTHLY:1", label: "Ежемесячно" },
  { value: "MONTHLY:3", label: "Ежеквартально" },
  { value: "YEARLY:1", label: "Ежегодно" },
];

export const RECURRENCE_LABELS = Object.fromEntries(
  RECURRENCE_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]),
);

export const STATUS_TABS = [
  { key: "", label: "Все" },
  { key: "OPEN", label: "Открытые" },
  { key: "IN_PROGRESS", label: "В работе" },
  { key: "DONE", label: "Выполненные" },
  { key: "CANCELLED", label: "Отменённые" },
  { key: "ARCHIVED", label: "Архив" },
];

export const KANBAN_COLS = [
  {
    key: "OPEN",
    label: "Открытые",
    cls: "border-line bg-canvas/60",
    overCls: "border-primary/40 bg-primary/5",
    headerCls: "bg-muted/80",
    dot: "bg-slate-400",
  },
  {
    key: "IN_PROGRESS",
    label: "В работе",
    cls: "border-blue-200 dark:border-blue-500/30 bg-blue-50/40 dark:bg-blue-500/15",
    overCls: "border-blue-400/60 bg-blue-50 dark:bg-blue-500/15",
    headerCls: "bg-blue-100/60 dark:bg-blue-500/15",
    dot: "bg-blue-400",
  },
  {
    key: "DONE",
    label: "Выполнено",
    cls: "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-500/15",
    overCls: "border-emerald-400/60 bg-emerald-50 dark:bg-emerald-500/15",
    headerCls: "bg-emerald-100/60 dark:bg-emerald-500/15",
    dot: "bg-emerald-400",
  },
  {
    key: "CANCELLED",
    label: "Отменено",
    cls: "border-line bg-canvas/30",
    overCls: "border-line/40 bg-muted/40",
    headerCls: "bg-muted/50",
    dot: "bg-slate-300",
  },
];

export const PRIORITY_BAR = {
  LOW: "bg-slate-300",
  MEDIUM: "bg-yellow-400",
  HIGH: "bg-orange-400",
  URGENT: "bg-red-500",
};

export const PRIORITY_BORDER = {
  LOW: "border-l-slate-300",
  MEDIUM: "border-l-yellow-400",
  HIGH: "border-l-orange-400",
  URGENT: "border-l-red-500",
};

export const INPUT_CLS =
  "w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface";
export const LABEL_CLS = "block text-sm font-medium text-body mb-1";

export const EMPTY_FORM = {
  title: "",
  description: "",
  priority: "MEDIUM",
  category: "OTHER",
  dueDate: "",
  organizationId: "",
  organizationIds: [],
  assignedToIds: [],
  recurrence: "",
  visibleToClient: false,
  userTouchedVisible: false,
};

export function formatDueDate(dueDate) {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function isOverdue(task) {
  if (!task.dueDate) return false;
  if (task.status === "DONE" || task.status === "CANCELLED") return false;
  return new Date(task.dueDate) < new Date();
}

export function aggStatus(tasks) {
  if (tasks.every((t) => t.status === "DONE")) return "DONE";
  if (tasks.every((t) => t.status === "CANCELLED")) return "CANCELLED";
  if (tasks.every((t) => t.status === "DONE" || t.status === "CANCELLED")) return "DONE";
  if (tasks.some((t) => t.status === "IN_PROGRESS")) return "IN_PROGRESS";
  return "OPEN";
}

export function getNextStatuses(current) {
  const all = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"];
  return all.filter((s) => s !== current);
}
