import { useState, useEffect } from "react";
import { Link } from "react-router";
import {
  Building2,
  Map,
  Users,
  UserCheck,
  FileText,
  Plus,
  ArrowRight,
  TrendingUp,
  ClipboardList,
  Banknote,
} from "lucide-react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import SectionIcon from "../components/SectionIcon.jsx";
import ClientDashboardPage from "./ClientDashboardPage.jsx";

const STATUS_LABELS = {
  active: "Активный",
  new: "Новый",
  liquidating: "В процессе ликвидации",
  left: "Ушёл",
  closed: "Закрылся",
  not_paying: "Не платит",
};

const STATUS_BADGE = {
  active: "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300",
  new: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
  liquidating: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
  left: "bg-muted text-subtle",
  closed: "bg-muted text-subtle",
  not_paying: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
};

function barColor(pct) {
  if (pct >= 80) return "bg-green-500";
  if (pct >= 50) return "bg-amber-400";
  return "bg-red-400";
}

function textColor(pct) {
  if (pct >= 80) return "text-green-700 dark:text-green-300";
  if (pct >= 50) return "text-amber-700 dark:text-amber-300";
  return "text-red-600 dark:text-red-300";
}

function StatCard({ icon: Icon, label, value, color, to }) {
  return (
    <Link
      to={to}
      className="bg-surface rounded-2xl shadow-lg border border-line p-6 hover:shadow-xl transition-shadow"
    >
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={22} />
        </div>
        <div>
          <p className="text-2xl font-bold text-heading">{value ?? "—"}</p>
          <p className="text-sm text-subtle">{label}</p>
        </div>
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-surface rounded-2xl shadow-lg border border-line p-6 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-line" />
        <div className="space-y-2">
          <div className="h-6 w-16 bg-line rounded" />
          <div className="h-4 w-24 bg-line rounded" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, hasPermission, hasRole } = useAuth();
  if (hasRole("client")) {
    return <ClientDashboardPage />;
  }
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function fetchStats() {
      try {
        const res = await api("/api/stats");
        if (!res.ok) throw new Error("Не удалось загрузить статистику");
        const data = await res.json();
        if (!cancelled) setStats(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchStats();
    return () => {
      cancelled = true;
    };
  }, []);

  const roleLabelMap = {
    admin: "Администратор",
    manager: "Менеджер",
    accountant: "Бухгалтер",
    client: "Клиент",
  };

  const primaryRole = user?.roles?.[0];
  const roleLabel = roleLabelMap[primaryRole] || primaryRole;

  return (
    <>
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-heading">Добро пожаловать, {user?.firstName}</h1>
        <div className="mt-2">
          <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium">
            {roleLabel}
          </span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-3 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : stats ? (
          <>
            <StatCard
              icon={Building2}
              label="Организации"
              value={stats.organizations?.total}
              color="bg-primary/10 text-primary"
              to="/organizations"
            />
            {stats.sections != null && (
              <StatCard
                icon={Map}
                label="Участки"
                value={stats.sections}
                color="bg-emerald-500/10 text-emerald-500 dark:text-emerald-400"
                to="/sections"
              />
            )}
            {stats.users != null && (
              <StatCard
                icon={Users}
                label="Сотрудники"
                value={stats.users}
                color="bg-amber-500/10 text-amber-500 dark:text-amber-400"
                to="/staff"
              />
            )}
            {stats.clients != null && (
              <StatCard
                icon={UserCheck}
                label="Клиенты"
                value={stats.clients}
                color="bg-cyan-500/10 text-cyan-500 dark:text-cyan-400"
                to="/clients"
              />
            )}
            {stats.monthlyRevenue != null && (
              <StatCard
                icon={TrendingUp}
                label="Выручка в месяц"
                value={stats.monthlyRevenue.toLocaleString("ru-RU") + " ₽"}
                color="bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                to="/organizations"
              />
            )}
            <StatCard
              icon={FileText}
              label="Документы"
              value={stats.documents}
              color="bg-purple-500/10 text-purple-500 dark:text-purple-400"
              to="/organizations"
            />
          </>
        ) : null}
      </div>

      {/* Completeness KPI — hidden for clients */}
      {!hasRole("client") &&
        (loading ? (
          <div className="bg-surface rounded-2xl shadow-lg border border-line p-5 mb-8 animate-pulse">
            <div className="flex justify-between mb-3">
              <div className="h-4 w-48 bg-line rounded" />
              <div className="h-4 w-8 bg-line rounded" />
            </div>
            <div className="h-2.5 bg-line rounded-full mb-2" />
            <div className="h-3 w-40 bg-line rounded" />
          </div>
        ) : stats?.avgCompleteness != null ? (
          <div className="bg-surface rounded-2xl shadow-lg border border-line p-5 mb-8">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-body">
                Заполненность карточек организаций
              </h2>
              <span
                className={`text-sm font-bold tabular-nums ${textColor(stats.avgCompleteness)}`}
              >
                {stats.avgCompleteness}%
              </span>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden mb-2">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barColor(stats.avgCompleteness)}`}
                style={{ width: `${stats.avgCompleteness}%` }}
              />
            </div>
            <p className="text-xs text-subtle">
              {stats.completedOrganizations} из {stats.organizations.total}{" "}
              {stats.organizations.total === 1 ? "организация заполнена" : "организаций заполнены"}{" "}
              полностью
            </p>
          </div>
        ) : null)}

      {/* Task traffic light — visible to staff with task access */}
      {!hasRole("client") &&
        hasPermission("task", "view") &&
        (loading ? (
          <div className="bg-surface rounded-2xl shadow-lg border border-line p-5 mb-8 animate-pulse">
            <div className="h-4 w-32 bg-line rounded mb-4" />
            <div className="grid grid-cols-3 gap-3">
              <div className="h-16 bg-muted rounded-xl" />
              <div className="h-16 bg-muted rounded-xl" />
              <div className="h-16 bg-muted rounded-xl" />
            </div>
          </div>
        ) : stats?.tasks != null ? (
          <div className="bg-surface rounded-2xl shadow-lg border border-line p-5 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ClipboardList size={16} className="text-subtle" />
                <h2 className="text-sm font-semibold text-body">Задачи</h2>
              </div>
              <Link
                to="/tasks"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                Все задачи <ArrowRight size={12} />
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Link
                to="/tasks?status=OPEN&overdue=true"
                className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl bg-red-50 dark:bg-red-500/15 border border-red-100 dark:border-red-500/30 hover:bg-red-100 dark:hover:bg-red-500/15 transition-colors"
              >
                <span className="text-2xl font-bold text-red-600 dark:text-red-300 tabular-nums">
                  {stats.tasks.red}
                </span>
                <span className="text-xs text-red-500 dark:text-red-400 font-medium text-center leading-tight">
                  Просрочено
                </span>
              </Link>
              <Link
                to="/tasks?status=OPEN"
                className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-100 dark:border-amber-500/30 hover:bg-amber-100 dark:hover:bg-amber-500/15 transition-colors"
              >
                <span className="text-2xl font-bold text-amber-600 dark:text-amber-300 tabular-nums">
                  {stats.tasks.yellow}
                </span>
                <span className="text-xs text-amber-500 dark:text-amber-400 font-medium text-center leading-tight">
                  Срочно (≤2 дня)
                </span>
              </Link>
              <Link
                to="/tasks"
                className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-100 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/15 transition-colors"
              >
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-300 tabular-nums">
                  {stats.tasks.green}
                </span>
                <span className="text-xs text-emerald-500 dark:text-emerald-400 font-medium text-center leading-tight">
                  В норме
                </span>
              </Link>
            </div>
            {stats.tasks.total === 0 && (
              <p className="text-xs text-subtle text-center mt-3">Активных задач нет</p>
            )}
          </div>
        ) : null)}

      {/* Quick actions */}
      {(hasPermission("organization", "create") ||
        hasPermission("section", "create") ||
        hasRole("manager") ||
        hasRole("accountant")) && (
        <div className="flex flex-wrap gap-3 mb-8">
          {(hasRole("manager") || hasRole("accountant")) && (
            <Link
              to="/my-payments"
              className="inline-flex items-center gap-2 px-4 py-2 border-2 border-primary/20 text-primary hover:bg-primary/5 rounded-lg text-sm font-medium transition-colors"
            >
              <Banknote size={16} />
              Оплаты
            </Link>
          )}
          {hasPermission("organization", "create") && (
            <Link
              to="/organizations"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all"
            >
              <Plus size={16} />
              Новая организация
            </Link>
          )}
          {hasPermission("section", "create") && (
            <Link
              to="/sections"
              className="inline-flex items-center gap-2 px-4 py-2 border-2 border-primary/20 text-primary hover:bg-primary/5 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus size={16} />
              Новый участок
            </Link>
          )}
        </div>
      )}

      {/* Recent organizations */}
      {!loading && stats?.recentOrganizations?.length > 0 && (
        <div className="bg-surface rounded-2xl shadow-lg border border-line overflow-hidden">
          <div className="px-6 py-4 border-b border-line">
            <h2 className="text-lg font-semibold text-heading">Последние организации</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas/50">
                <th className="text-left px-4 py-3 font-medium text-subtle">Название</th>
                <th className="text-left px-4 py-3 font-medium text-subtle hidden sm:table-cell">
                  ИНН
                </th>
                <th className="text-left px-4 py-3 font-medium text-subtle hidden md:table-cell">
                  Участок
                </th>
                <th className="text-left px-4 py-3 font-medium text-subtle">Статус</th>
                <th className="text-left px-4 py-3 font-medium text-subtle hidden lg:table-cell">
                  Дата создания
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.recentOrganizations.map((org) => (
                <tr key={org.id} className="border-b border-line hover:bg-canvas/50">
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/organizations/${org.id}`} className="text-primary hover:underline">
                      {org.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-body hidden sm:table-cell">
                    {org.inn || "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-body hidden md:table-cell">
                    {org.section ? <SectionIcon section={org.section} showNumber size={14} /> : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[org.status] || "bg-muted text-subtle"}`}
                    >
                      {STATUS_LABELS[org.status] || org.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-body hidden lg:table-cell">
                    {new Date(org.createdAt).toLocaleDateString("ru-RU")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-6 py-3 border-t border-line">
            <Link
              to="/organizations"
              className="text-sm text-primary hover:underline inline-flex items-center gap-1"
            >
              Все организации
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
