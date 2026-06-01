import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import {
  Plus,
  Loader2,
  MessageSquare,
  HelpCircle,
  FileSearch,
  AlertTriangle,
  Upload,
  Search,
} from "lucide-react";

const STATUS_LABELS = {
  NEW: "Новый",
  IN_PROGRESS: "В работе",
  WAITING_CLIENT: "Ожидает клиента",
  ON_HOLD: "На паузе",
  ESCALATED: "Эскалация",
  CLOSED: "Закрыт",
  REOPENED: "Переоткрыт",
};

const STATUS_COLORS = {
  NEW: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
  IN_PROGRESS: "bg-yellow-100 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  WAITING_CLIENT: "bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300",
  ON_HOLD: "bg-muted text-body",
  ESCALATED: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
  CLOSED: "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300",
  REOPENED: "bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300",
};

const PRIORITY_LABELS = { LOW: "Низкий", NORMAL: "Обычный", HIGH: "Высокий", URGENT: "Срочный" };
const PRIORITY_COLORS = {
  LOW: "bg-muted text-body",
  NORMAL: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
  HIGH: "bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300",
  URGENT: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
};

const TYPE_LABELS = {
  QUESTION: "Вопрос",
  DOCUMENT_REQUEST: "Запрос документа",
  PROBLEM: "Проблема",
  DOCUMENT_UPLOAD: "Загрузка документа",
};

const TYPE_ICONS = {
  QUESTION: HelpCircle,
  DOCUMENT_REQUEST: FileSearch,
  PROBLEM: AlertTriangle,
  DOCUMENT_UPLOAD: Upload,
};

const TYPE_COLORS = {
  QUESTION: "text-blue-600 dark:text-blue-300",
  DOCUMENT_REQUEST: "text-amber-600 dark:text-amber-300",
  PROBLEM: "text-red-600 dark:text-red-300",
  DOCUMENT_UPLOAD: "text-green-600 dark:text-green-300",
};

