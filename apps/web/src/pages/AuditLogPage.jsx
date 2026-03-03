import { useState, useEffect, useCallback } from "react";
import { useDebouncedEffect } from "../hooks/useDebouncedEffect.js";
import { api } from "../lib/api.js";
import { Search, Loader2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";

// Human-readable Russian labels and colors for known actions
const ACTION_META = {
  login: { label: "Вход", color: "bg-blue-50 text-blue-700 border border-blue-200" },
  login_failed: { label: "Неудачный вход", color: "bg-red-50 text-red-700 border border-red-200" },
  logout: { label: "Выход", color: "bg-slate-100 text-slate-600 border border-slate-200" },
  user_created: {
    label: "Пользователь создан",
    color: "bg-green-50 text-green-700 border border-green-200",
  },
  user_updated: {
    label: "Профиль изменён",
    color: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  user_deactivated: {
    label: "Пользователь отключён",
    color: "bg-red-50 text-red-700 border border-red-200",
  },
  user_activated: {
    label: "Пользователь включён",
    color: "bg-green-50 text-green-700 border border-green-200",
  },
  role_assigned: {
    label: "Роль назначена",
    color: "bg-purple-50 text-purple-700 border border-purple-200",
  },
  invite_created: {
    label: "Приглашение создано",
    color: "bg-indigo-50 text-indigo-700 border border-indigo-200",
  },
  invite_accepted: {
    label: "Приглашение принято",
    color: "bg-green-50 text-green-700 border border-green-200",
  },
  client_registered: {
    label: "Клиент зарегистрирован",
    color: "bg-green-50 text-green-700 border border-green-200",
  },
  password_reset: {
    label: "Пароль сброшен",
    color: "bg-orange-50 text-orange-700 border border-orange-200",
  },
  "task.create": {
    label: "Задача создана",
    color: "bg-green-50 text-green-700 border border-green-200",
  },
  "task.update": {
    label: "Задача изменена",
    color: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  "task.delete": { label: "Задача удалена", color: "bg-red-50 text-red-700 border border-red-200" },
  "org.create": {
    label: "Организация создана",
    color: "bg-green-50 text-green-700 border border-green-200",
  },
  "org.update": {
    label: "Организация изменена",
    color: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  "org.delete": {
    label: "Организация удалена",
    color: "bg-red-50 text-red-700 border border-red-200",
  },
  "org.archive": {
    label: "Организация архивирована",
    color: "bg-slate-100 text-slate-600 border border-slate-200",
  },
  "org.restore": {
    label: "Организация восстановлена",
    color: "bg-green-50 text-green-700 border border-green-200",
  },
  "document.upload": {
    label: "Документ загружен",
    color: "bg-green-50 text-green-700 border border-green-200",
  },
  "document.delete": {
    label: "Документ удалён",
    color: "bg-red-50 text-red-700 border border-red-200",
  },
  "section.create": {
    label: "Участок создан",
    color: "bg-green-50 text-green-700 border border-green-200",
  },
  "section.update": {
    label: "Участок изменён",
    color: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  "section.delete": {
    label: "Участок удалён",
    color: "bg-red-50 text-red-700 border border-red-200",
  },
  "knowledge.create": {
    label: "Статья создана",
    color: "bg-green-50 text-green-700 border border-green-200",
  },
  "knowledge.update": {
    label: "Статья изменена",
    color: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  "knowledge.delete": {
    label: "Статья удалена",
    color: "bg-red-50 text-red-700 border border-red-200",
  },
  "work_contact.create": {
    label: "Контакт создан",
    color: "bg-green-50 text-green-700 border border-green-200",
  },
  "work_contact.update": {
    label: "Контакт изменён",
    color: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  "work_contact.delete": {
    label: "Контакт удалён",
    color: "bg-red-50 text-red-700 border border-red-200",
  },
  "secret.view": {
    label: "Просмотр секрета",
    color: "bg-orange-50 text-orange-700 border border-orange-200",
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
  const [actionOptions, setActionOptions] = useState([]);

  // Load distinct actions for the filter dropdown
  useEffect(() => {
    api("/api/audit-logs/actions")
      .then((r) => (r.ok ? r.json() : []))
      .then((actions) => setActionOptions(actions))
      .catch(() => {});
  }, []);

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
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Журнал действий</h1>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск по действию, ID, IP, браузеру..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
          />
        </div>

        <select
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
          className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] bg-white"
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
          className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] bg-white"
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
          className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">Нет записей</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
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
        )}

        {/* Pagination */}
        {!loading && total > 0 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 text-sm text-slate-500">
            <span>Всего {total} записей</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-slate-700 font-medium">
                Стр {page} из {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionBadge({ action }) {
  const meta = ACTION_META[action];
  if (meta) {
    return (
      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${meta.color}`}>
        {meta.label}
      </span>
    );
  }
  // Unknown action: generic badge
  return (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-[#6567F1]/10 text-[#6567F1] border border-[#6567F1]/20">
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
      {entityLabel && <div className="text-slate-700 font-medium">{entityLabel}</div>}
      {name && (
        <div className="text-xs text-slate-500 mt-0.5 truncate max-w-[180px]">{String(name)}</div>
      )}
      {entityId && !name && (
        <div className="text-xs text-slate-400 font-mono mt-0.5 truncate max-w-[180px]">
          {entityId}
        </div>
      )}
    </div>
  );
}

function DetailsSummary({ details }) {
  if (!details || typeof details !== "object") return <span className="text-slate-400">—</span>;

  const entries = Object.entries(details)
    .filter(([k]) => !SKIP_DETAIL_KEYS.has(k))
    .slice(0, 3);

  if (entries.length === 0) return <span className="text-slate-400">—</span>;

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
          <span key={k} className="text-xs text-slate-600">
            <span className="text-slate-400">{label}:</span>{" "}
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
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
        {ipAddress && (
          <span>
            <span className="font-medium text-slate-600">IP:</span> {ipAddress}
          </span>
        )}
        {userAgent && (
          <span>
            <span className="font-medium text-slate-600">Браузер:</span> {parseUserAgent(userAgent)}
          </span>
        )}
        {entityId && (
          <span>
            <span className="font-medium text-slate-600">ID объекта:</span>{" "}
            <span className="font-mono">{entityId}</span>
          </span>
        )}
      </div>

      {/* Structured details */}
      {hasDetails && (
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1.5">Детали</div>
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <tbody>
                {Object.entries(details)
                  .filter(([k]) => !SKIP_DETAIL_KEYS.has(k))
                  .map(([k, v]) => {
                    const label = DETAIL_LABELS[k] ?? k;
                    let display = v;
                    if (k === "status") display = STATUS_LABELS[v] ?? v;
                    if (k === "priority") display = PRIORITY_LABELS[v] ?? v;
                    if (Array.isArray(v)) display = v.join(", ");
                    return (
                      <tr key={k} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2 text-slate-500 font-medium w-40 align-top">
                          {label}
                        </td>
                        <td className="px-3 py-2 text-slate-700 break-all">
                          {v === null || v === undefined ? (
                            <span className="text-slate-400 italic">пусто</span>
                          ) : typeof v === "object" ? (
                            <pre className="font-mono text-xs whitespace-pre-wrap">
                              {JSON.stringify(v, null, 2)}
                            </pre>
                          ) : (
                            String(display)
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Raw userAgent for debugging */}
      {userAgent && (
        <details className="text-xs">
          <summary className="text-slate-400 cursor-pointer select-none hover:text-slate-600">
            User-Agent (raw)
          </summary>
          <div className="mt-1 font-mono text-slate-500 break-all bg-slate-50 border border-slate-200 rounded p-2">
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
        className={`border-b border-slate-50 transition-colors ${hasDetails ? "cursor-pointer hover:bg-slate-50/60" : ""} ${expanded ? "bg-slate-50/80" : ""}`}
        onClick={hasDetails ? onToggle : undefined}
      >
        <td className="px-5 py-3 whitespace-nowrap">
          <div className="text-slate-800 font-medium">{date}</div>
          <div className="text-xs text-slate-400">{time}</div>
        </td>
        <td className="px-5 py-3">
          <div className="text-slate-700">{userName(log.user)}</div>
          {email && <div className="text-xs text-slate-400">{email}</div>}
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
        <td className="px-5 py-3 text-xs text-slate-400 font-mono whitespace-nowrap">
          {log.ipAddress || "—"}
        </td>
        <td className="px-3 py-3 text-slate-400">
          {hasDetails && (expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
        </td>
      </tr>
      {expanded && hasDetails && (
        <tr className="bg-slate-50/80">
          <td colSpan={7} className="px-5 py-4">
            <DetailsPanel log={log} />
          </td>
        </tr>
      )}
    </>
  );
}
