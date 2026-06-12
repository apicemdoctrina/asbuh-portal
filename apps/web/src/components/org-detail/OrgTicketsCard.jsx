import { Link } from "react-router";
import { Loader2 } from "lucide-react";
import { api } from "../../lib/api.js";
import { useApi } from "../../hooks/useApi.js";
import { useAuth } from "../../context/AuthContext.jsx";

const STATUS_LABELS = {
  NEW: "Новый",
  IN_PROGRESS: "В работе",
  WAITING_CLIENT: "Ожидает клиента",
  CLOSED: "Закрыт",
  ESCALATED: "Эскалация",
  ON_HOLD: "На паузе",
  REOPENED: "Переоткрыт",
};
const STATUS_COLORS = {
  NEW: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
  IN_PROGRESS: "bg-yellow-100 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  WAITING_CLIENT: "bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300",
  CLOSED: "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300",
  ESCALATED: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
  ON_HOLD: "bg-muted text-body",
  REOPENED: "bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300",
};

/** Recent tickets of the organization. Not rendered yet — hidden until the ticket system is released. */
export default function OrgTicketsCard({ organizationId }) {
  const { hasPermission } = useAuth();

  const { data: ticketsData, loading } = useApi(async () => {
    const res = await api(`/api/tickets?organizationId=${organizationId}&limit=10`);
    const data = await res.json();
    return data.tickets || [];
  }, [organizationId]);
  const tickets = ticketsData ?? [];

  return (
    <div className="bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-heading">Тикеты</h3>
        <div className="flex items-center gap-2">
          {tickets.length > 0 && (
            <Link
              to={`/tickets?organizationId=${organizationId}`}
              className="text-sm text-primary hover:underline"
            >
              Все тикеты
            </Link>
          )}
          {hasPermission("ticket", "create") && (
            <Link
              to={`/tickets?create=true&orgId=${organizationId}`}
              className="text-sm text-primary hover:underline"
            >
              + Создать
            </Link>
          )}
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-4 text-subtle">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : tickets.length === 0 ? (
        <p className="text-sm text-subtle">Нет тикетов</p>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => (
            <Link
              key={t.id}
              to={`/tickets/${t.id}`}
              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-canvas transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-subtle font-mono">#{t.number}</span>
                <span className="text-sm text-heading truncate">{t.subject}</span>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_COLORS[t.status] || "bg-muted text-body"}`}
              >
                {STATUS_LABELS[t.status] || t.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
