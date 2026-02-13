import { useState } from "react";
import { api } from "../lib/api.js";
import { Plus, Pencil, Trash2, X } from "lucide-react";

export default function BankAccountsCard({
  organizationId,
  bankAccounts,
  canEdit,
  showLogin,
  onDataChanged,
}) {
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [login, setLogin] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  function openAdd() {
    setEditingAccount(null);
    setBankName("");
    setAccountNumber("");
    setLogin("");
    setComment("");
    setFormError("");
    setShowModal(true);
  }

  function openEdit(acc) {
    setEditingAccount(acc);
    setBankName(acc.bankName || "");
    setAccountNumber(acc.accountNumber || "");
    setLogin(acc.login || "");
    setComment(acc.comment || "");
    setFormError("");
    setShowModal(true);
  }

  async function handleSubmit() {
    if (!bankName.trim()) {
      setFormError("Название банка обязательно");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const body = JSON.stringify({
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim() || null,
        ...(showLogin ? { login: login.trim() || null } : {}),
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

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-900">Банковские счета</h2>
        {canEdit && (
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-1 text-sm text-[#6567F1] hover:text-[#5557E1] font-medium"
          >
            <Plus size={16} /> Добавить
          </button>
        )}
      </div>

      {bankAccounts.length === 0 ? (
        <p className="text-sm text-slate-400">Нет банковских счетов</p>
      ) : (
        <div className="space-y-2">
          {bankAccounts.map((acc) => (
            <div
              key={acc.id}
              className="flex items-center justify-between bg-slate-50 rounded-lg p-3"
            >
              <div className="text-sm text-slate-600 space-y-0.5">
                <p className="font-medium text-slate-900">{acc.bankName}</p>
                {acc.accountNumber && <p>Счёт: {acc.accountNumber}</p>}
                {showLogin && acc.login && <p>Логин: {acc.login}</p>}
                {acc.comment && <p className="text-slate-400">{acc.comment}</p>}
              </div>
              {canEdit && (
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <button
                    onClick={() => openEdit(acc)}
                    className="text-slate-400 hover:text-[#6567F1] transition-colors"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(acc.id)}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                {editingAccount ? "Редактировать счёт" : "Новый банковский счёт"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Название банка *
                </label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  autoFocus
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Номер счёта</label>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                />
              </div>
              {showLogin && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Логин</label>
                  <input
                    type="text"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Комментарий</label>
                <input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                />
              </div>

              {formError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{formError}</div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border-2 border-[#6567F1]/20 text-[#6567F1] hover:bg-[#6567F1]/5 rounded-lg text-sm font-medium transition-colors"
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
