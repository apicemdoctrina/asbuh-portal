import { useState, useEffect, useRef } from "react";
import {
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Download,
  Loader2,
  PlugZap,
  Unplug,
  LogIn,
  CalendarClock,
} from "lucide-react";
import { api } from "../../lib/api.js";
import {
  bankBadgeCls,
  API_PROVIDER_LABELS,
  effectiveProvider,
  SECRET_DISPLAY_DURATION,
} from "./bankConstants.js";
import AccountStatements from "./AccountStatements.jsx";

/** One bank account row: badges, secrets reveal, auto-fetch toggle, actions, statements. */
export default function BankAccountRow({
  organizationId,
  acc,
  canEdit,
  showLogin,
  canViewSecrets,
  canFetchStatements,
  canConnectBank,
  onEdit,
  onDelete,
  onConnect,
  onFetch,
  onDataChanged,
  statementsRefreshSignal,
}) {
  // Revealed secrets: { login, password } | null, auto-hidden after 30s
  const [secrets, setSecrets] = useState(null);
  const hideTimer = useRef(null);

  const [autoBusy, setAutoBusy] = useState(false);
  // Оптимистичное отображение: пока parent не обновил acc, показываем «нажатое» состояние.
  const [optimisticAuto, setOptimisticAuto] = useState(null);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  async function handleRevealSecrets() {
    if (secrets) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
      setSecrets(null);
      return;
    }
    try {
      const res = await api(`/api/organizations/${organizationId}/bank-accounts/${acc.id}/secrets`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка получения данных");
      }
      setSecrets(await res.json());
      hideTimer.current = setTimeout(() => setSecrets(null), SECRET_DISPLAY_DURATION);
    } catch (err) {
      alert(err.message);
    }
  }

  async function toggleAutoFetch() {
    if (autoBusy) return;
    const next = !acc.autoFetchEnabled;
    setOptimisticAuto(next);
    setAutoBusy(true);
    try {
      const res = await api(`/api/organizations/${organizationId}/bank-accounts/${acc.id}`, {
        method: "PUT",
        body: JSON.stringify({ autoFetchEnabled: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось переключить авто-выгрузку");
      }
      onDataChanged?.({ silent: true });
    } catch (err) {
      setOptimisticAuto(null);
      alert(err.message);
    } finally {
      setAutoBusy(false);
    }
  }

  const displayLogin = secrets ? secrets.login : acc.login;
  const displayPassword = secrets ? secrets.password : acc.password;
  const isRevealed = !!secrets;
  const provider = effectiveProvider(acc);

  return (
    <div className="bg-canvas rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-body space-y-0.5">
          <p className="flex items-center gap-1.5">
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${bankBadgeCls(acc.bankName)}`}
            >
              {acc.bankName}
            </span>
            {showLogin &&
              (provider ? (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${bankBadgeCls(acc.bankName)}`}
                >
                  <PlugZap size={12} />
                  API: {API_PROVIDER_LABELS[provider] || provider}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-subtle">
                  <Unplug size={12} />
                  без API
                </span>
              ))}
            {(showLogin || canConnectBank) && provider && (
              <span className="text-xs text-subtle">
                {acc.apiToken ? "· подключён" : "· не подключён"}
              </span>
            )}
          </p>
          {showLogin && displayLogin != null && (
            <p>
              Логин: <span className="font-mono">{displayLogin}</span>
            </p>
          )}
          {showLogin && displayPassword != null && (
            <p>
              Пароль: <span className="font-mono">{displayPassword}</span>
            </p>
          )}
          {acc.comment && <p className="text-subtle">{acc.comment}</p>}
        </div>
        <div className="flex items-center gap-2 ml-4 shrink-0">
          {canConnectBank && provider && provider !== "email" && (
            <button
              onClick={() => onConnect(acc)}
              className="text-subtle hover:text-primary transition-colors"
              title={
                acc.apiToken
                  ? `Переподключить ${API_PROVIDER_LABELS[provider]}`
                  : `Подключить ${API_PROVIDER_LABELS[provider]}`
              }
            >
              <LogIn size={16} />
            </button>
          )}
          {canFetchStatements && acc.apiProvider && acc.apiProvider !== "email" && (
            <button
              onClick={() => onFetch(acc)}
              className="text-subtle hover:text-primary transition-colors"
              title="Забрать выписку из банка"
            >
              <Download size={16} />
            </button>
          )}
          {acc.apiProvider === "email" && (
            <span
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30"
              title="Push-канал: банк присылает выписки на общий email"
            >
              📧 Email
            </span>
          )}
          {canEdit &&
            acc.apiProvider &&
            acc.apiProvider !== "email" &&
            acc.accountNumber &&
            (() => {
              const autoOn = optimisticAuto ?? acc.autoFetchEnabled;
              return (
                <button
                  onClick={toggleAutoFetch}
                  disabled={autoBusy}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 ${
                    autoOn
                      ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/40 hover:bg-emerald-200/70 dark:hover:bg-emerald-500/25"
                      : "bg-muted text-subtle border-line hover:bg-line/60"
                  }`}
                  title={
                    autoOn
                      ? "Авто-выгрузка ВКЛ: ежедневно 09:00 GMT+2 + каждые 30 минут подтягиваем свежие операции дня. Нажмите, чтобы выключить."
                      : "Авто-выгрузка выключена. Нажмите, чтобы включить (ежедневный синк за прошлый день в 09:00 GMT+2 и обновление операций каждые 30 минут в течение дня)."
                  }
                >
                  {autoBusy ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <CalendarClock size={12} />
                  )}
                  Авто: {autoOn ? "ВКЛ" : "ВЫКЛ"}
                </button>
              );
            })()}
          {canViewSecrets && (acc.login != null || acc.password != null) && (
            <button
              onClick={handleRevealSecrets}
              className="text-subtle hover:text-primary transition-colors"
              title={isRevealed ? "Скрыть" : "Показать секреты"}
            >
              {isRevealed ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          )}
          {canEdit && (
            <>
              <button
                onClick={() => onEdit(acc)}
                className="text-subtle hover:text-primary transition-colors"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => onDelete(acc.id)}
                className="text-subtle hover:text-red-500 dark:hover:text-red-400 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      </div>

      <AccountStatements
        organizationId={organizationId}
        account={acc}
        canEdit={canEdit}
        onDataChanged={onDataChanged}
        refreshSignal={statementsRefreshSignal}
      />
    </div>
  );
}
