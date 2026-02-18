import { useState, useEffect, useCallback } from "react";
import { useDebouncedEffect } from "../hooks/useDebouncedEffect.js";
import { api } from "../lib/api.js";
import { Search, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

const ENTITY_OPTIONS = [
  { value: "", label: "Все сущности" },
  { value: "user", label: "Пользователь" },
  { value: "organization", label: "Организация" },
  { value: "section", label: "Участок" },
  { value: "document", label: "Документ" },
  { value: "invite_token", label: "Приглашение" },
  { value: "work_contact", label: "Контакт" },
];

const LIMIT = 50;

export default function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [entity, setEntity] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(LIMIT));
      if (search) params.set("search", search);
      if (entity) params.set("entity", entity);
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
  }, [page, search, entity, from, to]);

  useDebouncedEffect(fetchLogs, [fetchLogs]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, entity, from, to]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function formatTime(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function userName(user) {
    if (!user) return "—";
    return `${user.firstName} ${user.lastName}`;
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
            placeholder="Поиск по действию, ID, IP..."
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

        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
          placeholder="От"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
          placeholder="До"
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
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-6 py-3 font-medium whitespace-nowrap">Дата / Время</th>
                  <th className="px-6 py-3 font-medium">Пользователь</th>
                  <th className="px-6 py-3 font-medium">Действие</th>
                  <th className="px-6 py-3 font-medium">Сущность</th>
                  <th className="px-6 py-3 font-medium">ID сущности</th>
                  <th className="px-6 py-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <LogRow
                    key={log.id}
                    log={log}
                    expanded={expandedId === log.id}
                    onToggle={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    formatDate={formatDate}
                    formatTime={formatTime}
                    userName={userName}
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

function LogRow({ log, expanded, onToggle, formatDate, formatTime, userName }) {
  const hasDetails = log.details && Object.keys(log.details).length > 0;

  return (
    <>
      <tr
        className={`border-b border-slate-50 transition-colors ${hasDetails ? "cursor-pointer hover:bg-slate-50/50" : ""}`}
        onClick={hasDetails ? onToggle : undefined}
      >
        <td className="px-6 py-3 whitespace-nowrap">
          <div className="text-slate-900">{formatDate(log.createdAt)}</div>
          <div className="text-xs text-slate-400">{formatTime(log.createdAt)}</div>
        </td>
        <td className="px-6 py-3 text-slate-600">{userName(log.user)}</td>
        <td className="px-6 py-3">
          <span className="bg-[#6567F1]/10 text-[#6567F1] px-2 py-0.5 rounded text-xs font-medium">
            {log.action}
          </span>
        </td>
        <td className="px-6 py-3 text-slate-600">{log.entity || "—"}</td>
        <td className="px-6 py-3 text-slate-500 text-xs font-mono">{log.entityId || "—"}</td>
        <td className="px-6 py-3 text-slate-500 text-xs font-mono">{log.ipAddress || "—"}</td>
      </tr>
      {expanded && hasDetails && (
        <tr className="bg-slate-50/80">
          <td colSpan={6} className="px-6 py-4">
            <div className="text-xs font-medium text-slate-500 mb-1">Детали</div>
            <pre className="text-xs text-slate-700 bg-white border border-slate-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(log.details, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}
