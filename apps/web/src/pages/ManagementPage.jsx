import { useEffect } from "react";
import { useNavigate } from "react-router";
import { api } from "../lib/api.js";
import { useApi, jsonFetcher } from "../hooks/useApi.js";
import { useAuth } from "../context/AuthContext.jsx";
import { DollarSign, AlertCircle } from "lucide-react";
import { fmt, ROLE_LABELS } from "../components/finance/financeShared.jsx";
import SectionsBlock from "../components/management/SectionsBlock.jsx";
import BankStatsBlock from "../components/management/BankStatsBlock.jsx";

export default function ManagementPage() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();

  const allowed = hasRole("admin") || hasRole("supervisor");

  useEffect(() => {
    if (!allowed) navigate("/");
  }, []);

  const {
    data: sectionsData,
    loading: sectionsLoading,
    error,
    refetch: fetchSections,
  } = useApi(
    jsonFetcher(() => api("/api/sections?limit=100")),
    [],
    { enabled: allowed, errorMessage: "Ошибка загрузки участков" },
  );
  const {
    data: dashData,
    loading: dashLoading,
    refetch: fetchDash,
  } = useApi(
    jsonFetcher(() => api("/api/management/dashboard")),
    [],
    { enabled: allowed },
  );
  const {
    data: bankStats,
    loading: bankLoading,
    refetch: fetchBank,
  } = useApi(
    jsonFetcher(() => api("/api/management/bank-stats")),
    [],
    { enabled: allowed },
  );

  const sections = sectionsData?.sections ?? [];
  const staffByRole = dashData?.staff?.byRole ?? [];
  const loading = sectionsLoading || dashLoading || bankLoading;

  function loadAll() {
    fetchSections();
    fetchDash();
    fetchBank();
  }

  if (loading || !allowed)
    return (
      <div className="flex items-center justify-center h-64 text-subtle text-sm">Загрузка...</div>
    );
  if (error)
    return (
      <div className="flex items-center gap-2 text-red-500 dark:text-red-400 p-4 text-sm">
        <AlertCircle size={18} />
        {error}
      </div>
    );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-heading">Управление</h1>
          <p className="text-xs sm:text-sm text-subtle mt-0.5 sm:mt-1">
            Участки, команда, организационная структура
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/finance")}
          className="self-start inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-primary/20 text-primary hover:bg-primary/5 text-sm font-medium transition-colors"
        >
          <DollarSign size={16} />
          Финансовая аналитика
        </button>
      </div>

      {/* Sections */}
      <SectionsBlock sections={sections} onRefresh={loadAll} />

      {/* Персонал по ролям */}
      {staffByRole.length > 0 && (
        <div className="bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-5">
          <h2 className="text-base font-semibold text-heading mb-4">Персонал по ролям</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-subtle border-b border-line">
                  <th className="pb-2 font-medium">Роль</th>
                  <th className="pb-2 font-medium text-right">Кол-во</th>
                  <th className="pb-2 font-medium text-right">ФОТ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {staffByRole.map((r) => (
                  <tr key={r.role}>
                    <td className="py-2.5 text-body">{ROLE_LABELS[r.role] ?? r.role}</td>
                    <td className="py-2.5 text-right text-body">{r.count}</td>
                    <td className="py-2.5 text-right font-medium text-heading">{fmt(r.payroll)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Банки клиентов */}
      <BankStatsBlock bankStats={bankStats} />
    </div>
  );
}
