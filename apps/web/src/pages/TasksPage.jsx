import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Plus, Loader2, ArrowUpDown, List, Columns3, ChevronDown, Filter } from "lucide-react";
import TaskCommentsModal from "../components/TaskCommentsModal.jsx";
import TaskChecklistModal from "../components/TaskChecklistModal.jsx";
import TaskFormModal from "../components/tasks/TaskFormModal.jsx";
import TaskCard from "../components/tasks/TaskCard.jsx";
import GroupedTaskRow from "../components/tasks/GroupedTaskRow.jsx";
import KanbanCard from "../components/tasks/KanbanCard.jsx";
import KanbanGroupCard from "../components/tasks/KanbanGroupCard.jsx";
import StatusTabsDropdown from "../components/tasks/StatusTabsDropdown.jsx";
import {
  TASK_CATEGORY_LABELS,
  STATUS_TABS,
  KANBAN_COLS,
  EMPTY_FORM,
  aggStatus,
} from "../components/tasks/taskConstants.js";

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
        <TaskFormModal
          editingTask={editingTask}
          form={form}
          setForm={setForm}
          setField={setField}
          showAdvanced={showAdvanced}
          setShowAdvanced={setShowAdvanced}
          users={users}
          orgs={orgs}
          saving={saving}
          formError={formError}
          onSubmit={handleSubmit}
          onClose={() => setShowModal(false)}
        />
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
