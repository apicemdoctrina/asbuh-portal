import { useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { api } from "../../lib/api.js";
import Modal from "../ui/Modal.jsx";
import { effectiveProvider } from "./bankConstants.js";

/** OAuth-подключение счёта к банку: уточняет номер счёта и редиректит на страницу банка. */
export default function ConnectBankModal({ organizationId, acc, onClose }) {
  const [accountNumber, setAccountNumber] = useState(acc.accountNumber || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    const num = (accountNumber || "").replace(/\D/g, "").slice(0, 20);
    if (num.length !== 20) {
      setError("Номер счёта должен быть из 20 цифр");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const provider = effectiveProvider(acc);
      // Нормализуем запись: для старых счетов apiProvider в БД может быть null —
      // на стороне бэкенда роут /authorize-url требует точного matches по apiProvider.
      const needNumberUpdate = num !== acc.accountNumber;
      const needProviderUpdate = !acc.apiProvider && !!provider;
      if (needNumberUpdate || needProviderUpdate) {
        const body = {
          ...(needNumberUpdate ? { accountNumber: num } : {}),
          ...(needProviderUpdate ? { apiProvider: provider } : {}),
        };
        const upd = await api(`/api/organizations/${organizationId}/bank-accounts/${acc.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        if (!upd.ok) {
          const data = await upd.json().catch(() => ({}));
          throw new Error(data.error || "Не удалось сохранить номер счёта");
        }
      }
      if (!provider) throw new Error("У этого банка нет API-подключения");
      const res = await api(`/api/statements/${provider}/authorize-url?bankAccountId=${acc.id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Не удалось начать подключение");
      window.location.href = data.url;
    } catch (err) {
      setBusy(false);
      setError(err.message);
    }
  }

  return (
    <Modal
      onClose={() => {
        if (!busy) onClose();
      }}
      title={`Подключение: ${acc.bankName}`}
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 border-2 border-primary/20 text-primary hover:bg-primary/5 rounded-lg text-sm font-medium transition-colors"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy}
            className="px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50 inline-flex items-center gap-2"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            Подключить
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-body mb-1">
            Номер счёта <span className="text-subtle font-normal">(20 цифр)</span>
          </label>
          <input
            type="text"
            value={accountNumber}
            onChange={(e) => {
              setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 20));
              setError("");
            }}
            inputMode="numeric"
            placeholder="40702810…"
            autoFocus
            className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          <p className="text-xs text-subtle mt-1">
            Тот номер счёта, по которому ты подключаешь интеграцию. После &laquo;Подключить&raquo;
            откроется страница банка для подтверждения.
          </p>
        </div>
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg text-sm flex items-center gap-2">
            <AlertTriangle size={16} /> {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
