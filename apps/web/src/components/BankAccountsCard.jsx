import { useState, useEffect, useRef } from "react";
import { api } from "../lib/api.js";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Eye,
  EyeOff,
  Download,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  PlugZap,
  Unplug,
  LogIn,
  ChevronDown,
  ChevronRight,
  FileText,
  CalendarClock,
} from "lucide-react";

const money = (n) =>
  Number(n).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** YYYY-MM-DD для <input type=date>. */
function isoDay(d) {
  return new Date(d).toISOString().slice(0, 10);
}

/** «1 мая 2026» — человекочитаемый формат для списков выписок. */
function ruDay(d) {
  return new Date(d).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
function firstDayOfMonth() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`;
}

const BANKS = [
  {
    name: "Сбербанк",
    bg: "bg-green-100 dark:bg-green-500/15",
    text: "text-green-700 dark:text-green-300",
  },
  { name: "БСПБ", bg: "bg-rose-100 dark:bg-rose-500/15", text: "text-rose-700 dark:text-rose-300" },
  { name: "ВТБ", bg: "bg-blue-100 dark:bg-blue-500/15", text: "text-blue-700 dark:text-blue-300" },
  { name: "ЭТБ", bg: "bg-cyan-100 dark:bg-cyan-500/15", text: "text-cyan-700 dark:text-cyan-300" },
  { name: "Альфа", bg: "bg-red-100 dark:bg-red-500/15", text: "text-red-700 dark:text-red-300" },
  {
    name: "Т-Банк",
    bg: "bg-yellow-100 dark:bg-yellow-500/15",
    text: "text-yellow-700 dark:text-yellow-300",
  },
  {
    name: "ПСБ",
    bg: "bg-indigo-100 dark:bg-indigo-500/15",
    text: "text-indigo-700 dark:text-indigo-300",
  },
  {
    name: "Точка",
    bg: "bg-orange-100 dark:bg-orange-500/15",
    text: "text-orange-700 dark:text-orange-300",
  },
  { name: "РСБ", bg: "bg-teal-100 dark:bg-teal-500/15", text: "text-teal-700 dark:text-teal-300" },
  { name: "Открытие", bg: "bg-sky-100 dark:bg-sky-500/15", text: "text-sky-700 dark:text-sky-300" },
  { name: "ГазПромБанк", bg: "bg-line", text: "text-body" },
  {
    name: "Локо",
    bg: "bg-purple-100 dark:bg-purple-500/15",
    text: "text-purple-700 dark:text-purple-300",
  },
  {
    name: "Авангард",
    bg: "bg-amber-100 dark:bg-amber-500/15",
    text: "text-amber-700 dark:text-amber-300",
  },
];

const BANK_STYLE = Object.fromEntries(BANKS.map((b) => [b.name, { bg: b.bg, text: b.text }]));

function bankBadgeCls(name) {
  const s = BANK_STYLE[name];
  if (s) return `${s.bg} ${s.text}`;
  return "bg-muted text-body";
}

const API_PROVIDER_LABELS = { tochka: "Точка", sber: "Сбер", alfa: "Альфа" };

// Банк однозначно определяет провайдера API — не дёргаем юзера лишним вопросом.
const BANK_TO_PROVIDER = { Сбербанк: "sber", Альфа: "alfa", Точка: "tochka" };

const SECRET_DISPLAY_DURATION = 30_000;

export default function BankAccountsCard({
  organizationId,
  bankAccounts,
  canEdit,
  showLogin,
  canViewSecrets,
  canFetchStatements,
  canConnectBank,
  onDataChanged,
}) {
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [comment, setComment] = useState("");
  const [apiProvider, setApiProvider] = useState("");
  const [apiAccountId, setApiAccountId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [autoBusy, setAutoBusy] = useState({}); // { [accId]: true } while toggling
  // Оптимистичное отображение: пока parent не обновил acc, показываем «нажатое» состояние.
  const [optimisticAuto, setOptimisticAuto] = useState({}); // { [accId]: boolean }
  const [formError, setFormError] = useState("");

  // Fetch-from-bank modal state
  const [fetchAccount, setFetchAccount] = useState(null);
  const [fetchStart, setFetchStart] = useState("");
  const [fetchEnd, setFetchEnd] = useState("");
  const [fetchBusy, setFetchBusy] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [fetchSaved, setFetchSaved] = useState(null); // { status, diff, id }

  // Revealed secrets: { [accountId]: { login, password } }
  const [revealedSecrets, setRevealedSecrets] = useState({});
  const hideTimers = useRef({});

  // Per-account statements (lazy-loaded on expand): { [accountId]: { open, items, loading, err } }
  const [acctStatements, setAcctStatements] = useState({});
  // Per-statement operations (lazy-loaded on row expand): { [stId]: { open, accounts, loading, err } }
  const [stOps, setStOps] = useState({});

  // Connect-bank modal state: { acc, accountNumber, busy, error } | null
  const [connectModal, setConnectModal] = useState(null);

  async function toggleStOps(stId) {
    const cur = stOps[stId];
    if (cur?.open) {
      setStOps((s) => ({ ...s, [stId]: { ...cur, open: false } }));
      return;
    }
    if (cur?.accounts) {
      setStOps((s) => ({ ...s, [stId]: { ...cur, open: true } }));
      return;
    }
    setStOps((s) => ({ ...s, [stId]: { open: true, accounts: [], loading: true, err: "" } }));
    try {
      const res = await api(`/api/statements/${stId}`);
      if (!res.ok) throw new Error("Не удалось загрузить операции");
      const data = await res.json();
      setStOps((s) => ({
        ...s,
        [stId]: { open: true, accounts: data.accounts || [], loading: false, err: "" },
      }));
    } catch (err) {
      setStOps((s) => ({
        ...s,
        [stId]: { open: true, accounts: [], loading: false, err: err.message },
      }));
    }
  }

  async function loadAcctStatements(accId, keepOpen = true) {
    try {
      const res = await api(
        `/api/organizations/${organizationId}/bank-accounts/${accId}/statements`,
      );
      if (!res.ok) throw new Error("Не удалось загрузить выписки");
      const items = await res.json();
      setAcctStatements((s) => ({
        ...s,
        [accId]: { open: keepOpen || !!s[accId]?.open, items, loading: false, err: "" },
      }));
    } catch (err) {
      setAcctStatements((s) => ({
        ...s,
        [accId]: {
          open: keepOpen || !!s[accId]?.open,
          items: [],
          loading: false,
          err: err.message,
        },
      }));
    }
  }

  async function toggleAcctStatements(acc) {
    const cur = acctStatements[acc.id];
    if (cur?.open) {
      setAcctStatements((s) => ({ ...s, [acc.id]: { ...cur, open: false } }));
      return;
    }
    setAcctStatements((s) => ({
      ...s,
      [acc.id]: { open: true, items: cur?.items ?? [], loading: !cur?.items, err: "" },
    }));
    if (cur?.items) return;
    await loadAcctStatements(acc.id, true);
  }

  async function toggleAutoFetch(acc) {
    if (autoBusy[acc.id]) return;
    const next = !acc.autoFetchEnabled;
    setOptimisticAuto((s) => ({ ...s, [acc.id]: next }));
    setAutoBusy((s) => ({ ...s, [acc.id]: true }));
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
      // Откатываем оптимистичное состояние
      setOptimisticAuto((s) => {
        const next2 = { ...s };
        delete next2[acc.id];
        return next2;
      });
      alert(err.message);
    } finally {
      setAutoBusy((s) => {
        const next2 = { ...s };
        delete next2[acc.id];
        return next2;
      });
    }
  }

  async function deleteStatement(stId, acc) {
    if (!confirm("Удалить выписку? Действие нельзя отменить.")) return;
    try {
      const res = await api(`/api/statements/${stId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось удалить выписку");
      }
      await loadAcctStatements(acc.id, true);
      onDataChanged?.({ silent: true });
    } catch (err) {
      alert(err.message);
    }
  }

  async function downloadStatement(stId, format) {
    try {
      const res = await api(`/api/statements/${stId}/download?format=${format}`);
      if (!res.ok) throw new Error("Не удалось скачать");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "pdf" ? `statement-${stId}.pdf` : `kl_to_1c-${stId}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      alert(err.message);
    }
  }

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      Object.values(hideTimers.current).forEach(clearTimeout);
    };
  }, []);

  function openAdd() {
    setEditingAccount(null);
    setBankName("");
    setAccountNumber("");
    setLogin("");
    setPassword("");
    setComment("");
    setApiProvider("");
    setApiAccountId("");
    setApiToken("");
    setFormError("");
    setShowModal(true);
  }

  function openEdit(acc) {
    setEditingAccount(acc);
    setBankName(acc.bankName || "");
    setAccountNumber(acc.accountNumber || "");
    setLogin("");
    setPassword("");
    setComment(acc.comment || "");
    setApiProvider(acc.apiProvider || BANK_TO_PROVIDER[acc.bankName || ""] || "");
    setApiAccountId(acc.apiAccountId || "");
    setApiToken("");
    setFormError("");
    setShowModal(true);
  }

  async function handleSubmit() {
    if (!bankName) {
      setFormError("Выберите банк");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const loginVal = login.trim();
      const passwordVal = password.trim();
      const tokenVal = apiToken.trim();
      const body = JSON.stringify({
        bankName,
        accountNumber: accountNumber.trim() || null,
        ...(showLogin
          ? {
              login: loginVal || (editingAccount ? undefined : null),
              password: passwordVal || (editingAccount ? undefined : null),
            }
          : {}),
        comment: comment.trim() || null,
        apiProvider: apiProvider || null,
        apiAccountId: apiAccountId.trim() || null,
        // токен: пусто при редактировании = не менять; при создании = null
        apiToken: tokenVal || (editingAccount ? undefined : null),
      });
      const url = editingAccount
        ? `/api/organizations/${organizationId}/bank-accounts/${editingAccount.id}`
        : `/api/organizations/${organizationId}/bank-accounts`;
      const res = await api(url, { method: editingAccount ? "PUT" : "POST", body });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка сохранения");
      }
      setShowModal(false);
      onDataChanged();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(accId) {
    if (!confirm("Удалить банковский счёт?")) return;
    try {
      const res = await api(`/api/organizations/${organizationId}/bank-accounts/${accId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка удаления");
      }
      onDataChanged?.({ silent: true });
    } catch (err) {
      alert(err.message);
    }
  }

  function openConnectModal(acc) {
    setConnectModal({
      acc,
      accountNumber: acc.accountNumber || "",
      busy: false,
      error: "",
    });
  }

  function closeConnectModal() {
    setConnectModal(null);
  }

  async function submitConnectModal() {
    const cm = connectModal;
    if (!cm) return;
    const num = (cm.accountNumber || "").replace(/\D/g, "").slice(0, 20);
    if (num.length !== 20) {
      setConnectModal({ ...cm, error: "Номер счёта должен быть из 20 цифр" });
      return;
    }
    setConnectModal({ ...cm, busy: true, error: "" });
    try {
      if (num !== cm.acc.accountNumber) {
        const upd = await api(`/api/organizations/${organizationId}/bank-accounts/${cm.acc.id}`, {
          method: "PUT",
          body: JSON.stringify({ accountNumber: num }),
        });
        if (!upd.ok) {
          const data = await upd.json().catch(() => ({}));
          throw new Error(data.error || "Не удалось сохранить номер счёта");
        }
      }
      const path =
        cm.acc.apiProvider === "alfa"
          ? "alfa"
          : cm.acc.apiProvider === "tochka"
            ? "tochka"
            : "sber";
      const res = await api(`/api/statements/${path}/authorize-url?bankAccountId=${cm.acc.id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Не удалось начать подключение");
      window.location.href = data.url;
    } catch (err) {
      setConnectModal((cur) => (cur ? { ...cur, busy: false, error: err.message } : null));
    }
  }

  function openFetch(acc) {
    setFetchAccount(acc);
    setFetchStart(acc.lastFetchAt ? isoDay(acc.lastFetchAt) : firstDayOfMonth());
    setFetchEnd(isoDay(Date.now()));
    setFetchError("");
    setFetchSaved(null);
  }

  function closeFetch() {
    setFetchAccount(null);
    setFetchError("");
    setFetchSaved(null);
  }

  async function runFetch(path) {
    setFetchBusy(true);
    setFetchError("");
    try {
      const res = await api(`/api/statements/${path}`, {
        method: "POST",
        body: JSON.stringify({
          organizationId,
          bankAccountId: fetchAccount?.id,
          start: fetchStart,
          end: fetchEnd,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ошибка запроса к банку");
      return data;
    } catch (err) {
      setFetchError(err.message);
      return null;
    } finally {
      setFetchBusy(false);
    }
  }

  async function runSave() {
    const data = await runFetch("fetch");
    if (data) {
      setFetchSaved({
        status: data.reconcile.status,
        diff: data.reconcile.totalDiff,
        id: data.statement.id,
        docCount: data.statement.docCount ?? 0,
      });
      // Тихий рефреш родителя — без setLoading(true), иначе модалка размонтируется.
      // Нужен, чтобы acc.lastFetchAt обновился и при повторном открытии не предлагал тот же период.
      onDataChanged?.({ silent: true });
      if (fetchAccount?.id) loadAcctStatements(fetchAccount.id, true);
    }
  }

  async function handleRevealSecrets(accId) {
    // If already revealed, hide
    if (revealedSecrets[accId]) {
      clearTimeout(hideTimers.current[accId]);
      delete hideTimers.current[accId];
      setRevealedSecrets((prev) => {
        const next = { ...prev };
        delete next[accId];
        return next;
      });
      return;
    }

    try {
      const res = await api(`/api/organizations/${organizationId}/bank-accounts/${accId}/secrets`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка получения данных");
      }
      const secrets = await res.json();
      setRevealedSecrets((prev) => ({ ...prev, [accId]: secrets }));

      // Auto-hide after 30 seconds
      hideTimers.current[accId] = setTimeout(() => {
        setRevealedSecrets((prev) => {
          const next = { ...prev };
          delete next[accId];
          return next;
        });
        delete hideTimers.current[accId];
      }, SECRET_DISPLAY_DURATION);
    } catch (err) {
      alert(err.message);
    }
  }

  function getDisplayLogin(acc) {
    if (revealedSecrets[acc.id]) return revealedSecrets[acc.id].login;
    return acc.login;
  }

  function getDisplayPassword(acc) {
    if (revealedSecrets[acc.id]) return revealedSecrets[acc.id].password;
    return acc.password;
  }

  return (
    <div className="bg-surface rounded-2xl shadow-lg border border-line p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-heading">Банковские счета</h2>
        {canEdit && (
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-1 text-sm text-primary hover:text-[#5557E1] font-medium"
          >
            <Plus size={16} /> Добавить
          </button>
        )}
      </div>

      {bankAccounts.length === 0 ? (
        <p className="text-sm text-subtle">Нет банковских счетов</p>
      ) : (
        <div className="space-y-2">
          {bankAccounts.map((acc) => {
            const displayLogin = getDisplayLogin(acc);
            const displayPassword = getDisplayPassword(acc);
            const isRevealed = !!revealedSecrets[acc.id];

            const sts = acctStatements[acc.id];
            return (
              <div key={acc.id} className="bg-canvas rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-body space-y-0.5">
                    <p className="flex items-center gap-1.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${bankBadgeCls(acc.bankName)}`}
                      >
                        {acc.bankName}
                      </span>
                      {showLogin &&
                        (acc.apiProvider ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                            <PlugZap size={12} />
                            API: {API_PROVIDER_LABELS[acc.apiProvider] || acc.apiProvider}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-subtle">
                            <Unplug size={12} />
                            без API
                          </span>
                        ))}
                      {(showLogin || canConnectBank) &&
                        (acc.apiProvider === "sber" ||
                          acc.apiProvider === "alfa" ||
                          acc.apiProvider === "tochka") && (
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
                    {canConnectBank &&
                      (acc.apiProvider === "sber" ||
                        acc.apiProvider === "alfa" ||
                        acc.apiProvider === "tochka") && (
                        <button
                          onClick={() => openConnectModal(acc)}
                          className="text-subtle hover:text-primary transition-colors"
                          title={
                            acc.apiToken
                              ? `Переподключить ${API_PROVIDER_LABELS[acc.apiProvider]}`
                              : `Подключить ${API_PROVIDER_LABELS[acc.apiProvider]}`
                          }
                        >
                          <LogIn size={16} />
                        </button>
                      )}
                    {canFetchStatements && acc.apiProvider && (
                      <button
                        onClick={() => openFetch(acc)}
                        className="text-subtle hover:text-primary transition-colors"
                        title="Забрать выписку из банка"
                      >
                        <Download size={16} />
                      </button>
                    )}
                    {canEdit &&
                      acc.apiProvider &&
                      acc.accountNumber &&
                      (() => {
                        const autoOn = optimisticAuto[acc.id] ?? acc.autoFetchEnabled;
                        return (
                          <button
                            onClick={() => toggleAutoFetch(acc)}
                            disabled={!!autoBusy[acc.id]}
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
                            {autoBusy[acc.id] ? (
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
                        onClick={() => handleRevealSecrets(acc.id)}
                        className="text-subtle hover:text-primary transition-colors"
                        title={isRevealed ? "Скрыть" : "Показать секреты"}
                      >
                        {isRevealed ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    )}
                    {canEdit && (
                      <>
                        <button
                          onClick={() => openEdit(acc)}
                          className="text-subtle hover:text-primary transition-colors"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(acc.id)}
                          className="text-subtle hover:text-red-500 dark:hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {acc.accountNumber && (
                  <button
                    onClick={() => toggleAcctStatements(acc)}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-subtle hover:text-primary transition-colors"
                  >
                    {sts?.open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    Выписки
                    {sts?.items ? ` (${sts.items.length})` : ""}
                  </button>
                )}
                {sts?.open && (
                  <div className="mt-2 pl-4 border-l-2 border-line space-y-1">
                    {sts.loading && (
                      <div className="flex items-center gap-2 text-xs text-subtle">
                        <Loader2 size={12} className="animate-spin" /> Загрузка…
                      </div>
                    )}
                    {sts.err && <div className="text-xs text-red-500">{sts.err}</div>}
                    {!sts.loading && !sts.err && sts.items.length === 0 && (
                      <div className="text-xs text-subtle">Выписок пока нет</div>
                    )}
                    {sts.items.map((st) => {
                      const ops = stOps[st.id];
                      return (
                        <div key={st.id} className="text-xs">
                          <div className="flex items-center justify-between gap-2 py-1">
                            <button
                              onClick={() => toggleStOps(st.id)}
                              className="flex items-center gap-1.5 text-body hover:text-primary transition-colors truncate text-left"
                              title={st.originalName}
                            >
                              {ops?.open ? (
                                <ChevronDown size={12} className="shrink-0" />
                              ) : (
                                <ChevronRight size={12} className="shrink-0" />
                              )}
                              <FileText size={12} className="shrink-0" />
                              <span className="font-medium">
                                {ruDay(st.periodStart)} — {ruDay(st.periodEnd)}
                              </span>
                              <span className="text-subtle">· {st.docCount} опер.</span>
                              {st.reconcileStatus !== "OK" && (
                                <span className="text-amber-600 dark:text-amber-400">
                                  · расх. {money(Number(st.reconcileDiff ?? 0))} ₽
                                </span>
                              )}
                            </button>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => downloadStatement(st.id, "txt")}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] uppercase tracking-wide bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors font-medium"
                                title="Скачать в формате 1С (txt)"
                              >
                                <Download size={11} /> 1С
                              </button>
                              <button
                                onClick={() => downloadStatement(st.id, "pdf")}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] uppercase tracking-wide bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors font-medium"
                                title="Скачать PDF"
                              >
                                <Download size={11} /> PDF
                              </button>
                              {canEdit && (
                                <button
                                  onClick={() => deleteStatement(st.id, acc)}
                                  className="px-1 py-0.5 rounded text-subtle hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                  title="Удалить выписку"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                          {ops?.open && (
                            <div className="ml-4 mt-1 mb-2 rounded border border-line bg-surface overflow-hidden">
                              {ops.loading && (
                                <div className="flex items-center gap-2 p-2 text-subtle">
                                  <Loader2 size={12} className="animate-spin" /> Загрузка операций…
                                </div>
                              )}
                              {ops.err && <div className="p-2 text-red-500">{ops.err}</div>}
                              {!ops.loading && !ops.err && ops.accounts.length === 0 && (
                                <div className="p-2 text-subtle">Нет данных</div>
                              )}
                              {!ops.loading &&
                                !ops.err &&
                                ops.accounts.map((a) =>
                                  a.operations.length === 0 ? (
                                    <div
                                      key={a.accountNumber}
                                      className="p-2 text-subtle text-center"
                                    >
                                      По счёту {a.accountNumber} операций нет
                                    </div>
                                  ) : (
                                    <table key={a.accountNumber} className="w-full border-collapse">
                                      <thead className="bg-canvas">
                                        <tr className="text-subtle">
                                          <th className="text-left px-2 py-1 font-medium">Дата</th>
                                          <th className="text-left px-2 py-1 font-medium">№</th>
                                          <th className="text-left px-2 py-1 font-medium">
                                            Контрагент
                                          </th>
                                          <th className="text-left px-2 py-1 font-medium">
                                            Назначение
                                          </th>
                                          <th className="text-right px-2 py-1 font-medium">
                                            Сумма
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {a.operations.map((op, i) => {
                                          const cp =
                                            op.direction === "in" ? op.payerName : op.payeeName;
                                          return (
                                            <tr
                                              key={i}
                                              className="border-t border-line hover:bg-canvas/60"
                                            >
                                              <td className="px-2 py-1 whitespace-nowrap">
                                                {op.date}
                                              </td>
                                              <td className="px-2 py-1 text-subtle">{op.number}</td>
                                              <td className="px-2 py-1 truncate max-w-[200px]">
                                                {cp || "—"}
                                              </td>
                                              <td className="px-2 py-1 truncate max-w-[300px] text-subtle">
                                                {op.purpose || "—"}
                                              </td>
                                              <td
                                                className={`px-2 py-1 text-right font-medium whitespace-nowrap ${
                                                  op.direction === "in"
                                                    ? "text-emerald-600 dark:text-emerald-300"
                                                    : "text-rose-600 dark:text-rose-300"
                                                }`}
                                              >
                                                {op.direction === "in" ? "+" : "−"}
                                                {money(op.amount)} ₽
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  ),
                                )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-heading">
                {editingAccount
                  ? `Редактировать счёт${bankName ? `: ${bankName}` : ""}`
                  : "Новый банковский счёт"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-subtle hover:text-body">
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {!editingAccount && (
                <div>
                  <label className="block text-sm font-medium text-body mb-2">Банк *</label>
                  <div className="flex flex-wrap gap-2">
                    {BANKS.map((b) => (
                      <button
                        key={b.name}
                        type="button"
                        onClick={() => {
                          setBankName(b.name);
                          setApiProvider(BANK_TO_PROVIDER[b.name] || "");
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all ${
                          bankName === b.name
                            ? `${b.bg} ${b.text} border-current ring-2 ring-current/20`
                            : `${b.bg} ${b.text} border-transparent opacity-60 hover:opacity-100`
                        }`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {showLogin && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-body mb-1">Логин</label>
                    <input
                      type="text"
                      value={login}
                      onChange={(e) => setLogin(e.target.value)}
                      placeholder={editingAccount ? "Оставьте пустым, чтобы не менять" : ""}
                      autoComplete="off"
                      className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-body mb-1">Пароль</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={editingAccount ? "Оставьте пустым, чтобы не менять" : ""}
                      autoComplete="new-password"
                      className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-body mb-1">
                  Номер счёта{" "}
                  <span className="text-subtle font-normal">(20 цифр, нужен для API-выгрузки)</span>
                </label>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 20))}
                  inputMode="numeric"
                  placeholder="40702810…"
                  className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-body mb-1">Комментарий</label>
                <input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>

              {showLogin && apiProvider && (
                <div className="border-t border-line pt-4 space-y-4">
                  <div className="text-xs font-semibold text-subtle uppercase tracking-wide">
                    Подключение к API банка ({API_PROVIDER_LABELS[apiProvider] || apiProvider})
                  </div>
                  {apiProvider && (
                    <>
                      {apiProvider === "tochka" && (
                        <div>
                          <label className="block text-sm font-medium text-body mb-1">
                            Идентификатор счёта (accountId)
                          </label>
                          <input
                            type="text"
                            value={apiAccountId}
                            onChange={(e) => setApiAccountId(e.target.value)}
                            placeholder="Если пусто — берётся номер счёта"
                            className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                          />
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-body mb-1">
                          {apiProvider === "sber"
                            ? "Refresh-токен (СберБизнес)"
                            : apiProvider === "alfa"
                              ? "Refresh-токен (Alfa ID)"
                              : "API-токен"}
                        </label>
                        <input
                          type="password"
                          value={apiToken}
                          onChange={(e) => setApiToken(e.target.value)}
                          placeholder={editingAccount ? "Оставьте пустым, чтобы не менять" : ""}
                          autoComplete="new-password"
                          className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {formError && (
                <div className="p-3 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg text-sm">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border-2 border-primary/20 text-primary hover:bg-primary/5 rounded-lg text-sm font-medium transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50"
                >
                  {submitting ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {connectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-heading">
                Подключение: {connectModal.acc.bankName}
              </h2>
              <button
                onClick={closeConnectModal}
                className="text-subtle hover:text-body"
                disabled={connectModal.busy}
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-body mb-1">
                  Номер счёта <span className="text-subtle font-normal">(20 цифр)</span>
                </label>
                <input
                  type="text"
                  value={connectModal.accountNumber}
                  onChange={(e) =>
                    setConnectModal({
                      ...connectModal,
                      accountNumber: e.target.value.replace(/\D/g, "").slice(0, 20),
                      error: "",
                    })
                  }
                  inputMode="numeric"
                  placeholder="40702810…"
                  autoFocus
                  className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                <p className="text-xs text-subtle mt-1">
                  Тот номер счёта, по которому ты подключаешь интеграцию. После
                  &laquo;Подключить&raquo; откроется страница банка для подтверждения.
                </p>
              </div>
              {connectModal.error && (
                <div className="p-3 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg text-sm flex items-center gap-2">
                  <AlertTriangle size={16} /> {connectModal.error}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeConnectModal}
                  disabled={connectModal.busy}
                  className="px-4 py-2 border-2 border-primary/20 text-primary hover:bg-primary/5 rounded-lg text-sm font-medium transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={submitConnectModal}
                  disabled={connectModal.busy}
                  className="px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {connectModal.busy && <Loader2 size={16} className="animate-spin" />}
                  Подключить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {fetchAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-heading">
                Выписка из банка: {fetchAccount.bankName}
              </h2>
              <button
                onClick={closeFetch}
                disabled={fetchBusy}
                className="text-subtle hover:text-body disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex items-end gap-3">
                <label className="text-xs text-subtle">
                  С
                  <input
                    type="date"
                    value={fetchStart}
                    onChange={(e) => setFetchStart(e.target.value)}
                    className="block mt-0.5 rounded-md border border-line bg-surface text-body text-sm px-2 py-1"
                  />
                </label>
                <label className="text-xs text-subtle">
                  По
                  <input
                    type="date"
                    value={fetchEnd}
                    onChange={(e) => setFetchEnd(e.target.value)}
                    className="block mt-0.5 rounded-md border border-line bg-surface text-body text-sm px-2 py-1"
                  />
                </label>
              </div>

              {fetchError && (
                <div className="p-3 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg text-sm flex items-center gap-2">
                  <AlertTriangle size={16} /> {fetchError}
                </div>
              )}

              {fetchSaved && (
                <div
                  className={`p-3 rounded-lg text-sm border ${
                    fetchSaved.docCount === 0
                      ? "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30"
                      : fetchSaved.status === "OK"
                        ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30"
                        : "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {fetchSaved.docCount === 0 ? (
                      <>
                        <AlertTriangle size={16} /> Выписка сохранена, но операций за период нет.
                      </>
                    ) : fetchSaved.status === "OK" ? (
                      <>
                        <CheckCircle2 size={16} /> Сохранено {fetchSaved.docCount} операций, сверка
                        сошлась.
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={16} /> Сохранено {fetchSaved.docCount} операций,
                        расхождение {money(fetchSaved.diff)} ₽.
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeFetch}
                  className="px-4 py-2 border-2 border-primary/20 text-primary hover:bg-primary/5 rounded-lg text-sm font-medium transition-colors"
                  disabled={fetchBusy}
                >
                  {fetchSaved ? "Закрыть" : "Отмена"}
                </button>
                {!fetchSaved && (
                  <button
                    type="button"
                    onClick={runSave}
                    disabled={fetchBusy}
                    className="px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {fetchBusy && <Loader2 size={16} className="animate-spin" />}
                    Сохранить файл
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
