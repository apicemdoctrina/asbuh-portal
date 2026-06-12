import { useState, useEffect, useCallback } from "react";
import { useDebouncedEffect } from "../hooks/useDebouncedEffect.js";
import { useApi } from "../hooks/useApi.js";
import { api } from "../lib/api.js";
import {
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
} from "lucide-react";

// Human-readable Russian labels and colors for known actions
const ACTION_META = {
  login: {
    label: "Вход",
    color:
      "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30",
  },
  login_failed: {
    label: "Неудачный вход",
    color:
      "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30",
  },
  logout: { label: "Выход", color: "bg-muted text-body border border-line" },
  user_created: {
    label: "Пользователь создан",
    color:
      "bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-500/30",
  },
  user_updated: {
    label: "Профиль изменён",
    color:
      "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30",
  },
  user_deactivated: {
    label: "Пользователь отключён",
    color:
      "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30",
  },
  user_activated: {
    label: "Пользователь включён",
    color:
      "bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-500/30",
  },
  role_assigned: {
    label: "Роль назначена",
    color:
      "bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30",
  },
  invite_created: {
    label: "Приглашение создано",
    color:
      "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30",
  },
  invite_accepted: {
    label: "Приглашение принято",
    color:
      "bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-500/30",
  },
  client_registered: {
    label: "Клиент зарегистрирован",
    color:
      "bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-500/30",
  },
  password_reset: {
    label: "Пароль сброшен",
    color:
      "bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-500/30",
  },
  "task.create": {
    label: "Задача создана",
    color:
      "bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-500/30",
  },
  "task.update": {
    label: "Задача изменена",
    color:
      "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30",
  },
  "task.delete": {
    label: "Задача удалена",
    color:
      "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30",
  },
  "org.create": {
    label: "Организация создана",
    color:
      "bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-500/30",
  },
  "org.update": {
    label: "Организация изменена",
    color:
      "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30",
  },
  "org.delete": {
    label: "Организация удалена",
    color:
      "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30",
  },
  "org.archive": {
    label: "Организация архивирована",
    color: "bg-muted text-body border border-line",
  },
  "org.restore": {
    label: "Организация восстановлена",
    color:
      "bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-500/30",
  },
  "document.upload": {
    label: "Документ загружен",
    color:
      "bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-500/30",
  },
  "document.delete": {
    label: "Документ удалён",
    color:
      "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30",
  },
  "section.create": {
    label: "Участок создан",
    color:
      "bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-500/30",
  },
  "section.update": {
    label: "Участок изменён",
    color:
      "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30",
  },
  "section.delete": {
    label: "Участок удалён",
    color:
      "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30",
  },
  "knowledge.create": {
    label: "Статья создана",
    color:
      "bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-500/30",
  },
  "knowledge.update": {
    label: "Статья изменена",
    color:
      "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30",
  },
  "knowledge.delete": {
    label: "Статья удалена",
    color:
      "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30",
  },
  "work_contact.create": {
    label: "Контакт создан",
    color:
      "bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-500/30",
  },
  "work_contact.update": {
    label: "Контакт изменён",
    color:
      "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30",
  },
  "work_contact.delete": {
    label: "Контакт удалён",
    color:
      "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30",
  },
  "secret.view": {
    label: "Просмотр секрета",
    color:
      "bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-500/30",
  },
};

// Friendly Russian names for entity types
const ENTITY_LABELS = {
  user: "Пользователь",
  organization: "Организация",
  section: "Участок",
  document: "Документ",
  invite_token: "Приглашение",
  work_contact: "Контакт",
  task: "Задача",
  knowledge: "База знаний",
};

// Keys to skip in the details panel (already shown in main columns)
const SKIP_DETAIL_KEYS = new Set(["id"]);

// Detail fields with Russian labels
const DETAIL_LABELS = {
  title: "Название",
  name: "Имя",
  email: "Email",
  organizationId: "ID организации",
  organizationName: "Организация",
  status: "Статус",
  priority: "Приоритет",
  category: "Категория",
  dueDate: "Срок",
  roleNames: "Роли",
  description: "Описание",
  phone: "Телефон",
  comment: "Комментарий",
};

// Status/priority label map
const STATUS_LABELS = {
  OPEN: "Открыта",
  IN_PROGRESS: "В работе",
  DONE: "Выполнена",
  CANCELLED: "Отменена",
};
const PRIORITY_LABELS = { LOW: "Низкий", MEDIUM: "Средний", HIGH: "Высокий", URGENT: "Срочный" };

