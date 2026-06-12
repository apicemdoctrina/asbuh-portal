import { Loader2 } from "lucide-react";
import { api } from "../lib/api.js";
import { useApi, jsonFetcher } from "../hooks/useApi.js";
import ClientOrgDashboard from "../components/client/ClientOrgDashboard.jsx";
import ClientGroupDashboard from "../components/client/ClientGroupDashboard.jsx";
import OnboardingChecklist from "../components/client/OnboardingChecklist.jsx";

function Skeleton() {
  return (
    <div className="flex items-center justify-center py-16 text-subtle">
      <Loader2 size={24} className="animate-spin" />
    </div>
  );
}

export default function ClientDashboardPage() {
  const {
    data,
    loading,
    error,
    refetch: load,
  } = useApi(
    jsonFetcher(() => api("/api/client/dashboard")),
    [],
    {
      errorMessage: "Не удалось загрузить дашборд",
    },
  );

  if (loading) return <Skeleton />;

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg p-4 flex items-center justify-between">
        <span>{error}</span>
        <button onClick={load} className="text-sm font-semibold underline">
          Попробовать снова
        </button>
      </div>
    );
  }

  if (!data || data.organizations.length === 0) {
    return (
      <div className="bg-surface rounded-2xl shadow-lg border border-line p-8 text-center">
        <h2 className="text-lg font-semibold text-heading">
          Аккаунт ещё не привязан к организации
        </h2>
        <p className="mt-2 text-sm text-subtle">
          Свяжитесь с менеджером, чтобы получить доступ к дашборду компании.
        </p>
      </div>
    );
  }

  if (data.organizations.length === 1) {
    return (
      <>
        <OnboardingChecklist />
        <ClientOrgDashboard org={data.organizations[0]} showOrgName />
      </>
    );
  }

  return (
    <>
      <OnboardingChecklist />
      <ClientGroupDashboard group={data.group} organizations={data.organizations} />
    </>
  );
}
