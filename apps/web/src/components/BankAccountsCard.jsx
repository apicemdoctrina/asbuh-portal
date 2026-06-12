import { useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../lib/api.js";
import BankAccountRow from "./bank-accounts/BankAccountRow.jsx";
import BankAccountFormModal from "./bank-accounts/BankAccountFormModal.jsx";
import ConnectBankModal from "./bank-accounts/ConnectBankModal.jsx";
import FetchStatementModal from "./bank-accounts/FetchStatementModal.jsx";

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
  // null = закрыто, { account: null } = создание, { account: acc } = редактирование
  const [formModal, setFormModal] = useState(null);
  const [connectAccount, setConnectAccount] = useState(null);
  const [fetchAccount, setFetchAccount] = useState(null);
  // Инкремент по accId раскрывает и перезагружает список выписок строки после забора из банка
  const [stRefresh, setStRefresh] = useState({});

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

  return (
    <div className="bg-surface rounded-2xl shadow-lg border border-line p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-heading">Банковские счета</h2>
        {canEdit && (
          <button
            onClick={() => setFormModal({ account: null })}
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
          {bankAccounts.map((acc) => (
            <BankAccountRow
              key={acc.id}
              organizationId={organizationId}
              acc={acc}
              canEdit={canEdit}
              showLogin={showLogin}
              canViewSecrets={canViewSecrets}
              canFetchStatements={canFetchStatements}
              canConnectBank={canConnectBank}
              onEdit={(a) => setFormModal({ account: a })}
              onDelete={handleDelete}
              onConnect={setConnectAccount}
              onFetch={setFetchAccount}
              onDataChanged={onDataChanged}
              statementsRefreshSignal={stRefresh[acc.id] ?? 0}
            />
          ))}
        </div>
      )}

      {formModal && (
        <BankAccountFormModal
          organizationId={organizationId}
          account={formModal.account}
          showLogin={showLogin}
          onClose={() => setFormModal(null)}
          onSaved={() => {
            setFormModal(null);
            onDataChanged();
          }}
        />
      )}

      {connectAccount && (
        <ConnectBankModal
          organizationId={organizationId}
          acc={connectAccount}
          onClose={() => setConnectAccount(null)}
        />
      )}

      {fetchAccount && (
        <FetchStatementModal
          organizationId={organizationId}
          acc={fetchAccount}
          onClose={() => setFetchAccount(null)}
          onSaved={() => {
            // Тихий рефреш родителя — без setLoading(true), иначе модалка размонтируется.
            // Нужен, чтобы acc.lastFetchAt обновился и при повторном открытии не предлагал тот же период.
            onDataChanged?.({ silent: true });
            setStRefresh((s) => ({ ...s, [fetchAccount.id]: (s[fetchAccount.id] ?? 0) + 1 }));
          }}
        />
      )}
    </div>
  );
}
