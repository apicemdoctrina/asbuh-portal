import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import {
  Plus,
  X,
  Save,
  Pencil,
  Trash2,
  CalendarDays,
  Building2,
  User,
  UserCircle,
  MessageSquare,
  CheckSquare,
  RefreshCw,
  Loader2,
} from "lucide-react";
import TaskCommentsModal from "../components/TaskCommentsModal.jsx";
import TaskChecklistModal from "../components/TaskChecklistModal.jsx";

const TASK_STATUS_LABELS = {
  OPEN: "Открыта",
  IN_PROGRESS: "В работе",
  DONE: "Выполнена",
  CANCELLED: "Отменена",
};

const TASK_PRIORITY_LABELS = {
  LOW: "Низкий",
  MEDIUM: "Средний",
  HIGH: "Высокий",
  URGENT: "Срочно",
};

const TASK_CATEGORY_LABELS = {
  REPORTING: "Отчётность",
  DOCUMENTS: "Документы",
  PAYMENT: "Оплата",
  OTHER: "Прочее",
};

const STATUS_COLORS = {
  OPEN: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  DONE: "bg-green-100 text-green-700",
  CANCELLED: "bg-slate-100 text-slate-400 line-through",
};

const PRIORITY_COLORS = {
  LOW: "bg-slate-100 text-slate-500",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};

const CATEGORY_COLORS = {
  REPORTING: "bg-purple-100 text-purple-700",
  DOCUMENTS: "bg-blue-100 text-blue-700",
  PAYMENT: "bg-green-100 text-green-700",
  OTHER: "bg-slate-100 text-slate-600",
};

// value = "TYPE:interval", e.g. "MONTHLY:1"
const RECURRENCE_OPTIONS = [
  { value: "", label: "Не повторяется" },
  { value: "DAILY:1", label: "Ежедневно" },
  { value: "WEEKLY:1", label: "Еженедельно" },
  { value: "MONTHLY:1", label: "Ежемесячно" },
  { value: "MONTHLY:3", label: "Ежеквартально" },
  { value: "YEARLY:1", label: "Ежегодно" },
];

const RECURRENCE_LABELS = Object.fromEntries(
  RECURRENCE_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]),
);

const STATUS_TABS = [
  { key: "", label: "Все" },
  { key: "OPEN", label: "Открытые" },
  { key: "IN_PROGRESS", label: "В работе" },
  { key: "DONE", label: "Выполненные" },
  { key: "CANCELLED", label: "Отменённые" },
];

