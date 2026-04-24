import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../lib/api.js";
import ClientOrgDashboard from "../components/client/ClientOrgDashboard.jsx";
import ClientGroupDashboard from "../components/client/ClientGroupDashboard.jsx";

function Skeleton() {
  return (
    <div className="flex items-center justify-center py-16 text-slate-400">
      <Loader2 size={24} className="animate-spin" />
    </div>
  );
}

export default function ClientDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await api("/api/client/dashboard");
      if (!res.ok) throw new Error("Не удалось загрузить дашборд");
      setData(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) setData(null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <Skeleton />;

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 rounded-lg p-4 flex items-center justify-between">
        <span>{error}</span>
        <button onClick={load} className="text-sm font-semibold underline">
          Попробовать снова
        </button>
      </div>
    );
  }

  if (!data || data.organizations.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center">
        <h2 className="text-lg font-semibold text-slate-900">
          Аккаунт ещё не привязан к организации
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Свяжитесь с менеджером, чтобы получить доступ к дашборду компании.
        </p>
      </div>
    );
  }

  if (data.organizations.length === 1) {
    return <ClientOrgDashboard org={data.organizations[0]} showOrgName />;
  }

  return <ClientGroupDashboard group={data.group} organizations={data.organizations} />;
}
