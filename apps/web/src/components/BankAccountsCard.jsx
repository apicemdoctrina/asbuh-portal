import { useState } from "react";
import { api } from "../lib/api.js";
import { Plus, Pencil, Trash2, X } from "lucide-react";

const BANKS = [
  { name: "Сбербанк", bg: "bg-green-100", text: "text-green-700" },
  { name: "БСПБ", bg: "bg-rose-100", text: "text-rose-700" },
  { name: "ВТБ", bg: "bg-blue-100", text: "text-blue-700" },
  { name: "ЭТБ", bg: "bg-cyan-100", text: "text-cyan-700" },
  { name: "Альфа", bg: "bg-red-100", text: "text-red-700" },
  { name: "Т-Банк", bg: "bg-yellow-100", text: "text-yellow-700" },
  { name: "ПСБ", bg: "bg-indigo-100", text: "text-indigo-700" },
  { name: "Точка", bg: "bg-orange-100", text: "text-orange-700" },
  { name: "РСБ", bg: "bg-teal-100", text: "text-teal-700" },
  { name: "Открытие", bg: "bg-sky-100", text: "text-sky-700" },
  { name: "ГазПромБанк", bg: "bg-slate-200", text: "text-slate-700" },
  { name: "Локо", bg: "bg-purple-100", text: "text-purple-700" },
  { name: "Авангард", bg: "bg-amber-100", text: "text-amber-700" },
];

const BANK_STYLE = Object.fromEntries(BANKS.map((b) => [b.name, { bg: b.bg, text: b.text }]));

function bankBadgeCls(name) {
  const s = BANK_STYLE[name];
  if (s) return `${s.bg} ${s.text}`;
  return "bg-slate-100 text-slate-600";
}

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
  const [login, setLogin] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  function openAdd() {
    setEditingAccount(null);
    setBankName("");
    setLogin("");
    setComment("");
    setFormError("");
    setShowModal(true);
  }

  function openEdit(acc) {
    setEditingAccount(acc);
    setBankName(acc.bankName || "");
    setLogin(acc.login || "");
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
      const body = JSON.stringify({
        bankName,
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
                <p>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${bankBadgeCls(acc.bankName)}`}
                  >
                    {acc.bankName}
                  </span>
                </p>
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
                <label className="block text-sm font-medium text-slate-700 mb-2">Банк *</label>
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
