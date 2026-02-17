import { useState, useEffect } from "react";
import { Link } from "react-router";
import { Building2, Map, Users, UserCheck, FileText, Plus, ArrowRight } from "lucide-react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";

const STATUS_LABELS = {
  active: "Активный",
  new: "Новый",
  liquidating: "В процессе ликвидации",
  left: "Ушёл",
  closed: "Закрылся",
  not_paying: "Не платит",
};

const STATUS_BADGE = {
  active: "bg-green-100 text-green-700",
  new: "bg-blue-100 text-blue-700",
  liquidating: "bg-amber-100 text-amber-700",
  left: "bg-slate-100 text-slate-500",
  closed: "bg-slate-100 text-slate-500",
  not_paying: "bg-red-100 text-red-700",
};

function StatCard({ icon: Icon, label, value, color, to }) {
  return (
    <Link
      to={to}
      className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 hover:shadow-xl transition-shadow"
    >
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={22} />
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-900">{value ?? "—"}</p>
          <p className="text-sm text-slate-500">{label}</p>
        </div>
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-slate-200" />
        <div className="space-y-2">
          <div className="h-6 w-16 bg-slate-200 rounded" />
          <div className="h-4 w-24 bg-slate-200 rounded" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, hasPermission } = useAuth();
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
        <h1 className="text-2xl font-bold text-slate-900">Добро пожаловать, {user?.firstName}</h1>
        <div className="mt-2">
          <span className="bg-[#6567F1]/10 text-[#6567F1] px-3 py-1 rounded-full text-sm font-medium">
            {roleLabel}
          </span>
        </div>
      </div>

      {/* Error */}
      {error && <div className="mb-6 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {loading ? (
          <>
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
              color="bg-[#6567F1]/10 text-[#6567F1]"
              to="/organizations"
            />
            {stats.sections != null && (
              <StatCard
                icon={Map}
                label="Участки"
                value={stats.sections}
                color="bg-emerald-500/10 text-emerald-500"
                to="/sections"
              />
            )}
            {stats.users != null && (
              <StatCard
                icon={Users}
                label="Сотрудники"
                value={stats.users}
                color="bg-amber-500/10 text-amber-500"
                to="/staff"
              />
            )}
            {stats.clients != null && (
              <StatCard
                icon={UserCheck}
                label="Клиенты"
                value={stats.clients}
                color="bg-cyan-500/10 text-cyan-500"
                to="/clients"
              />
            )}
            <StatCard
              icon={FileText}
              label="Документы"
              value={stats.documents}
              color="bg-purple-500/10 text-purple-500"
              to="/organizations"
            />
          </>
        ) : null}
      </div>

      {/* Quick actions */}
      {(hasPermission("organization", "create") || hasPermission("section", "create")) && (
        <div className="flex flex-wrap gap-3 mb-8">
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
              className="inline-flex items-center gap-2 px-4 py-2 border-2 border-[#6567F1]/20 text-[#6567F1] hover:bg-[#6567F1]/5 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus size={16} />
              Новый участок
            </Link>
          )}
        </div>
      )}

      {/* Recent organizations */}
      {!loading && stats?.recentOrganizations?.length > 0 && (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900">Последние организации</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-4 py-3 font-medium text-slate-500">Название</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 hidden sm:table-cell">
                  ИНН
                </th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">
                  Участок
                </th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">Статус</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">
                  Дата создания
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.recentOrganizations.map((org) => (
                <tr key={org.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      to={`/organizations/${org.id}`}
                      className="text-[#6567F1] hover:underline"
                    >
                      {org.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">
                    {org.inn || "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 hidden md:table-cell">
                    {org.section ? `\u2116${org.section.number}` : "\u2014"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[org.status] || "bg-slate-100 text-slate-500"}`}
                    >
                      {STATUS_LABELS[org.status] || org.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">
                    {new Date(org.createdAt).toLocaleDateString("ru-RU")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-6 py-3 border-t border-slate-100">
            <Link
              to="/organizations"
              className="text-sm text-[#6567F1] hover:underline inline-flex items-center gap-1"
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
