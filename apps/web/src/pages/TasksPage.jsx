import { useState, useEffect, useCallback } from "react";
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
  MessageSquare,
  CheckSquare,
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
  assignedToId: "",
};

export default function TasksPage() {
  const { user, hasPermission, hasRole } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [statusTab, setStatusTab] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [myTasks, setMyTasks] = useState(false);

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
      if (myTasks) params.set("my", "true");
      const res = await api(`/api/tasks?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTasks(data);
    } catch {
      setError("Не удалось загрузить задачи");
    } finally {
      setLoading(false);
    }
  }, [statusTab, myTasks]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Load orgs once when modal opens
  useEffect(() => {
    if (!showModal) return;
    api("/api/organizations")
      .then((r) => r.json())
      .then((d) => setOrgs(d?.organizations || []))
      .catch(() => {});
  }, [showModal]);

  // Load assignable users based on selected org
  useEffect(() => {
    if (!showModal) return;
    if (!form.organizationId) {
      setUsers([]);
      return;
    }
    api(`/api/organizations/${form.organizationId}`)
      .then((r) => r.json())
      .then((org) => {
        const staff = (org.members || []).filter((m) => m.role !== "client").map((m) => m.user);
        setUsers(staff);
      })
      .catch(() => {});
  }, [showModal, form.organizationId]);

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
      assignedToId: task.assignedToId || "",
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
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        title: form.title.trim(),
        description: form.description || null,
        priority: form.priority,
        category: form.category,
        dueDate: form.dueDate || null,
        organizationId: form.organizationId || null,
        assignedToId: form.assignedToId || null,
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

        {/* My tasks toggle */}
        <button
          onClick={() => setMyTasks((v) => !v)}
          className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
            myTasks
              ? "bg-[#6567F1]/10 border-[#6567F1]/30 text-[#6567F1]"
              : "bg-white border-slate-200 text-slate-500 hover:text-slate-900"
          }`}
        >
          Мои задачи
        </button>
      </div>

      {/* Task list */}
      {loading ? (
        <div className="text-sm text-slate-400">Загрузка...</div>
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
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">
                {editingTask ? "Редактировать задачу" : "Новая задача"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
                  rows={3}
                  value={form.description}
                  onChange={(e) => setField("description", e.target.value)}
                  className={INPUT_CLS}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
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
                <label className={LABEL_CLS}>Организация</label>
                <select
                  value={form.organizationId}
                  onChange={(e) => {
                    setField("organizationId", e.target.value);
                    setField("assignedToId", "");
                  }}
                  className={SELECT_CLS}
                >
                  <option value="">Не выбрана</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>Исполнитель</label>
                <select
                  value={form.assignedToId}
                  onChange={(e) => setField("assignedToId", e.target.value)}
                  className={SELECT_CLS}
                  disabled={!form.organizationId}
                >
                  <option value="">
                    {form.organizationId ? "Не назначен" : "Сначала выберите организацию"}
                  </option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.lastName} {u.firstName}
                    </option>
                  ))}
                </select>
              </div>

              {formError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{formError}</div>
              )}

              <div className="flex justify-end gap-3 pt-2">
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
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-start gap-3">
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
          {task.assignedTo && (
            <span className="flex items-center gap-1">
              <User size={12} />
              {task.assignedTo.lastName} {task.assignedTo.firstName}
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