const ENTITY_OPTIONS = [
  { value: "", label: "Все сущности" },
  { value: "user", label: "Пользователь" },
  { value: "organization", label: "Организация" },
  { value: "section", label: "Участок" },
  { value: "document", label: "Документ" },
  { value: "invite_token", label: "Приглашение" },
  { value: "work_contact", label: "Контакт" },
  { value: "task", label: "Задача" },
  { value: "knowledge", label: "База знаний" },
];

const LIMIT = 50;

export default function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = (entity ? 1 : 0) + (action ? 1 : 0) + (from ? 1 : 0) + (to ? 1 : 0);

  // Load distinct actions for the filter dropdown
  const { data: actionsData } = useApi(async () => {
    const r = await api("/api/audit-logs/actions");
    return r.ok ? r.json() : [];
  }, []);
  const actionOptions = actionsData ?? [];

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(LIMIT));
      if (search) params.set("search", search);
      if (entity) params.set("entity", entity);
      if (action) params.set("action", action);
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const res = await api(`/api/audit-logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.data);
        setTotal(data.total);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, search, entity, action, from, to]);

  useDebouncedEffect(fetchLogs, [fetchLogs]);

  useEffect(() => {
    setPage(1);
  }, [search, entity, action, from, to]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  function formatDateTime(dateStr) {
    const d = new Date(dateStr);
    return {
      date: d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }),
      time: d.toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    };
  }

  function userName(user) {
    if (!user) return "—";
    return `${user.firstName} ${user.lastName}`;
  }

  function userEmail(user) {
    if (!user?.email) return null;
    return user.email;
  }

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold text-heading mb-4 sm:mb-6">Журнал действий</h1>

      {/* Filters */}
      <div className="mb-4 sm:mb-6">
        <div className="flex gap-2 mb-2 sm:mb-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              type="text"
              placeholder="Поиск..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className={`sm:hidden inline-flex items-center gap-1.5 px-3 py-2.5 border rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              filtersOpen || activeFilters > 0
                ? "border-primary text-primary bg-primary/5"
                : "border-line text-body"
            }`}
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal size={15} />
            {activeFilters > 0 && (
              <span className="bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {activeFilters}
              </span>
            )}
          </button>
        </div>

        <div
          className={`${filtersOpen ? "grid" : "hidden"} sm:flex grid-cols-2 gap-2 sm:gap-3 sm:flex-wrap`}
        >
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            className="px-3 py-2.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
          >
            {ENTITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="px-3 py-2.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
          >
            <option value="">Все действия</option>
            {actionOptions.map((a) => (
              <option key={a} value={a}>
                {ACTION_META[a]?.label ?? a}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={() => {
                setEntity("");
                setAction("");
                setFrom("");
                setTo("");
              }}
              className="col-span-2 sm:col-span-1 text-xs text-subtle hover:text-primary self-center"
            >
              Сбросить
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-subtle">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-subtle text-sm bg-surface rounded-2xl border border-line">
          Нет записей
        </div>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="lg:hidden space-y-1.5">
            {logs.map((log) => (
              <LogCard
                key={log.id}
                log={log}
                expanded={expandedId === log.id}
                onToggle={() => setExpandedId(expandedId === log.id ? null : log.id)}
                formatDateTime={formatDateTime}
                userName={userName}
                userEmail={userEmail}
              />
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden lg:block bg-surface rounded-2xl shadow-lg border border-line overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-subtle uppercase tracking-wide">
                    <th className="px-5 py-3 font-medium whitespace-nowrap">Дата / Время</th>
                    <th className="px-5 py-3 font-medium">Пользователь</th>
                    <th className="px-5 py-3 font-medium">Действие</th>
                    <th className="px-5 py-3 font-medium">Объект</th>
                    <th className="px-5 py-3 font-medium">Что изменилось</th>
                    <th className="px-5 py-3 font-medium">IP</th>
                    <th className="px-5 py-3 font-medium w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <LogRow
                      key={log.id}
                      log={log}
                      expanded={expandedId === log.id}
                      onToggle={() => setExpandedId(expandedId === log.id ? null : log.id)}
                      formatDateTime={formatDateTime}
                      userName={userName}
                      userEmail={userEmail}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {total > 0 && (
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 mt-2 sm:mt-0 bg-surface rounded-2xl lg:rounded-t-none lg:border-t border border-line lg:border-x lg:border-b text-sm text-subtle">
              <span className="text-xs sm:text-sm">
                <span className="hidden sm:inline">Всего </span>
                {total} <span className="hidden sm:inline">записей</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Назад"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-body font-medium text-xs sm:text-sm tabular-nums">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Вперёд"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LogCard({ log, expanded, onToggle, formatDateTime, userName, userEmail }) {
  const hasDetails =
    (log.details && Object.keys(log.details).length > 0) || log.userAgent || log.entityId;
  const { date, time } = formatDateTime(log.createdAt);
  const email = userEmail(log.user);
  const entityLabel = log.entity ? (ENTITY_LABELS[log.entity] ?? log.entity) : null;
  const objectName =
    log.details?.name ?? log.details?.title ?? log.details?.email ?? log.details?.organizationName;
  const dateCompact = date.slice(0, 5); // dd.mm

  return (
    <div
      className={`bg-surface border rounded-xl transition-colors ${
        expanded ? "border-primary/30 bg-canvas/60" : "border-line"
      } ${hasDetails ? "cursor-pointer" : ""}`}
      onClick={hasDetails ? onToggle : undefined}
    >
      <div className="px-3 py-2">
        {/* Line 1: time + action badge + chevron */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-subtle tabular-nums shrink-0">
            <span className="text-body font-medium">{dateCompact}</span> {time.slice(0, 5)}
          </span>
          <ActionBadge action={log.action} />
          {hasDetails && (
            <span className="ml-auto text-subtle shrink-0">
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </span>
          )}
        </div>

        {/* Line 2: user + (entity · object) */}
        <div className="mt-1 flex items-baseline gap-1.5 text-xs min-w-0">
          <span className="text-body font-medium truncate">{userName(log.user)}</span>
          {(entityLabel || objectName) && (
            <span className="text-subtle truncate">
              · {entityLabel}
              {objectName && `: ${String(objectName)}`}
            </span>
          )}
        </div>

        {/* Line 3: summary (only if details exist and is informative) */}
        {log.details && Object.keys(log.details).length > 0 && (
          <div className="mt-1">
            <DetailsSummary details={log.details} />
          </div>
        )}

        {/* Line 4 (faint): email + IP */}
        {(email || log.ipAddress) && (
          <div className="mt-1 flex items-center gap-2 text-[10px] text-subtle truncate">
            {email && <span className="truncate">{email}</span>}
            {email && log.ipAddress && <span>·</span>}
            {log.ipAddress && <span className="font-mono">{log.ipAddress}</span>}
          </div>
        )}
      </div>

      {expanded && hasDetails && (
        <div className="px-3 pb-3 pt-2 border-t border-line" onClick={(e) => e.stopPropagation()}>
          <DetailsPanel log={log} />
        </div>
      )}
    </div>
  );
}

function ActionBadge({ action }) {
  const meta = ACTION_META[action];
  if (meta) {
    return (
      <span
        className={`inline-block px-1.5 py-0 rounded text-[11px] font-medium leading-5 truncate ${meta.color}`}
      >
        {meta.label}
      </span>
    );
  }
  // Unknown action: generic badge
  return (
    <span className="inline-block px-1.5 py-0 rounded text-[11px] font-medium leading-5 truncate bg-primary/10 text-primary border border-primary/20">
      {action}
    </span>
  );
}

function EntityCell({ entity, entityId, details }) {
  const entityLabel = entity ? (ENTITY_LABELS[entity] ?? entity) : null;
  // Try to extract a human name from details
  const name =
    details?.name ?? details?.title ?? details?.email ?? details?.organizationName ?? null;

  return (
    <div>
      {entityLabel && <div className="text-body font-medium">{entityLabel}</div>}
      {name && (
        <div className="text-xs text-subtle mt-0.5 truncate max-w-[180px]">{String(name)}</div>
      )}
      {entityId && !name && (
        <div className="text-xs text-subtle font-mono mt-0.5 truncate max-w-[180px]">
          {entityId}
        </div>
      )}
    </div>
  );
}

function DetailsSummary({ details }) {
  if (!details || typeof details !== "object") return <span className="text-subtle">—</span>;

  const entries = Object.entries(details)
    .filter(([k]) => !SKIP_DETAIL_KEYS.has(k))
    .slice(0, 3);

  if (entries.length === 0) return <span className="text-subtle">—</span>;

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
      {entries.map(([k, v]) => {
        const label = DETAIL_LABELS[k] ?? k;
        let display = v;
        if (k === "status") display = STATUS_LABELS[v] ?? v;
        if (k === "priority") display = PRIORITY_LABELS[v] ?? v;
        if (Array.isArray(v)) display = v.join(", ");
        if (v === null || v === undefined) return null;
        return (
          <span key={k} className="text-xs text-body">
            <span className="text-subtle">{label}:</span>{" "}
            <span className="font-medium">{String(display)}</span>
          </span>
        );
      })}
    </div>
  );
}

function parseUserAgent(ua) {
  if (!ua) return null;
  // Extract browser and OS
  let browser = "Неизвестно";
  let os = "";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = "Safari";
  if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad/.test(ua)) os = "iOS";
  return os ? `${browser} · ${os}` : browser;
}

function DetailsPanel({ log }) {
  const { details, userAgent, ipAddress, entityId } = log;

  const hasDetails = details && Object.keys(details).length > 0;

  return (
    <div className="space-y-3">
      {/* Meta info */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-subtle">
        {ipAddress && (
          <span>
            <span className="font-medium text-body">IP:</span> {ipAddress}
          </span>
        )}
        {userAgent && (
          <span>
            <span className="font-medium text-body">Браузер:</span> {parseUserAgent(userAgent)}
          </span>
        )}
        {entityId && (
          <span>
            <span className="font-medium text-body">ID объекта:</span>{" "}
            <span className="font-mono">{entityId}</span>
          </span>
        )}
      </div>

      {/* Structured details */}
      {hasDetails && (
        <div>
          <div className="text-xs font-medium text-subtle mb-1.5">Детали</div>
          <dl className="bg-surface border border-line rounded-xl overflow-hidden divide-y divide-line">
            {Object.entries(details)
              .filter(([k]) => !SKIP_DETAIL_KEYS.has(k))
              .map(([k, v]) => {
                const label = DETAIL_LABELS[k] ?? k;
                let display = v;
                if (k === "status") display = STATUS_LABELS[v] ?? v;
                if (k === "priority") display = PRIORITY_LABELS[v] ?? v;
                if (Array.isArray(v)) display = v.join(", ");
                return (
                  <div
                    key={k}
                    className="flex flex-col sm:flex-row gap-0.5 sm:gap-2 px-3 py-2 text-xs"
                  >
                    <dt className="text-subtle font-medium sm:w-40 sm:shrink-0">{label}</dt>
                    <dd className="text-body break-all min-w-0">
                      {v === null || v === undefined ? (
                        <span className="text-subtle italic">пусто</span>
                      ) : typeof v === "object" ? (
                        <pre className="font-mono text-xs whitespace-pre-wrap break-all">
                          {JSON.stringify(v, null, 2)}
                        </pre>
                      ) : (
                        String(display)
                      )}
                    </dd>
                  </div>
                );
              })}
          </dl>
        </div>
      )}

      {/* Raw userAgent for debugging */}
      {userAgent && (
        <details className="text-xs">
          <summary className="text-subtle cursor-pointer select-none hover:text-body">
            User-Agent (raw)
          </summary>
          <div className="mt-1 font-mono text-subtle break-all bg-canvas border border-line rounded p-2">
            {userAgent}
          </div>
        </details>
      )}
    </div>
  );
}

function LogRow({ log, expanded, onToggle, formatDateTime, userName, userEmail }) {
  const hasDetails =
    (log.details && Object.keys(log.details).length > 0) || log.userAgent || log.entityId;

  const { date, time } = formatDateTime(log.createdAt);
  const email = userEmail(log.user);

  return (
    <>
      <tr
        className={`border-b border-line transition-colors ${hasDetails ? "cursor-pointer hover:bg-canvas/60" : ""} ${expanded ? "bg-canvas/80" : ""}`}
        onClick={hasDetails ? onToggle : undefined}
      >
        <td className="px-5 py-3 whitespace-nowrap">
          <div className="text-heading font-medium">{date}</div>
          <div className="text-xs text-subtle">{time}</div>
        </td>
        <td className="px-5 py-3">
          <div className="text-body">{userName(log.user)}</div>
          {email && <div className="text-xs text-subtle">{email}</div>}
        </td>
        <td className="px-5 py-3">
          <ActionBadge action={log.action} />
        </td>
        <td className="px-5 py-3">
          <EntityCell entity={log.entity} entityId={log.entityId} details={log.details} />
        </td>
        <td className="px-5 py-3 max-w-[240px]">
          <DetailsSummary details={log.details} />
        </td>
        <td className="px-5 py-3 text-xs text-subtle font-mono whitespace-nowrap">
          {log.ipAddress || "—"}
        </td>
        <td className="px-3 py-3 text-subtle">
          {hasDetails && (expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
        </td>
      </tr>
      {expanded && hasDetails && (
        <tr className="bg-canvas/80">
          <td colSpan={7} className="px-5 py-4">
            <DetailsPanel log={log} />
          </td>
        </tr>
      )}
    </>
  );
}
