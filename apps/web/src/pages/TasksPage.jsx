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
  ArrowUpDown,
  List,
  Columns3,
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
  { key: "ARCHIVED", label: "Архив" },
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

  // View mode
  const [viewMode, setViewMode] = useState("kanban");

  // Filters
  const [statusTab, setStatusTab] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [dateSort, setDateSort] = useState("desc");

  // Drag state for kanban
  const [dragTaskId, setDragTaskId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [staffUsers, setStaffUsers] = useState([]);

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
    if (hasRole("admin") || hasRole("supervisor") || hasRole("manager")) return true;
    if (task.createdBy?.id === user?.id) return true;
    return task.assignees?.some((a) => a.user?.id === user?.id);
  }

  function canDeleteTask(task) {
    if (!hasPermission("task", "delete")) return false;
    if (hasRole("admin") || hasRole("supervisor") || hasRole("manager")) return true;
    return task.createdBy?.id === user?.id;
  }

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusTab === "ARCHIVED") {
        params.set("archived", "true");
      } else if (viewMode === "list" && statusTab) {
        params.set("status", statusTab);
      }
      const res = await api(`/api/tasks?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTasks(data);
    } catch {
      setError("Не удалось загрузить задачи");
    } finally {
      setLoading(false);
    }
  }, [statusTab, viewMode]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Load staff for assignee filter on mount
  useEffect(() => {
    api("/api/users?excludeRole=client")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setStaffUsers(d);
      })
      .catch(() => {});
  }, []);

  // Load orgs + all staff once when modal opens
  useEffect(() => {
    if (!showModal) return;
    api("/api/organizations?limit=1000")
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
    const canAssignOthers = hasRole("admin") || hasRole("supervisor") || hasRole("manager");

    if (!canAssignOthers) {
      // Accountants can only assign to themselves
      setUsers(user ? [{ id: user.id, firstName: user.firstName, lastName: user.lastName }] : []);
      return;
    }

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

  // Build assignee list from loaded tasks (works for all roles without user:view)
  const assigneesFromTasks = (() => {
    const map = new Map();
    tasks.forEach((t) =>
      t.assignees?.forEach((a) => {
        if (!map.has(a.user.id)) map.set(a.user.id, a.user);
      }),
    );
    // Merge with staffUsers (admins/managers get full list from API)
    staffUsers.forEach((u) => {
      if (!map.has(u.id)) map.set(u.id, u);
    });
    return [...map.values()].sort((a, b) => a.lastName.localeCompare(b.lastName));
  })();

  // Client-side filters + sort
  const filtered = tasks
    .filter((t) => !categoryFilter || t.category === categoryFilter)
    .filter((t) => !assigneeFilter || t.assignees?.some((a) => a.user?.id === assigneeFilter))
    .sort((a, b) => {
      const da = new Date(a.dueDate || a.createdAt).getTime();
      const db = new Date(b.dueDate || b.createdAt).getTime();
      return dateSort === "asc" ? da - db : db - da;
    });

  const isArchiveMode = statusTab === "ARCHIVED";
  const effectiveViewMode = isArchiveMode ? "list" : viewMode;

  function handleDrop(newStatus) {
    if (!dragTaskId || !newStatus) return;
    const task = tasks.find((t) => t.id === dragTaskId);
    if (task && task.status !== newStatus) {
      handleStatusChange(task, newStatus);
    }
    setDragTaskId(null);
    setDragOverCol(null);
  }

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Задачи</h1>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          {!isArchiveMode && (
            <div className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-white shadow text-[#6567F1]" : "text-slate-400 hover:text-slate-600"}`}
                title="Список"
              >
                <List size={15} />
              </button>
              <button
                onClick={() => setViewMode("kanban")}
                className={`p-1.5 rounded-md transition-colors ${viewMode === "kanban" ? "bg-white shadow text-[#6567F1]" : "text-slate-400 hover:text-slate-600"}`}
                title="Канбан"
              >
                <Columns3 size={15} />
              </button>
            </div>
          )}
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
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Status tabs — hidden in kanban (columns are the statuses) */}
        {effectiveViewMode === "list" && (
          <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1">
            {STATUS_TABS.filter(
              (t) => t.key !== "ARCHIVED" || hasRole("admin") || hasRole("supervisor"),
            ).map((t) => (
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
        )}
        {effectiveViewMode === "kanban" && (hasRole("admin") || hasRole("supervisor")) && (
          <button
            onClick={() => {
              setViewMode("list");
              setStatusTab("ARCHIVED");
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-500 hover:text-slate-900 transition-colors"
          >
            Архив
          </button>
        )}

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

        {/* Assignee filter — only for managers and above */}
        {(hasRole("admin") || hasRole("supervisor") || hasRole("manager")) &&
          assigneesFromTasks.length > 0 && (
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30"
            >
              <option value="">Все ответственные</option>
              {assigneesFromTasks.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.lastName} {u.firstName}
                </option>
              ))}
            </select>
          )}

        {/* Date sort */}
        <button
          onClick={() => setDateSort((s) => (s === "desc" ? "asc" : "desc"))}
          className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-600 hover:text-slate-900 hover:border-slate-300 transition-colors"
        >
          <ArrowUpDown size={14} />
          {dateSort === "desc" ? "Сначала новые" : "Сначала старые"}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : error ? (
        <div className="text-sm text-red-500">{error}</div>
      ) : effectiveViewMode === "kanban" ? (
        /* ── Kanban board ── */
        <div
          className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4"
          style={{ minHeight: "calc(100vh - 220px)" }}
        >
          {KANBAN_COLS.map((col) => {
            const colTasks = filtered.filter((t) => t.status === col.key);
            const isOver = dragOverCol === col.key;
            return (
              <div
                key={col.key}
                className={`flex flex-col rounded-2xl border-2 transition-colors shrink-0 w-72 ${isOver ? col.overCls : col.cls}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverCol(col.key);
                }}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={() => handleDrop(col.key)}
              >
                {/* Column header */}
                <div
                  className={`flex items-center justify-between px-4 py-3 rounded-t-xl ${col.headerCls}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                    <span className="text-sm font-semibold text-slate-700">{col.label}</span>
                  </div>
                  <span className="text-xs font-bold text-slate-400 bg-white/60 rounded-full px-2 py-0.5">
                    {colTasks.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 flex flex-col gap-2 p-3 overflow-y-auto">
                  {colTasks.length === 0 && (
                    <div
                      className={`flex-1 flex items-center justify-center text-xs text-slate-400 rounded-xl border-2 border-dashed ${isOver ? "border-[#6567F1]/40 bg-[#6567F1]/5" : "border-slate-200"} min-h-[80px] transition-colors`}
                    >
                      {isOver ? "Перетащите сюда" : "Нет задач"}
                    </div>
                  )}
                  {colTasks.map((task) => (
                    <KanbanCard
                      key={task.id}
                      task={task}
                      canEdit={canEditTask(task)}
                      canDelete={canDeleteTask(task)}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                      onComment={setCommentTask}
                      onChecklist={setChecklistTask}
                      onDragStart={() => setDragTaskId(task.id)}
                      onDragEnd={() => {
                        setDragTaskId(null);
                        setDragOverCol(null);
                      }}
                      isDragging={dragTaskId === task.id}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : /* ── List view ── */
      filtered.length === 0 ? (
        <div className="text-sm text-slate-400">Нет задач</div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              canEdit={statusTab !== "ARCHIVED" && canEditTask(task)}
              canDelete={statusTab !== "ARCHIVED" && canDeleteTask(task)}
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

const KANBAN_COLS = [
  {
    key: "OPEN",
    label: "Открытые",
    cls: "border-slate-200 bg-slate-50/60",
    overCls: "border-[#6567F1]/40 bg-[#6567F1]/5",
    headerCls: "bg-slate-100/80",
    dot: "bg-slate-400",
  },
  {
    key: "IN_PROGRESS",
    label: "В работе",
    cls: "border-blue-200 bg-blue-50/40",
    overCls: "border-blue-400/60 bg-blue-50",
    headerCls: "bg-blue-100/60",
    dot: "bg-blue-400",
  },
  {
    key: "DONE",
    label: "Выполнено",
    cls: "border-emerald-200 bg-emerald-50/40",
    overCls: "border-emerald-400/60 bg-emerald-50",
    headerCls: "bg-emerald-100/60",
    dot: "bg-emerald-400",
  },
  {
    key: "CANCELLED",
    label: "Отменено",
    cls: "border-slate-200 bg-slate-50/30",
    overCls: "border-slate-400/40 bg-slate-100/40",
    headerCls: "bg-slate-100/50",
    dot: "bg-slate-300",
  },
];

function KanbanCard({
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

  return (
    <div
      draggable={canEdit}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group bg-white rounded-xl border p-3 transition-all select-none ${
        isDragging ? "opacity-40 rotate-1 scale-95" : "hover:shadow-md"
      } ${overdue ? "border-red-200" : "border-slate-200"} ${canEdit ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      {/* Priority + category + recurrence */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[10px] text-slate-400 font-medium shrink-0">Приоритет:</span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide ${PRIORITY_COLORS[task.priority]}`}
        >
          {TASK_PRIORITY_LABELS[task.priority]}
        </span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide ${CATEGORY_COLORS[task.category]}`}
        >
          {TASK_CATEGORY_LABELS[task.category]}
        </span>
        {task.recurrenceType && (
          <RefreshCw
            size={10}
            className="text-[#6567F1] ml-auto shrink-0"
            title={RECURRENCE_LABELS[`${task.recurrenceType}:${task.recurrenceInterval}`]}
          />
        )}
      </div>

      {/* Title */}
      <p
        className={`text-sm font-medium leading-snug mb-1.5 ${cancelled ? "line-through text-slate-400" : "text-slate-800"}`}
      >
        {task.title}
      </p>

      {/* Description */}
      {task.description && (
        <p className="text-[11px] text-slate-400 leading-snug line-clamp-2 mb-1.5">
          {task.description}
        </p>
      )}

      {/* Org */}
      {task.organization && (
        <Link
          to={`/organizations/${task.organization.id}`}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-[#6567F1] transition-colors mb-1.5 truncate"
          onClick={(e) => e.stopPropagation()}
        >
          <Building2 size={10} />
          <span className="truncate">{task.organization.name}</span>
        </Link>
      )}

      {/* Who assigned + when */}
      {task.createdBy && (
        <div className="flex items-center gap-1 text-[11px] text-slate-400 mb-2">
          <UserCircle size={10} />
          <span>
            {task.createdBy.lastName} {task.createdBy.firstName}
          </span>
          {task.createdAt && (
            <span className="text-slate-300">
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
            className={`flex items-center gap-1 text-[11px] shrink-0 ${overdue ? "text-red-500 font-semibold" : "text-slate-400"}`}
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
                className="w-5 h-5 rounded-full bg-[#6567F1]/10 border border-[#6567F1]/20 flex items-center justify-center text-[9px] font-bold text-[#6567F1]"
              >
                {a.user.firstName?.[0]}
                {a.user.lastName?.[0]}
              </div>
            ))}
            {task.assignees.length > 3 && (
              <div className="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[9px] font-bold text-slate-400">
                +{task.assignees.length - 3}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onChecklist(task)}
            className="relative p-1 text-slate-300 hover:text-[#6567F1] transition-colors"
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
          <button
            onClick={() => onComment(task)}
            className="relative p-1 text-slate-300 hover:text-[#6567F1] transition-colors"
            title="Комментарии"
          >
            <MessageSquare size={13} />
            {task._count?.comments > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-[#6567F1] text-white text-[7px] font-bold rounded-full flex items-center justify-center">
                {task._count.comments > 9 ? "9+" : task._count.comments}
              </span>
            )}
          </button>
          {canEdit && (
            <button
              onClick={() => onEdit(task)}
              className="p-1 text-slate-300 hover:text-[#6567F1] transition-colors"
              title="Редактировать"
            >
              <Pencil size={13} />
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => onDelete(task)}
              className="p-1 text-slate-300 hover:text-red-500 transition-colors"
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

const PRIORITY_BAR = {
  LOW: "bg-slate-300",
  MEDIUM: "bg-yellow-400",
  HIGH: "bg-orange-400",
  URGENT: "bg-red-500",
};

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
  const cancelled = task.status === "CANCELLED";

  return (
    <div
      className={`group flex items-center gap-3 bg-white border rounded-xl px-3 py-2.5 transition-shadow hover:shadow-md ${overdue ? "border-red-200 bg-red-50/30" : "border-slate-200"}`}
    >
      {/* Priority bar */}
      <div
        className={`w-1 h-8 rounded-full shrink-0 ${PRIORITY_BAR[task.priority]}`}
        title={TASK_PRIORITY_LABELS[task.priority]}
      />

      {/* Category badge */}
      <span
        className={`hidden sm:inline-flex shrink-0 text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide uppercase ${CATEGORY_COLORS[task.category]}`}
      >
        {TASK_CATEGORY_LABELS[task.category]}
      </span>

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium leading-tight truncate ${cancelled ? "line-through text-slate-400" : "text-slate-800"}`}
        >
          {task.title}
        </p>
        <div className="flex items-center gap-2.5 mt-0.5 text-[11px] text-slate-400 flex-wrap">
          {task.organization && (
            <Link
              to={`/organizations/${task.organization.id}`}
              className="flex items-center gap-0.5 hover:text-[#6567F1] transition-colors truncate max-w-[160px]"
            >
              <Building2 size={10} />
              <span className="truncate">{task.organization.name}</span>
            </Link>
          )}
          {task.assignees?.length > 0 && (
            <span
              className="flex items-center gap-0.5 truncate max-w-[140px]"
              title={task.assignees.map((a) => `${a.user.lastName} ${a.user.firstName}`).join(", ")}
            >
              <User size={10} />
              <span className="truncate">
                {task.assignees.map((a) => a.user.firstName).join(", ")}
              </span>
            </span>
          )}
          {task.dueDate && (
            <span
              className={`flex items-center gap-0.5 shrink-0 ${overdue ? "text-red-500 font-semibold" : ""}`}
            >
              <CalendarDays size={10} />
              {formatDueDate(task.dueDate)}
              {overdue && " ⚠"}
            </span>
          )}
          {task.recurrenceType && (
            <span
              className="flex items-center gap-0.5 text-[#6567F1] shrink-0"
              title={RECURRENCE_LABELS[`${task.recurrenceType}:${task.recurrenceInterval}`]}
            >
              <RefreshCw size={10} />
              {RECURRENCE_LABELS[`${task.recurrenceType}:${task.recurrenceInterval}`]}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {canEdit && nextStatuses.length > 0 ? (
          <select
            value={task.status}
            onChange={(e) => onStatusChange(task, e.target.value)}
            className={`text-[11px] border rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 cursor-pointer font-medium ${STATUS_COLORS[task.status]}`}
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
            className={`text-[11px] px-2 py-1 rounded-lg font-medium ${STATUS_COLORS[task.status]}`}
          >
            {TASK_STATUS_LABELS[task.status]}
          </span>
        )}

        <button
          onClick={() => onChecklist(task)}
          className="relative p-1.5 text-slate-300 hover:text-[#6567F1] transition-colors"
          title="Чек-лист"
        >
          <CheckSquare size={14} />
          {checklistTotal > 0 && (
            <span
              className={`absolute -top-0.5 -right-0.5 w-3.5 h-3.5 text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none ${checklistDone === checklistTotal ? "bg-emerald-500" : "bg-slate-400"}`}
            >
              {checklistDone === checklistTotal ? "✓" : checklistTotal}
            </span>
          )}
        </button>

        <button
          onClick={() => onComment(task)}
          className="relative p-1.5 text-slate-300 hover:text-[#6567F1] transition-colors"
          title="Комментарии"
        >
          <MessageSquare size={14} />
          {task._count?.comments > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-[#6567F1] text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none">
              {task._count.comments > 9 ? "9+" : task._count.comments}
            </span>
          )}
        </button>

        {canEdit && (
          <button
            onClick={() => onEdit(task)}
            className="p-1.5 text-slate-300 hover:text-[#6567F1] transition-colors opacity-0 group-hover:opacity-100"
            title="Редактировать"
          >
            <Pencil size={14} />
          </button>
        )}
        {canDelete && (
          <button
            onClick={() => onDelete(task)}
            className="p-1.5 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
            title="Удалить"
          >
            <Trash2 size={14} />
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