function formatDueDate(dueDate) {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function isOverdue(task) {
  if (!task.dueDate) return false;
  if (task.status === "DONE" || task.status === "CANCELLED") return false;
  return new Date(task.dueDate) < new Date();
}

const INPUT_CLS =
  "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] bg-white";
const SELECT_CLS = INPUT_CLS;
const LABEL_CLS = "block text-sm font-medium text-slate-700 mb-1";

const EMPTY_FORM = {
  title: "",
  description: "",
  priority: "MEDIUM",
  category: "OTHER",
  dueDate: "",
  organizationId: "",
  organizationIds: [],
  assignedToIds: [],
  recurrence: "",
};

export default function TasksPage() {
  const { user, hasPermission, hasRole } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [statusTab, setStatusTab] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  // Edit/create modal
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // Comments modal
  const [commentTask, setCommentTask] = useState(null);

  // Checklist modal
  const [checklistTask, setChecklistTask] = useState(null);

  // For assignee select
  const [users, setUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [orgs, setOrgs] = useState([]);

  const canCreate = hasPermission("task", "create");

  function canEditTask(task) {
    if (!hasPermission("task", "edit")) return false;
    if (hasRole("admin") || hasRole("manager")) return true;
    return task.createdBy?.id === user?.id;
  }

  function canDeleteTask(task) {
    if (!hasPermission("task", "delete")) return false;
    if (hasRole("admin") || hasRole("manager")) return true;
    return task.createdBy?.id === user?.id;
  }

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusTab) params.set("status", statusTab);
      const res = await api(`/api/tasks?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTasks(data);
    } catch {
      setError("Не удалось загрузить задачи");
    } finally {
      setLoading(false);
    }
  }, [statusTab]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Load orgs + all staff once when modal opens
  useEffect(() => {
    if (!showModal) return;
    api("/api/organizations")
      .then((r) => r.json())
      .then((d) => setOrgs(d?.organizations || []))
      .catch(() => {});
    api("/api/users?excludeRole=client")
      .then((r) => r.json())
      .then((d) => setAllUsers(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [showModal]);

  // Load assignable users: all staff when no/multiple orgs, org members when exactly one org selected
  useEffect(() => {
    if (!showModal) return;
    const singleOrgId = editingTask
      ? form.organizationId
      : form.organizationIds.length === 1
        ? form.organizationIds[0]
        : "";
    if (!singleOrgId) {
      setUsers(allUsers);
      return;
    }
    api(`/api/organizations/${singleOrgId}`)
      .then((r) => r.json())
      .then((org) => {
        const staff = (org.members || []).filter((m) => m.role !== "client").map((m) => m.user);
        setUsers(staff);
        if (staff.length === 1) {
          setForm((f) => ({ ...f, assignedToIds: [staff[0].id] }));
        }
      })
      .catch(() => {});
  }, [showModal, form.organizationId, form.organizationIds, allUsers, editingTask]);

  function openCreate(prefill = {}) {
    setEditingTask(null);
    setForm({ ...EMPTY_FORM, ...prefill });
    setFormError(null);
    setShowModal(true);
  }

  function openEdit(task) {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      category: task.category,
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
      organizationId: task.organizationId || "",
      assignedToIds: task.assignees?.map((a) => a.userId) ?? [],
      recurrence: task.recurrenceType ? `${task.recurrenceType}:${task.recurrenceInterval}` : "",
    });
    setFormError(null);
    setShowModal(true);
  }

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) {
      setFormError("Заголовок обязателен");
      return;
    }
    if (form.dueDate && !editingTask) {
      const today = new Date().toISOString().slice(0, 10);
      if (form.dueDate < today) {
        setFormError("Срок не может быть в прошлом");
        return;
      }
    }
    setSaving(true);
    setFormError(null);
    try {
      const [recurrenceType, recurrenceInterval] = form.recurrence
        ? form.recurrence.split(":")
        : [null, null];

      const body = {
        title: form.title.trim(),
        description: form.description || null,
        priority: form.priority,
        category: form.category,
        dueDate: form.dueDate || null,
        ...(editingTask
          ? { organizationId: form.organizationId || null }
          : { organizationIds: form.organizationIds }),
        assignedToIds: form.assignedToIds,
        recurrenceType: recurrenceType || null,
        recurrenceInterval: recurrenceInterval ? Number(recurrenceInterval) : 1,
      };

      if (editingTask) {
        const res = await api(`/api/tasks/${editingTask.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error();
      } else {
        const res = await api("/api/tasks", { method: "POST", body: JSON.stringify(body) });
        if (!res.ok) throw new Error();
      }
      setShowModal(false);
      fetchTasks();
    } catch {
      setFormError("Не удалось сохранить задачу");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(task, newStatus) {
    try {
      await api(`/api/tasks/${task.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      fetchTasks();
    } catch {
      // silent
    }
  }

  async function handleDelete(task) {
    if (!confirm(`Удалить задачу «${task.title}»?`)) return;
    try {
      await api(`/api/tasks/${task.id}`, { method: "DELETE" });
      fetchTasks();
    } catch {
      // silent
    }
  }

  // Client-side category filter (already filtered on server for status/my, but category not sent to server for simplicity)
  const filtered = categoryFilter ? tasks.filter((t) => t.category === categoryFilter) : tasks;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Задачи</h1>
        {canCreate && (
          <button
            onClick={() => openCreate()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all"
          >
            <Plus size={16} />
            Создать задачу
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Status tabs */}
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatusTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusTab === t.key
                  ? "bg-[#6567F1] text-white"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Category filter */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30"
        >
          <option value="">Все категории</option>
          {Object.entries(TASK_CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {/* Task list */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : error ? (
        <div className="text-sm text-red-500">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-slate-400">Нет задач</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              canEdit={canEditTask(task)}
              canDelete={canDeleteTask(task)}
              onEdit={openEdit}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
              onComment={setCommentTask}
              onChecklist={setChecklistTask}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">
                {editingTask ? "Редактировать задачу" : "Новая задача"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
              <div>
                <label className={LABEL_CLS}>Заголовок *</label>
                <input
                  type="text"
                  autoFocus
                  value={form.title}
                  onChange={(e) => setField("title", e.target.value)}
                  className={INPUT_CLS}
                  placeholder="Например: Сдать отчёт по НДС"
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Описание</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setField("description", e.target.value)}
                  className={INPUT_CLS}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>Приоритет</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setField("priority", e.target.value)}
                    className={SELECT_CLS}
                  >
                    {Object.entries(TASK_PRIORITY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLS}>Категория</label>
                  <select
                    value={form.category}
                    onChange={(e) => setField("category", e.target.value)}
                    className={SELECT_CLS}
                  >
                    {Object.entries(TASK_CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>Дедлайн</label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setField("dueDate", e.target.value)}
                    className={INPUT_CLS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Повторение</label>
                  <select
                    value={form.recurrence}
                    onChange={(e) => setField("recurrence", e.target.value)}
                    className={SELECT_CLS}
                  >
                    {RECURRENCE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className={LABEL_CLS}>{editingTask ? "Организация" : "Организации"}</label>
                {editingTask ? (
                  <select
                    value={form.organizationId}
                    onChange={(e) => {
                      setField("organizationId", e.target.value);
                      setField("assignedToIds", []);
                    }}
                    className={SELECT_CLS}
                  >
                    <option value="">Без организации</option>
                    {orgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <OrgMultiSelect
                    options={orgs}
                    value={form.organizationIds}
                    onChange={(ids) => {
                      setField("organizationIds", ids);
                      setField("assignedToIds", []);
                    }}
                  />
                )}
              </div>
              <div>
                <label className={LABEL_CLS}>Исполнители</label>
                <AssigneeMultiSelect
                  options={users}
                  value={form.assignedToIds}
                  onChange={(ids) => setField("assignedToIds", ids)}
                />
              </div>

              {formError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{formError}</div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border-2 border-[#6567F1]/20 text-[#6567F1] hover:bg-[#6567F1]/5 rounded-lg text-sm font-medium transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50"
                >
                  <Save size={16} />
                  {saving ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {commentTask && <TaskCommentsModal task={commentTask} onClose={() => setCommentTask(null)} />}
      {checklistTask && (
        <TaskChecklistModal
          task={checklistTask}
          onClose={() => setChecklistTask(null)}
          onUpdate={(patch) =>
            setTasks((prev) =>
              prev.map((t) => (t.id === checklistTask.id ? { ...t, ...patch } : t)),
            )
          }
        />
      )}
    </>
  );
}

function TaskCard({
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

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[task.category]}`}
          >
            {TASK_CATEGORY_LABELS[task.category]}
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[task.priority]}`}
          >
            {TASK_PRIORITY_LABELS[task.priority]}
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[task.status]}`}
          >
            {TASK_STATUS_LABELS[task.status]}
          </span>
        </div>

        <p
          className={`text-sm font-semibold text-slate-900 leading-snug ${task.status === "CANCELLED" ? "line-through text-slate-400" : ""}`}
        >
          {task.title}
        </p>

        {task.description && (
          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{task.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-400">
          {task.organization && (
            <Link
              to={`/organizations/${task.organization.id}`}
              className="flex items-center gap-1 hover:text-[#6567F1] transition-colors"
            >
              <Building2 size={12} />
              {task.organization.name}
            </Link>
          )}
          {task.createdBy && (
            <span className="flex items-center gap-1">
              <UserCircle size={12} />
              от: {task.createdBy.lastName} {task.createdBy.firstName}
            </span>
          )}
          {task.assignees?.length > 0 && (
            <span className="flex items-center gap-1">
              <User size={12} />
              кому: {task.assignees.map((a) => `${a.user.lastName} ${a.user.firstName}`).join(", ")}
            </span>
          )}
          {task.dueDate && (
            <span
              className={`flex items-center gap-1 ${overdue ? "text-red-500 font-medium" : ""}`}
            >
              <CalendarDays size={12} />
              {formatDueDate(task.dueDate)}
              {overdue && " — просрочено"}
            </span>
          )}
          {task.recurrenceType && (
            <span
              className="flex items-center gap-1 text-[#6567F1]"
              title={
                RECURRENCE_LABELS[`${task.recurrenceType}:${task.recurrenceInterval}`] ??
                "Повторяется"
              }
            >
              <RefreshCw size={11} />
              {RECURRENCE_LABELS[`${task.recurrenceType}:${task.recurrenceInterval}`] ??
                "Повторяется"}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {canEdit && nextStatuses.length > 0 && (
          <select
            value={task.status}
            onChange={(e) => onStatusChange(task, e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 cursor-pointer"
          >
            <option value={task.status}>{TASK_STATUS_LABELS[task.status]}</option>
            {nextStatuses.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={() => onChecklist(task)}
          className="relative p-1.5 text-slate-400 hover:text-[#6567F1] transition-colors"
          title="Чек-лист"
        >
          <CheckSquare size={15} />
          {checklistTotal > 0 && (
            <span
              className={`absolute -top-0.5 -right-0.5 w-3.5 h-3.5 text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none ${
                checklistDone === checklistTotal ? "bg-emerald-500" : "bg-slate-400"
              }`}
            >
              {checklistDone === checklistTotal ? "✓" : checklistTotal}
            </span>
          )}
        </button>
        <button
          onClick={() => onComment(task)}
          className="relative p-1.5 text-slate-400 hover:text-[#6567F1] transition-colors"
          title="Комментарии"
        >
          <MessageSquare size={15} />
          {task._count?.comments > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-[#6567F1] text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none">
              {task._count.comments > 9 ? "9+" : task._count.comments}
            </span>
          )}
        </button>
        {canEdit && (
          <button
            onClick={() => onEdit(task)}
            className="p-1.5 text-slate-400 hover:text-[#6567F1] transition-colors"
            title="Редактировать"
          >
            <Pencil size={15} />
          </button>
        )}
        {canDelete && (
          <button
            onClick={() => onDelete(task)}
            className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
            title="Удалить"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

function getNextStatuses(current) {
  const all = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"];
  return all.filter((s) => s !== current);
}

function OrgMultiSelect({ options, value, onChange }) {
  const [search, setSearch] = useState("");

  function toggle(id) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  const filtered = options.filter(
    (o) =>
      !search ||
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      (o.inn && o.inn.includes(search)),
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по названию или ИНН..."
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
        />
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-red-500 transition-colors"
          >
            Снять все ({value.length})
          </button>
        )}
      </div>
      <div className="border border-slate-200 rounded-lg overflow-y-auto max-h-28">
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-sm text-slate-400">Не найдено</div>
        ) : (
          filtered.map((o) => (
            <label
              key={o.id}
              className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm border-b border-slate-100 last:border-0"
            >
              <input
                type="checkbox"
                checked={value.includes(o.id)}
                onChange={() => toggle(o.id)}
                className="accent-[#6567F1] shrink-0"
              />
              <span className="text-slate-800 flex-1 min-w-0 truncate">{o.name}</span>
              {o.inn && <span className="text-slate-400 text-xs shrink-0">{o.inn}</span>}
            </label>
          ))
        )}
      </div>
    </div>
  );
}

function AssigneeMultiSelect({ options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggle(id) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  const selectedLabels = options
    .filter((u) => value.includes(u.id))
    .map((u) => `${u.lastName} ${u.firstName}`)
    .join(", ");

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-left bg-white focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] flex items-center justify-between"
      >
        <span className={selectedLabels ? "text-slate-900" : "text-slate-400"}>
          {selectedLabels || "Не назначено"}
        </span>
        <span className="text-slate-400 text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 w-full bottom-full mb-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">Нет сотрудников</div>
          ) : (
            options.map((u) => (
              <label
                key={u.id}
                className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={value.includes(u.id)}
                  onChange={() => toggle(u.id)}
                  className="accent-[#6567F1]"
                />
                {u.lastName} {u.firstName}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}
