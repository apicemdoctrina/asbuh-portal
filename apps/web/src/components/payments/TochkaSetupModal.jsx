import { useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { api } from "../../lib/api.js";
import Modal from "../ui/Modal.jsx";

/** Connects a Tochka bank account: fetches account list from the API and saves the chosen one. */
export default function TochkaSetupModal({ onClose, onAdded }) {
  const [tochkaAccounts, setTochkaAccounts] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleFetchAccounts() {
    setLoading(true);
    try {
      const res = await api("/api/payments/tochka-accounts");
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Ошибка получения счетов из Точки");
        return;
      }
      setTochkaAccounts(await res.json());
    } catch {
      alert("Ошибка подключения к API Точки");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddAccount(tochkaAcc) {
    try {
      const res = await api("/api/payments/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankName: "Точка",
          accountNumber: tochkaAcc.accountId,
        }),
      });
      if (!res.ok) {
        alert("Ошибка добавления счёта");
        return;
      }
      onAdded();
    } catch {
      alert("Ошибка");
    }
  }

  return (
    <Modal onClose={onClose} title="Подключение счёта Точка" size="md">
      {!tochkaAccounts ? (
        <div className="space-y-4">
          <p className="text-sm text-body">
            Нажмите кнопку чтобы загрузить список счетов из API Точки.
          </p>
          <button
            onClick={handleFetchAccounts}
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white rounded-lg text-sm font-medium shadow-lg shadow-[#6567F1]/30 hover:from-[#5557E1] hover:to-[#4547D1] disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {loading ? "Загрузка..." : "Получить счета из Точки"}
          </button>
        </div>
      ) : tochkaAccounts.length === 0 ? (
        <p className="text-sm text-subtle">Счетов не найдено. Проверьте JWT-токен.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-body mb-3">Выберите счёт для подключения:</p>
          {tochkaAccounts.map((acc) => (
            <button
              key={acc.accountId}
              onClick={() => handleAddAccount(acc)}
              className="w-full text-left p-3 border border-line rounded-lg hover:border-primary hover:bg-primary/5 transition-colors"
            >
              <div className="font-medium text-sm text-heading">{acc.name}</div>
              <div className="text-xs text-subtle mt-0.5">
                {acc.accountId} · {acc.currency} · {acc.status}
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
