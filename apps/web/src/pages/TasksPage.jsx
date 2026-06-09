import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  ChevronRight,
  ChevronDown,
  Filter,
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
  OPEN: "bg-muted text-body",
  IN_PROGRESS: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
  DONE: "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300",
  CANCELLED: "bg-muted text-subtle line-through",
};

const PRIORITY_COLORS = {
  LOW: "bg-muted text-subtle",
  MEDIUM: "bg-yellow-100 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  HIGH: "bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300",
  URGENT: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
};

const CATEGORY_COLORS = {
  REPORTING: "bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300",
  DOCUMENTS: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
  PAYMENT: "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300",
  OTHER: "bg-muted text-body",
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
  "w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface";
const LABEL_CLS = "block text-sm font-medium text-body mb-1";

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
  visibleToClient: false,
  userTouchedVisible: false,
};

export default function TasksPage() {
  const { user, hasPermission, hasRole } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // View mode
  const [viewMode, setViewMode] = useState("kanban");

  // Mobile detection (matches Tailwind sm breakpoint)
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches,
  );
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 639px)");
    const handler = (e) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // Mobile-only: collapse advanced fields in create modal
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Mobile-only: collapse secondary filters
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [statusTab, setStatusTab] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [dateSort, setDateSort] = useState("desc");

  // Drag state for kanban
  const [dragTaskId, setDragTaskId] = useState(null);
  const [dragGroupId, setDragGroupId] = useState(null);
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
    const merged = { ...EMPTY_FORM, ...prefill };
    if (!merged.userTouchedVisible) {
      merged.visibleToClient = merged.category === "REPORTING";
    }
    setForm(merged);
    setFormError(null);
    setShowAdvanced(false);
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
      organizationIds: [],
      addOrganizationIds: [],
      assignedToIds: task.assignees?.map((a) => a.userId) ?? [],
      recurrence: task.recurrenceType ? `${task.recurrenceType}:${task.recurrenceInterval}` : "",
      visibleToClient: task.visibleToClient ?? false,
      userTouchedVisible: false,
    });
    setFormError(null);
    setShowAdvanced(true); // editing: show all fields right away
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
          ? {
              organizationId: form.organizationId || null,
              addOrganizationIds: form.addOrganizationIds?.length
                ? form.addOrganizationIds
                : undefined,
            }
          : { organizationIds: form.organizationIds }),
        assignedToIds: form.assignedToIds,
        recurrenceType: recurrenceType || null,
        recurrenceInterval: recurrenceInterval ? Number(recurrenceInterval) : 1,
        visibleToClient: form.visibleToClient,
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

  async function handleGroupStatusChange(groupId, newStatus) {
    const groupTasks = tasks.filter((t) => t.groupId === groupId && t.status !== newStatus);
    if (groupTasks.length === 0) return;
    try {
      await Promise.all(
        groupTasks.map((t) =>
          api(`/api/tasks/${t.id}`, { method: "PUT", body: JSON.stringify({ status: newStatus }) }),
        ),
      );
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

  // Group tasks by groupId for list view
  const displayItems = useMemo(() => {
    const groupMap = new Map();
    const items = [];
    for (const task of filtered) {
      if (!task.groupId) {
        items.push({ type: "single", task });
      } else {
        if (!groupMap.has(task.groupId)) {
          const group = { type: "group", groupId: task.groupId, tasks: [] };
          groupMap.set(task.groupId, group);
          items.push(group);
        }
        groupMap.get(task.groupId).tasks.push(task);
      }
    }
    return items;
  }, [filtered]);

  // Group tasks for kanban: each group → one card in aggStatus column
  const kanbanItems = useMemo(() => {
    const groupMap = new Map();
    const items = [];
    for (const task of filtered) {
      if (!task.groupId) {
        items.push({ type: "single", task });
      } else {
        if (!groupMap.has(task.groupId)) {
          const group = { type: "group", groupId: task.groupId, tasks: [] };
          groupMap.set(task.groupId, group);
          items.push(group);
        }
        groupMap.get(task.groupId).tasks.push(task);
      }
    }
    return items;
  }, [filtered]);

  const isArchiveMode = statusTab === "ARCHIVED";
  const effectiveViewMode = isArchiveMode || isMobile ? "list" : viewMode;

  function handleDrop(newStatus) {
    if (!newStatus) return;
    if (dragGroupId) {
      handleGroupStatusChange(dragGroupId, newStatus);
    } else if (dragTaskId) {
      const task = tasks.find((t) => t.id === dragTaskId);
      if (task && task.status !== newStatus) handleStatusChange(task, newStatus);
    }
    setDragTaskId(null);
    setDragGroupId(null);
    setDragOverCol(null);
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4 sm:mb-5 gap-2">
        <h1 className="text-xl sm:text-2xl font-bold text-heading">Задачи</h1>
        <div className="flex items-center gap-2">
          {/* View toggle — desktop only */}
          {!isArchiveMode && (
            <div className="hidden sm:flex gap-0.5 bg-muted rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-surface shadow text-primary" : "text-subtle hover:text-body"}`}
                title="Список"
              >
                <List size={15} />
              </button>
              <button
                onClick={() => setViewMode("kanban")}
                className={`p-1.5 rounded-md transition-colors ${viewMode === "kanban" ? "bg-surface shadow text-primary" : "text-subtle hover:text-body"}`}
                title="Канбан"
              >
                <Columns3 size={15} />
              </button>
            </div>
          )}
          {/* Desktop create button (mobile uses FAB) */}
          {canCreate && (
            <button
              onClick={() => openCreate()}
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all"
            >
              <Plus size={16} />
              Создать задачу
            </button>
          )}
        </div>
      </div>

      {/* Filters — status tabs scroll horizontally on mobile */}
      <div className="mb-3 sm:mb-5">
        {/* Status tabs — hidden in kanban (columns are the statuses) */}
        {effectiveViewMode === "list" && (
          <>
            {/* Mobile: single pill dropdown */}
            <StatusTabsDropdown
              value={statusTab}
              onChange={setStatusTab}
              showArchived={hasRole("admin") || hasRole("supervisor")}
            />
            {/* Desktop: full pill row */}
            <div className="hidden sm:flex flex-wrap gap-1 bg-surface border border-line rounded-xl p-1">
              {STATUS_TABS.filter(
                (t) => t.key !== "ARCHIVED" || hasRole("admin") || hasRole("supervisor"),
              ).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setStatusTab(t.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    statusTab === t.key ? "bg-primary text-white" : "text-subtle hover:text-heading"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </>
        )}
        {effectiveViewMode === "kanban" && (hasRole("admin") || hasRole("supervisor")) && (
          <button
            onClick={() => {
              setViewMode("list");
              setStatusTab("ARCHIVED");
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-line bg-surface text-subtle hover:text-heading transition-colors"
          >
            Архив
          </button>
        )}

        {/* Secondary filters — collapsible on mobile, inline on sm+ */}
        <div className="mt-2 sm:mt-3 flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Mobile toggle */}
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="sm:hidden inline-flex items-center gap-1.5 px-3 py-2 border border-line rounded-lg text-xs font-medium bg-surface text-body"
            aria-expanded={showFilters}
          >
            <Filter size={14} />
            Фильтры
            {(categoryFilter || assigneeFilter) && (
              <span className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-white text-[10px] font-bold">
                {(categoryFilter ? 1 : 0) + (assigneeFilter ? 1 : 0)}
              </span>
            )}
            <ChevronDown
              size={14}
              className={`transition-transform ${showFilters ? "rotate-180" : ""}`}
            />
          </button>

          {/* Date sort — always visible */}
          <button
            onClick={() => setDateSort((s) => (s === "desc" ? "asc" : "desc"))}
            className="flex items-center gap-1.5 px-3 py-2 border border-line rounded-lg text-xs sm:text-sm bg-surface text-body hover:text-heading transition-colors"
          >
            <ArrowUpDown size={14} />
            <span className="hidden xs:inline sm:inline">
              {dateSort === "desc" ? "Сначала новые" : "Сначала старые"}
            </span>
            <span className="xs:hidden sm:hidden">{dateSort === "desc" ? "Новые" : "Старые"}</span>
          </button>

          {/* Category + Assignee selects — full-width below on mobile when expanded */}
          <div
            className={`${showFilters ? "flex" : "hidden"} sm:flex w-full sm:w-auto flex-col sm:flex-row gap-2 sm:gap-3`}
          >
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 border border-line rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-auto"
            >
              <option value="">Все категории</option>
              {Object.entries(TASK_CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>

            {(hasRole("admin") || hasRole("supervisor") || hasRole("manager")) &&
              assigneesFromTasks.length > 0 && (
                <select
                  value={assigneeFilter}
                  onChange={(e) => setAssigneeFilter(e.target.value)}
                  className="px-3 py-2 border border-line rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-auto"
                >
                  <option value="">Все ответственные</option>
                  {assigneesFromTasks.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.lastName} {u.firstName}
                    </option>
                  ))}
                </select>
              )}
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-subtle">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : error ? (
        <div className="text-sm text-red-500 dark:text-red-400">{error}</div>
      ) : effectiveViewMode === "kanban" ? (
        /* ── Kanban board ── */
        <div
          className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4"
          style={{ minHeight: "calc(100vh - 220px)" }}
        >
          {KANBAN_COLS.map((col) => {
            const colItems = kanbanItems.filter((item) =>
              item.type === "single"
                ? item.task.status === col.key
                : aggStatus(item.tasks) === col.key,
            );
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
                    <span className="text-sm font-semibold text-body">{col.label}</span>
                  </div>
                  <span className="text-xs font-bold text-subtle bg-surface/60 rounded-full px-2 py-0.5">
                    {colItems.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 flex flex-col gap-2 p-3 overflow-y-auto">
                  {colItems.length === 0 && (
                    <div
                      className={`flex-1 flex items-center justify-center text-xs text-subtle rounded-xl border-2 border-dashed ${isOver ? "border-primary/40 bg-primary/5" : "border-line"} min-h-[80px] transition-colors`}
                    >
                      {isOver ? "Перетащите сюда" : "Нет задач"}
                    </div>
                  )}
                  {colItems.map((item) =>
                    item.type === "single" ? (
                      <KanbanCard
                        key={item.task.id}
                        task={item.task}
                        canEdit={canEditTask(item.task)}
                        canDelete={canDeleteTask(item.task)}
                        onEdit={openEdit}
                        onDelete={handleDelete}
                        onComment={setCommentTask}
                        onChecklist={setChecklistTask}
                        onDragStart={() => setDragTaskId(item.task.id)}
                        onDragEnd={() => {
                          setDragTaskId(null);
                          setDragOverCol(null);
                        }}
                        isDragging={dragTaskId === item.task.id}
                      />
                    ) : (
                      <KanbanGroupCard
                        key={item.groupId}
                        tasks={item.tasks}
                        canEdit={item.tasks.some(canEditTask)}
                        canEditTask={canEditTask}
                        onEdit={openEdit}
                        onDelete={handleDelete}
                        onStatusChange={handleStatusChange}
                        onComment={setCommentTask}
                        onDragStart={() => setDragGroupId(item.groupId)}
                        onDragEnd={() => {
                          setDragGroupId(null);
                          setDragOverCol(null);
                        }}
                        isDragging={dragGroupId === item.groupId}
                      />
                    ),
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : /* ── List view ── */
      displayItems.length === 0 ? (
        <div className="text-sm text-subtle">Нет задач</div>
      ) : (
        <div className="space-y-1.5">
          {displayItems.map((item) =>
            item.type === "single" ? (
              <TaskCard
                key={item.task.id}
                task={item.task}
                canEdit={statusTab !== "ARCHIVED" && canEditTask(item.task)}
                canDelete={statusTab !== "ARCHIVED" && canDeleteTask(item.task)}
                onEdit={openEdit}
                onDelete={handleDelete}
                onStatusChange={handleStatusChange}
                onComment={setCommentTask}
                onChecklist={setChecklistTask}
              />
            ) : (
              <GroupedTaskRow
                key={item.groupId}
                tasks={item.tasks}
                canEdit={(task) => statusTab !== "ARCHIVED" && canEditTask(task)}
                canDelete={(task) => statusTab !== "ARCHIVED" && canDeleteTask(task)}
                onEdit={openEdit}
                onDelete={handleDelete}
                onStatusChange={handleStatusChange}
                onComment={setCommentTask}
                onChecklist={setChecklistTask}
              />
            ),
          )}
        </div>
      )}

      {/* Modal — centered card on sm+, bottom-sheet on mobile */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:bg-black/30 sm:p-4">
          <form
            onSubmit={handleSubmit}
            className="bg-surface w-full sm:max-w-lg max-h-[92vh] sm:max-h-[90vh] rounded-t-3xl sm:rounded-2xl shadow-2xl border-x border-t sm:border border-line flex flex-col animate-slide-up sm:animate-none"
          >
            {/* Drag handle (mobile only) */}
            <div className="sm:hidden pt-2 pb-1 flex justify-center shrink-0">
              <div className="w-10 h-1 rounded-full bg-line" />
            </div>

            {/* Sticky header */}
            <div className="flex items-center justify-between px-5 pt-2 sm:pt-4 pb-3 border-b border-line shrink-0">
              <h2 className="text-base sm:text-base font-bold text-heading">
                {editingTask ? "Редактировать задачу" : "Новая задача"}
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-2 -mr-1 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors"
                aria-label="Закрыть"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <div>
                <label className={LABEL_CLS}>Заголовок *</label>
                <input
                  type="text"
                  autoFocus
                  value={form.title}
                  onChange={(e) => setField("title", e.target.value)}
                  className="w-full px-3 py-3 sm:py-2 border border-line rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
                  placeholder="Например: Сдать отчёт по НДС"
                  enterKeyHint="next"
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Описание</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setField("description", e.target.value)}
                  className="w-full px-3 py-3 sm:py-2 border border-line rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
                  placeholder="Можно надиктовать голосом"
                />
              </div>

              {/* Mobile: Дедлайн всегда на виду; Подробнее раскрывает остальное */}
              <div className="sm:hidden">
                <label className={LABEL_CLS}>Дедлайн</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setField("dueDate", e.target.value)}
                  className="w-full px-3 py-3 border border-line rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
                />
              </div>

              {/* Toggle for advanced fields — mobile only */}
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="sm:hidden w-full flex items-center justify-between gap-2 px-3 py-2.5 -mx-1 rounded-lg text-sm font-medium text-primary hover:bg-primary/5 transition-colors"
                aria-expanded={showAdvanced}
              >
                <span>{showAdvanced ? "Свернуть" : "Подробнее"}</span>
                <ChevronDown
                  size={16}
                  className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`}
                />
              </button>

              {/* Advanced fields — always visible on sm+, behind toggle on mobile */}
              <div className={`${showAdvanced ? "block" : "hidden"} sm:block space-y-3`}>
                <div className="flex items-start gap-2.5 py-0.5">
                  <input
                    id="visibleToClient"
                    type="checkbox"
                    checked={form.visibleToClient}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        visibleToClient: e.target.checked,
                        userTouchedVisible: true,
                      }))
                    }
                    className="mt-0.5 h-5 w-5 sm:h-4 sm:w-4 rounded accent-[#6567F1] cursor-pointer shrink-0"
                  />
                  <div>
                    <label
                      htmlFor="visibleToClient"
                      className="block text-sm font-medium text-body cursor-pointer"
                    >
                      Показывать клиенту в ленте
                    </label>
                    <p className="text-xs text-subtle mt-0.5">
                      После закрытия задача появится у клиента в разделе «Что мы для вас делаем».
                      Заголовок задачи будет показан клиенту дословно — например, «Сдана декларация
                      УСН за Q1».
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL_CLS}>Приоритет</label>
                    <select
                      value={form.priority}
                      onChange={(e) => setField("priority", e.target.value)}
                      className="w-full px-3 py-3 sm:py-2 border border-line rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
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
                      onChange={(e) => {
                        const newCat = e.target.value;
                        setForm((f) => ({
                          ...f,
                          category: newCat,
                          visibleToClient:
                            !editingTask && !f.userTouchedVisible
                              ? newCat === "REPORTING"
                              : f.visibleToClient,
                        }));
                      }}
                      className="w-full px-3 py-3 sm:py-2 border border-line rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
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
                  {/* Дедлайн дублируется только для desktop (на мобилке выше) */}
                  <div className="hidden sm:block">
                    <label className={LABEL_CLS}>Дедлайн</label>
                    <input
                      type="date"
                      value={form.dueDate}
                      onChange={(e) => setField("dueDate", e.target.value)}
                      className={INPUT_CLS}
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className={LABEL_CLS}>Повторение</label>
                    <select
                      value={form.recurrence}
                      onChange={(e) => setField("recurrence", e.target.value)}
                      className="w-full px-3 py-3 sm:py-2 border border-line rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
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
                    <>
                      <select
                        value={form.organizationId}
                        onChange={(e) => {
                          setField("organizationId", e.target.value);
                          setField("assignedToIds", []);
                        }}
                        className="w-full px-3 py-3 sm:py-2 border border-line rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
                      >
                        <option value="">Без организации</option>
                        {orgs.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                      <div className="mt-2">
                        <label className="block text-xs font-medium text-subtle mb-1">
                          Добавить ещё организации (создаст копии задачи)
                        </label>
                        <OrgMultiSelect
                          options={orgs.filter((o) => o.id !== form.organizationId)}
                          value={form.addOrganizationIds || []}
                          onChange={(ids) => setField("addOrganizationIds", ids)}
                        />
                      </div>
                    </>
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
              </div>

              {formError && (
                <div className="p-3 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg text-sm">
                  {formError}
                </div>
              )}
            </div>

            {/* Sticky footer */}
            <div className="flex gap-2 sm:gap-3 px-5 py-3 border-t border-line bg-surface shrink-0">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-3 sm:py-2 border-2 border-primary/20 text-primary hover:bg-primary/5 rounded-lg text-sm font-medium transition-colors"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-3 sm:py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50"
              >
                <Save size={16} />
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </form>
        </div>
      )}

      {commentTask && (
        <TaskCommentsModal
          task={commentTask}
          onClose={() => {
            setTasks((prev) =>
              prev.map((t) => (t.id === commentTask.id ? { ...t, hasUnreadComments: false } : t)),
            );
            setCommentTask(null);
          }}
        />
      )}
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

      {/* Mobile FAB — quick task creation; placed above the bug-report FAB */}
      {canCreate && !showModal && (
        <button
          type="button"
          onClick={() => openCreate()}
          aria-label="Создать задачу"
          className="sm:hidden fixed z-40 bottom-4 right-4 w-14 h-14 rounded-full bg-gradient-to-br from-[#6567F1] to-[#5557E1] text-white shadow-xl shadow-[#6567F1]/40 active:scale-95 active:shadow-md transition-all flex items-center justify-center"
        >
          <Plus size={26} strokeWidth={2.5} />
        </button>
      )}
    </>
  );
}