export default function TicketsPage() {
  const { hasPermission, hasRole } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tickets, setTickets] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  const [typeFilter, setTypeFilter] = useState(searchParams.get("type") || "");
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [page, setPage] = useState(parseInt(searchParams.get("page") || "1"));

  const isClient = hasRole("client");
  const isStaff =
    hasRole("admin") || hasRole("supervisor") || hasRole("manager") || hasRole("accountant");
  const canCreate = hasPermission("ticket", "create");

  const [showCreate, setShowCreate] = useState(false);
  const [orgs, setOrgs] = useState([]);
  const [createForm, setCreateForm] = useState({
    subject: "",
    type: "QUESTION",
    organizationId: "",
    body: "",
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Auto-open create modal from org page link
  useEffect(() => {
    if (searchParams.get("create") === "true") {
      setShowCreate(true);
      const orgId = searchParams.get("orgId");
      if (orgId) setCreateForm((f) => ({ ...f, organizationId: orgId }));
      setSearchParams({}, { replace: true });
    }
  }, []);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type", typeFilter);
      if (search) params.set("search", search);
      params.set("page", String(page));
      params.set("limit", "20");

      const res = await api(`/api/tickets?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTickets(data.tickets);
      setTotal(data.total);
    } catch {
      setError("Не удалось загрузить тикеты");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, search, page]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    if (!showCreate) return;
    api("/api/organizations?limit=1000")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.organizations || [];
        setOrgs(list);
        if (list.length === 1 && !createForm.organizationId)
          setCreateForm((f) => ({ ...f, organizationId: list[0].id }));
      })
      .catch(() => {});
  }, [showCreate]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!createForm.subject.trim() || !createForm.organizationId || !createForm.body.trim()) {
      setCreateError("Заполните все поля");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await api("/api/tickets", {
        method: "POST",
        body: JSON.stringify(createForm),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Ошибка создания");
      }
      const ticket = await res.json();
      setShowCreate(false);
      setCreateForm({ subject: "", type: "QUESTION", organizationId: "", body: "" });
      navigate(`/tickets/${ticket.id}`);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-heading">{isClient ? "Обращения" : "Тикеты"}</h1>
          <p className="text-sm text-subtle mt-1">
            {total} {isClient ? "обращений" : "тикетов"}
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-xl text-sm font-medium shadow-lg shadow-[#6567F1]/30 transition-all"
          >
            <Plus size={16} />
            {isClient ? "Новое обращение" : "Создать тикет"}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            type="text"
            placeholder="Поиск по теме..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-line rounded-lg text-sm"
        >
          <option value="">Все статусы</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        {isStaff && (
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-line rounded-lg text-sm"
          >
            <option value="">Все типы</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-subtle">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-16 text-red-500 dark:text-red-400">{error}</div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16 text-subtle">
          <MessageSquare size={40} className="mx-auto mb-3 opacity-50" />
          <p>{isClient ? "У вас пока нет обращений" : "Нет тикетов"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => {
            const TypeIcon = TYPE_ICONS[t.type] || HelpCircle;
            return (
              <Link
                key={t.id}
                to={`/tickets/${t.id}`}
                className="block bg-surface rounded-2xl shadow-lg border border-line p-4 hover:shadow-xl transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-subtle font-mono">#{t.number}</span>
                      <TypeIcon size={14} className={TYPE_COLORS[t.type]} />
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[t.status]}`}
                      >
                        {STATUS_LABELS[t.status]}
                      </span>
                      {isStaff && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[t.priority]}`}
                        >
                          {PRIORITY_LABELS[t.priority]}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-medium text-heading truncate">{t.subject}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-subtle">
                      {isStaff && t.organization && <span>{t.organization.name}</span>}
                      <span>{new Date(t.createdAt).toLocaleDateString("ru")}</span>
                      <span>{t._count?.messages || 0} сообщ.</span>
                    </div>
                  </div>
                  {isStaff && t.assignedTo && (
                    <div className="text-xs text-subtle text-right whitespace-nowrap">
                      {t.assignedTo.firstName} {t.assignedTo.lastName}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 text-sm border border-line rounded-lg disabled:opacity-50"
          >
            Назад
          </button>
          <span className="text-sm text-subtle">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 text-sm border border-line rounded-lg disabled:opacity-50"
          >
            Далее
          </button>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-heading">
                {isClient ? "Новое обращение" : "Создать тикет"}
              </h2>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1.5 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors"
              >
                <span className="text-lg leading-none">&times;</span>
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-body mb-1">Организация</label>
                <select
                  value={createForm.organizationId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, organizationId: e.target.value }))}
                  className="w-full px-3 py-2 border border-line rounded-lg text-sm"
                  required
                >
                  <option value="">Выберите организацию</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-body mb-1">Тип</label>
                <select
                  value={createForm.type}
                  onChange={(e) => setCreateForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full px-3 py-2 border border-line rounded-lg text-sm"
                >
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-body mb-1">Тема</label>
                <input
                  type="text"
                  maxLength={200}
                  value={createForm.subject}
                  onChange={(e) => setCreateForm((f) => ({ ...f, subject: e.target.value }))}
                  className="w-full px-3 py-2 border border-line rounded-lg text-sm"
                  placeholder="Краткое описание вопроса"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-body mb-1">Сообщение</label>
                <textarea
                  rows={4}
                  maxLength={5000}
                  value={createForm.body}
                  onChange={(e) => setCreateForm((f) => ({ ...f, body: e.target.value }))}
                  className="w-full px-3 py-2 border border-line rounded-lg text-sm resize-none"
                  placeholder="Опишите ваш вопрос подробнее..."
                  required
                />
              </div>
              {createError && (
                <p className="text-sm text-red-500 dark:text-red-400">{createError}</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm text-body hover:bg-muted rounded-lg transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 text-sm bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg font-medium shadow-lg shadow-[#6567F1]/30 disabled:opacity-50 transition-all"
                >
                  {creating ? "Создание..." : "Создать"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
