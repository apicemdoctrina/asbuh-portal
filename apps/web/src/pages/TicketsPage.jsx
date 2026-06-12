import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import { useApi, jsonFetcher } from "../hooks/useApi.js";
import {
  Plus,
  Loader2,
  MessageSquare,
  HelpCircle,
  FileSearch,
  AlertTriangle,
  Upload,
  Search,
  X,
  Filter,
  ChevronDown,
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

// Левая цветная полоса карточки — отражает статус тикета
const STATUS_BORDER = {
  NEW: "border-l-blue-400",
  IN_PROGRESS: "border-l-yellow-400",
  WAITING_CLIENT: "border-l-orange-400",
  ON_HOLD: "border-l-slate-300",
  ESCALATED: "border-l-red-500",
  CLOSED: "border-l-emerald-400",
  REOPENED: "border-l-purple-400",
};

export default function TicketsPage() {
  const { hasPermission, hasRole } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  const [typeFilter, setTypeFilter] = useState(searchParams.get("type") || "");
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [page, setPage] = useState(parseInt(searchParams.get("page") || "1"));

  // Mobile-only: collapse secondary filters
  const [showFilters, setShowFilters] = useState(false);

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

  const { data, loading, error } = useApi(
    jsonFetcher(() => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type", typeFilter);
      if (search) params.set("search", search);
      params.set("page", String(page));
      params.set("limit", "20");
      return api(`/api/tickets?${params}`);
    }),
    [statusFilter, typeFilter, search, page],
    { errorMessage: "Не удалось загрузить тикеты" },
  );
  const tickets = data?.tickets ?? [];
  const total = data?.total ?? 0;

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
      <div className="flex items-center justify-between gap-2 mb-4 sm:mb-6">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-heading">
            {isClient ? "Обращения" : "Тикеты"}
          </h1>
          <p className="text-xs sm:text-sm text-subtle mt-0.5 sm:mt-1">
            {total} {isClient ? "обращений" : "тикетов"}
          </p>
        </div>
        {/* Desktop create button — на мобилке FAB */}
        {canCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="hidden sm:flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-xl text-sm font-medium shadow-lg shadow-[#6567F1]/30 transition-all"
          >
            <Plus size={16} />
            {isClient ? "Новое обращение" : "Создать тикет"}
          </button>
        )}
      </div>

      {/* Filters — search full-width, остальное под Фильтры на мобилке */}
      <div className="mb-4 sm:mb-6">
        <div className="flex gap-2 sm:gap-3">
          <div className="relative flex-1 min-w-0">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              type="text"
              placeholder="Поиск по теме..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-2.5 sm:py-2 border border-line rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          {/* Mobile filter toggle */}
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="sm:hidden inline-flex items-center gap-1.5 px-3 py-2.5 border border-line rounded-lg text-xs font-medium bg-surface text-body shrink-0"
            aria-expanded={showFilters}
          >
            <Filter size={14} />
            {(statusFilter || typeFilter) && (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-white text-[10px] font-bold">
                {(statusFilter ? 1 : 0) + (typeFilter ? 1 : 0)}
              </span>
            )}
            <ChevronDown
              size={14}
              className={`transition-transform ${showFilters ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        {/* Status/type selects — на мобилке свёрнуты */}
        <div
          className={`${showFilters ? "flex" : "hidden"} sm:flex flex-col sm:flex-row gap-2 sm:gap-3 mt-2 sm:mt-3`}
        >
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-auto px-3 py-2.5 sm:py-2 border border-line rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
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
              className="w-full sm:w-auto px-3 py-2.5 sm:py-2 border border-line rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
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
        <div className="space-y-2 sm:space-y-3">
          {tickets.map((t) => {
            const TypeIcon = TYPE_ICONS[t.type] || HelpCircle;
            return (
              <Link
                key={t.id}
                to={`/tickets/${t.id}`}
                className={`block bg-surface rounded-2xl shadow-sm sm:shadow-lg border border-l-4 border-line p-3 sm:p-4 hover:shadow-xl transition-shadow active:bg-canvas/40 ${STATUS_BORDER[t.status] || "border-l-line"}`}
              >
                {/* Top row: #number + type icon (left), status pill (right) */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs text-subtle font-mono tabular-nums shrink-0">
                    #{t.number}
                  </span>
                  <TypeIcon size={14} className={`${TYPE_COLORS[t.type]} shrink-0`} />
                  <span className="hidden sm:inline text-xs text-subtle truncate">
                    {TYPE_LABELS[t.type]}
                  </span>
                  <span
                    className={`ml-auto text-[11px] sm:text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${STATUS_COLORS[t.status]}`}
                  >
                    {STATUS_LABELS[t.status]}
                  </span>
                  {isStaff && t.priority !== "NORMAL" && (
                    <span
                      className={`text-[11px] sm:text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${PRIORITY_COLORS[t.priority]}`}
                    >
                      {PRIORITY_LABELS[t.priority]}
                    </span>
                  )}
                </div>

                {/* Subject */}
                <h3 className="text-[15px] sm:text-sm font-semibold sm:font-medium text-heading leading-snug">
                  {t.subject}
                </h3>

                {/* Meta footer */}
                <div className="flex items-center gap-x-2.5 gap-y-1 mt-2 sm:mt-1.5 text-xs text-subtle flex-wrap">
                  {isStaff && t.organization && (
                    <span className="truncate max-w-[180px]">{t.organization.name}</span>
                  )}
                  <span className="tabular-nums">
                    {new Date(t.createdAt).toLocaleDateString("ru")}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare size={11} />
                    {t._count?.messages || 0}
                  </span>
                  {isStaff && t.assignedTo && (
                    <span className="ml-auto text-xs text-subtle truncate max-w-[140px]">
                      {t.assignedTo.firstName} {t.assignedTo.lastName}
                    </span>
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

      {/* Mobile FAB — primary action */}
      {canCreate && !showCreate && (
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          aria-label={isClient ? "Новое обращение" : "Создать тикет"}
          className="sm:hidden fixed z-40 bottom-4 right-4 w-14 h-14 rounded-full bg-gradient-to-br from-[#6567F1] to-[#5557E1] text-white shadow-xl shadow-[#6567F1]/40 active:scale-95 active:shadow-md transition-all flex items-center justify-center"
        >
          <Plus size={26} strokeWidth={2.5} />
        </button>
      )}

      {/* Create Modal — centered on sm+, bottom-sheet on mobile */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:bg-black/30 sm:backdrop-blur-sm sm:p-4"
          onClick={() => setShowCreate(false)}
        >
          <form
            onSubmit={handleCreate}
            onClick={(e) => e.stopPropagation()}
            className="bg-surface w-full sm:max-w-lg max-h-[92vh] sm:max-h-[90vh] rounded-t-3xl sm:rounded-2xl shadow-2xl border-x border-t sm:border border-line flex flex-col animate-slide-up sm:animate-none"
          >
            {/* Drag handle (mobile only) */}
            <div className="sm:hidden pt-2 pb-1 flex justify-center shrink-0">
              <div className="w-10 h-1 rounded-full bg-line" />
            </div>

            {/* Sticky header */}
            <div className="flex items-center justify-between px-5 pt-2 sm:pt-4 pb-3 border-b border-line shrink-0">
              <h2 className="text-base sm:text-lg font-bold text-heading">
                {isClient ? "Новое обращение" : "Создать тикет"}
              </h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="p-2 -mr-1 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors"
                aria-label="Закрыть"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 sm:space-y-4">
              <div>
                <label className="block text-sm font-medium text-body mb-1">Организация</label>
                <select
                  value={createForm.organizationId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, organizationId: e.target.value }))}
                  className="w-full px-3 py-3 sm:py-2 border border-line rounded-lg text-base sm:text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
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
                  className="w-full px-3 py-3 sm:py-2 border border-line rounded-lg text-base sm:text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
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
                  className="w-full px-3 py-3 sm:py-2 border border-line rounded-lg text-base sm:text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
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
                  className="w-full px-3 py-3 sm:py-2 border border-line rounded-lg text-base sm:text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                  placeholder="Опишите ваш вопрос подробнее..."
                  required
                />
              </div>
              {createError && (
                <p className="text-sm text-red-500 dark:text-red-400">{createError}</p>
              )}
            </div>

            {/* Sticky footer */}
            <div className="flex gap-2 sm:gap-3 px-5 py-3 border-t border-line bg-surface shrink-0">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-3 sm:py-2 text-sm text-body hover:bg-muted rounded-lg transition-colors"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={creating}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-3 sm:py-2 text-sm bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg font-medium shadow-lg shadow-[#6567F1]/30 disabled:opacity-50 transition-all"
              >
                {creating ? "Создание..." : "Создать"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