function aggStatus(tasks) {
  if (tasks.every((t) => t.status === "DONE")) return "DONE";
  if (tasks.every((t) => t.status === "CANCELLED")) return "CANCELLED";
  if (tasks.every((t) => t.status === "DONE" || t.status === "CANCELLED")) return "DONE";
  if (tasks.some((t) => t.status === "IN_PROGRESS")) return "IN_PROGRESS";
  return "OPEN";
}

function GroupedTaskRow({
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

const KANBAN_COLS = [
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

function KanbanGroupCard({
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

const PRIORITY_BAR = {
  LOW: "bg-slate-300",
  MEDIUM: "bg-yellow-400",
  HIGH: "bg-orange-400",
  URGENT: "bg-red-500",
};

const PRIORITY_BORDER = {
  LOW: "border-l-slate-300",
  MEDIUM: "border-l-yellow-400",
  HIGH: "border-l-orange-400",
  URGENT: "border-l-red-500",
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
          className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-subtle hover:text-red-500 dark:hover:text-red-400 transition-colors"
          >
            Снять все ({value.length})
          </button>
        )}
      </div>
      <div className="border border-line rounded-lg overflow-y-auto max-h-28">
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-sm text-subtle">Не найдено</div>
        ) : (
          filtered.map((o) => (
            <label
              key={o.id}
              className="flex items-center gap-2 px-3 py-2 hover:bg-canvas cursor-pointer text-sm border-b border-line last:border-0"
            >
              <input
                type="checkbox"
                checked={value.includes(o.id)}
                onChange={() => toggle(o.id)}
                className="accent-[#6567F1] shrink-0"
              />
              <span className="text-heading flex-1 min-w-0 truncate">{o.name}</span>
              {o.inn && <span className="text-subtle text-xs shrink-0">{o.inn}</span>}
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
        className="w-full px-3 py-2 border border-line rounded-lg text-sm text-left bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary flex items-center justify-between"
      >
        <span className={selectedLabels ? "text-heading" : "text-subtle"}>
          {selectedLabels || "Не назначено"}
        </span>
        <span className="text-subtle text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 w-full bottom-full mb-1 bg-surface border border-line rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-subtle">Нет сотрудников</div>
          ) : (
            options.map((u) => (
              <label
                key={u.id}
                className="flex items-center gap-2 px-3 py-2 hover:bg-canvas cursor-pointer text-sm"
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

function StatusTabsDropdown({ value, onChange, showArchived }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (!open) return;
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open]);

  const options = STATUS_TABS.filter((t) => t.key !== "ARCHIVED" || showArchived);
  const current = options.find((t) => t.key === value) || options[0];

  return (
    <div ref={ref} className="sm:hidden relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-xl text-sm font-medium shadow-sm shadow-primary/20 active:scale-95 transition-transform"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{current.label}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute z-30 left-0 top-full mt-1.5 min-w-[180px] bg-surface border border-line rounded-xl shadow-xl overflow-hidden py-1"
        >
          {options.map((t) => {
            const active = t.key === value;
            return (
              <button
                key={t.key}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(t.key);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-primary/10 text-primary" : "text-body hover:bg-muted"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
