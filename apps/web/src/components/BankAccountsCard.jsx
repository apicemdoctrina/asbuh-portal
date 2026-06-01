import { useState, useEffect, useRef } from "react";
import { api } from "../lib/api.js";
import { Plus, Pencil, Trash2, X, Eye, EyeOff } from "lucide-react";

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

const SECRET_DISPLAY_DURATION = 30_000;

export default function BankAccountsCard({
  organizationId,
  bankAccounts,
  canEdit,
  showLogin,
  canViewSecrets,
  onDataChanged,
}) {
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [bankName, setBankName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Revealed secrets: { [accountId]: { login, password } }
  const [revealedSecrets, setRevealedSecrets] = useState({});
  const hideTimers = useRef({});

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      Object.values(hideTimers.current).forEach(clearTimeout);
    };
  }, []);

  function openAdd() {
    setEditingAccount(null);
    setBankName("");
    setLogin("");
    setPassword("");
    setComment("");
    setFormError("");
    setShowModal(true);
  }

  function openEdit(acc) {
    setEditingAccount(acc);
    setBankName(acc.bankName || "");
    setLogin("");
    setPassword("");
    setComment(acc.comment || "");
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
      const body = JSON.stringify({
        bankName,
        ...(showLogin
          ? {
              login: loginVal || (editingAccount ? undefined : null),
              password: passwordVal || (editingAccount ? undefined : null),
            }
          : {}),
        comment: comment.trim() || null,
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
      onDataChanged();
    } catch (err) {
      alert(err.message);
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

            return (
              <div
                key={acc.id}
                className="flex items-center justify-between bg-canvas rounded-lg p-3"
              >
                <div className="text-sm text-body space-y-0.5">
                  <p>
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${bankBadgeCls(acc.bankName)}`}
                    >
                      {acc.bankName}
                    </span>
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
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-heading">
                {editingAccount ? "Редактировать счёт" : "Новый банковский счёт"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-subtle hover:text-body">
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-body mb-2">Банк *</label>
                <div className="flex flex-wrap gap-2">
                  {BANKS.map((b) => (
                    <button
                      key={b.name}
                      type="button"
                      onClick={() => setBankName(b.name)}
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
                <label className="block text-sm font-medium text-body mb-1">Комментарий</label>
                <input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>

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
    </div>
  );
}
