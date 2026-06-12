import { useState } from "react";
import { api } from "../../lib/api.js";
import Modal from "../ui/Modal.jsx";
import { BANKS, BANK_TO_PROVIDER, API_PROVIDER_LABELS } from "./bankConstants.js";

/** Create / edit a bank account. `account` = null для создания. */
export default function BankAccountFormModal({
  organizationId,
  account,
  showLogin,
  onClose,
  onSaved,
}) {
  const [bankName, setBankName] = useState(account?.bankName || "");
  const [accountNumber, setAccountNumber] = useState(account?.accountNumber || "");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [comment, setComment] = useState(account?.comment || "");
  const [apiProvider, setApiProvider] = useState(
    account ? account.apiProvider || BANK_TO_PROVIDER[account.bankName || ""] || "" : "",
  );
  const [apiAccountId, setApiAccountId] = useState(account?.apiAccountId || "");
  // Поля ввода токена в форме нет — токен появляется только через OAuth-подключение;
  // пустое значение здесь сохраняет семантику тела запроса (undefined при правке, null при создании).
  const apiToken = "";
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

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
              login: loginVal || (account ? undefined : null),
              password: passwordVal || (account ? undefined : null),
            }
          : {}),
        comment: comment.trim() || null,
        apiProvider: apiProvider || null,
        apiAccountId: apiAccountId.trim() || null,
        // токен: пусто при редактировании = не менять; при создании = null
        apiToken: tokenVal || (account ? undefined : null),
      });
      const url = account
        ? `/api/organizations/${organizationId}/bank-accounts/${account.id}`
        : `/api/organizations/${organizationId}/bank-accounts`;
      const res = await api(url, { method: account ? "PUT" : "POST", body });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка сохранения");
      }
      onSaved();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={
        account ? `Редактировать счёт${bankName ? `: ${bankName}` : ""}` : "Новый банковский счёт"
      }
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
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
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!account && (
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
                placeholder={account ? "Оставьте пустым, чтобы не менять" : ""}
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
                placeholder={account ? "Оставьте пустым, чтобы не менять" : ""}
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

        <div>
          <label className="block text-sm font-medium text-body mb-1">
            Способ получения выписок
          </label>
          <select
            value={apiProvider}
            onChange={(e) => setApiProvider(e.target.value)}
            className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="">Без подключения (ручная загрузка файлов)</option>
            {BANK_TO_PROVIDER[bankName] && (
              <option value={BANK_TO_PROVIDER[bankName]}>
                API {API_PROVIDER_LABELS[BANK_TO_PROVIDER[bankName]]} (автоматически)
              </option>
            )}
            <option value="email">Email (банк присылает выписки на общий ящик)</option>
          </select>
          {apiProvider === "email" && (
            <div className="mt-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 p-3 text-xs text-blue-900 dark:text-blue-200">
              В личном кабинете банка настройте автоотправку выписок в формате{" "}
              <strong>1C (1CClientBankExchange)</strong> на общий адрес, указанный администратором
              сервиса. Письма с вложениями будут разбираться автоматически каждые ~10 минут. Кнопка
              «Забрать выписку из банка» в этом режиме недоступна — банк присылает выписку сам.
            </div>
          )}
        </div>

        {showLogin && apiProvider === "tochka" && (
          <div className="border-t border-line pt-4">
            <label className="block text-sm font-medium text-body mb-1">
              Идентификатор счёта Точки (accountId)
            </label>
            <input
              type="text"
              value={apiAccountId}
              onChange={(e) => setApiAccountId(e.target.value)}
              placeholder="Если пусто — берётся номер счёта"
              className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <p className="text-xs text-subtle mt-1">
              Подключение к API — через кнопку «Подключить» в карточке счёта.
            </p>
          </div>
        )}

        {formError && (
          <div className="p-3 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg text-sm">
            {formError}
          </div>
        )}
      </div>
    </Modal>
  );
}
