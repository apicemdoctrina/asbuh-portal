import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { api } from "../lib/api.js";
import { useApi, jsonFetcher } from "../hooks/useApi.js";
import { useAuth } from "../context/AuthContext.jsx";
import { RefreshCw, X as XIcon, DollarSign, Clock, Calculator } from "lucide-react";
import TransactionsTab from "../components/payments/TransactionsTab.jsx";
import ReconciliationTab from "../components/payments/ReconciliationTab.jsx";
import SummaryTab from "../components/payments/SummaryTab.jsx";
import CashCardTab from "../components/payments/CashCardTab.jsx";
import TochkaSetupModal from "../components/payments/TochkaSetupModal.jsx";

export default function PaymentsPage() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => searchParams.get("tab") || "reconciliation");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [showSetup, setShowSetup] = useState(false);
  const [syncPeriod, setSyncPeriod] = useState("all");

  const { data: accountsData, refetch: fetchAccounts } = useApi(
    jsonFetcher(() => api("/api/payments/accounts")),
    [],
  );
  const accounts = accountsData ?? [];

  async function handleSync(dateFrom, dateTo) {
    if (accounts.length === 0) {
      setShowSetup(true);
      return;
    }
    setSyncing(true);
    setSyncResult(null);
    try {
      const body = { accountId: accounts[0].id };
      if (dateFrom) body.dateFrom = dateFrom;
      if (dateTo) body.dateTo = dateTo;
      const res = await api("/api/payments/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Ошибка синхронизации");
        return;
      }
      setSyncResult(data);
    } catch {
      alert("Ошибка синхронизации");
    } finally {
      setSyncing(false);
    }
  }

  if (!hasRole("admin") && !hasRole("supervisor")) {
    return <div className="text-subtle text-center py-16">Нет доступа</div>;
  }

  // Standalone cash/card page — no bank UI, no tabs
  if (searchParams.get("tab") === "cashcard") {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-heading">Оплаты картой и наличными</h1>
        <CashCardTab />
      </div>
    );
  }

  const tabs = [
    { key: "reconciliation", label: "Сверка", icon: Calculator },
    { key: "transactions", label: "Транзакции", icon: DollarSign },
    { key: "summary", label: "По месяцам", icon: Clock },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading">Поступления</h1>
          {accounts.length > 0 && (
            <p className="text-sm text-subtle mt-1">
              Счёт: {accounts[0].accountNumber}
              {accounts[0].lastSyncAt && (
                <span className="ml-2">
                  · Последняя синхронизация:{" "}
                  {new Date(accounts[0].lastSyncAt).toLocaleString("ru-RU")}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {accounts.length === 0 && (
            <button
              onClick={() => setShowSetup(true)}
              className="inline-flex items-center gap-2 px-4 py-2 border-2 border-primary/20 text-primary rounded-lg text-sm font-medium hover:bg-primary/5"
            >
              Подключить счёт
            </button>
          )}
          <select
            value={syncPeriod}
            onChange={(e) => setSyncPeriod(e.target.value)}
            className="px-3 py-2 border border-line rounded-lg text-sm bg-surface"
          >
            <option value="all">Весь период</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
          </select>
          <button
            onClick={() => {
              const today = new Date().toISOString().slice(0, 10);
              if (syncPeriod === "all") {
                handleSync("2025-01-01", today);
              } else {
                const y = Number(syncPeriod);
                handleSync(`${y}-01-01`, y === new Date().getFullYear() ? today : `${y}-12-31`);
              }
            }}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white rounded-lg text-sm font-medium shadow-lg shadow-[#6567F1]/30 hover:from-[#5557E1] hover:to-[#4547D1] disabled:opacity-50"
          >
            <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Загрузка из банка..." : "Синхронизировать"}
          </button>
        </div>
      </div>

      {/* Sync result banner */}
      {syncResult && (
        <div className="bg-green-50 dark:bg-green-500/15 border border-green-200 dark:border-green-500/30 rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-green-700 dark:text-green-300">
            Импортировано: <b>{syncResult.imported}</b>, пропущено: <b>{syncResult.skipped}</b>,
            сопоставлено: <b>{syncResult.matched}</b>
          </span>
          <button
            onClick={() => setSyncResult(null)}
            className="p-1 text-green-400 hover:text-green-600 dark:hover:text-green-300"
          >
            <XIcon size={14} />
          </button>
        </div>
      )}

      {showSetup && (
        <TochkaSetupModal
          onClose={() => setShowSetup(false)}
          onAdded={() => {
            setShowSetup(false);
            fetchAccounts();
          }}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === key ? "bg-surface text-primary shadow-sm" : "text-body hover:text-heading"
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {tab === "transactions" && (
        <TransactionsTab onOrgClick={(id) => navigate(`/organizations/${id}`)} />
      )}
      {tab === "reconciliation" && <ReconciliationTab />}
      {tab === "summary" && <SummaryTab />}
    </div>
  );
}
