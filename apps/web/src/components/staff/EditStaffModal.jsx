import { useState } from "react";
import { Loader2, KeyRound, X } from "lucide-react";
import { api } from "../../lib/api.js";
import Modal from "../ui/Modal.jsx";
import { ASSIGNABLE_ROLES, ROLE_LABELS, ACCOUNTANT_TYPE_LABELS } from "./staffConstants.js";

/** Edits staff identity, role, accountant type, активность; can set a new password. */
export default function EditStaffModal({ user: target, currentUserId, onClose, onUpdated }) {
  const targetIsAdmin = target.roles.includes("admin");
  const isSelf = target.id === currentUserId;
  const rolesDisabled = targetIsAdmin;

  const currentRole = target.roles.find((r) => ASSIGNABLE_ROLES.includes(r)) || "";

  const [form, setForm] = useState({
    lastName: target.lastName,
    firstName: target.firstName,
    email: target.email,
    role: currentRole,
    isActive: target.isActive,
    accountantType: target.accountantType ?? "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [showPasswordBlock, setShowPasswordBlock] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSetPassword() {
    setPasswordError("");
    setPasswordSuccess(false);
    if (newPassword.length < 8) {
      setPasswordError("Пароль должен быть не менее 8 символов");
      return;
    }
    setPasswordSubmitting(true);
    try {
      const res = await api(`/api/users/${target.id}/password`, {
        method: "PATCH",
        body: JSON.stringify({ newPassword }),
      });
      if (res.ok) {
        setPasswordSuccess(true);
        setNewPassword("");
        setShowPasswordBlock(false);
      } else {
        const data = await res.json().catch(() => ({}));
        setPasswordError(data.error || "Ошибка");
      }
    } catch {
      setPasswordError("Сетевая ошибка");
    } finally {
      setPasswordSubmitting(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.lastName || !form.firstName || !form.email) {
      setError("Заполните все обязательные поля");
      return;
    }

    const body = {
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
    };

    if (!rolesDisabled) {
      body.roleNames = [form.role];
      body.isActive = form.isActive;
    }

    if (form.role === "accountant") {
      body.accountantType = form.accountantType || null;
    } else if (currentRole === "accountant" && form.role !== "accountant") {
      // Cleared when role changes away from accountant
      body.accountantType = null;
    }

    setSubmitting(true);
    try {
      const res = await api(`/api/users/${target.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        onUpdated();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Ошибка обновления");
      }
    } catch {
      setError("Сетевая ошибка");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Редактировать сотрудника" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-body mb-1">Фамилия *</label>
          <input
            type="text"
            value={form.lastName}
            onChange={(e) => setField("lastName", e.target.value)}
            className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-body mb-1">Имя *</label>
          <input
            type="text"
            value={form.firstName}
            onChange={(e) => setField("firstName", e.target.value)}
            className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-body mb-1">Email *</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setField("email", e.target.value)}
            className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-body mb-2">Роль</label>
          <div className="flex flex-wrap gap-3">
            {ASSIGNABLE_ROLES.map((r) => (
              <label
                key={r}
                className={`flex items-center gap-2 ${rolesDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <input
                  type="radio"
                  name="editRole"
                  checked={form.role === r}
                  onChange={() => setField("role", r)}
                  disabled={rolesDisabled}
                  className="w-4 h-4 border-line text-primary focus:ring-primary/30"
                />
                <span className="text-sm text-body">{ROLE_LABELS[r]}</span>
              </label>
            ))}
          </div>
        </div>
        {form.role === "accountant" && (
          <div>
            <label className="block text-sm font-medium text-body mb-2">Тип бухгалтера</label>
            <div className="flex flex-wrap gap-3">
              {Object.entries(ACCOUNTANT_TYPE_LABELS).map(([code, label]) => (
                <label key={code} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="accountantType"
                    checked={form.accountantType === code}
                    onChange={() => setField("accountantType", code)}
                    className="w-4 h-4 border-line text-primary focus:ring-primary/30"
                  />
                  <span className="text-sm text-body">{label}</span>
                </label>
              ))}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="accountantType"
                  checked={!form.accountantType}
                  onChange={() => setField("accountantType", "")}
                  className="w-4 h-4 border-line text-primary focus:ring-primary/30"
                />
                <span className="text-sm text-subtle">Не задан</span>
              </label>
            </div>
          </div>
        )}
        <div>
          <label
            className={`flex items-center gap-2 ${rolesDisabled || isSelf ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setField("isActive", e.target.checked)}
              disabled={rolesDisabled || isSelf}
              className="w-4 h-4 rounded border-line text-primary focus:ring-primary/30"
            />
            <span className="text-sm font-medium text-body">Активен</span>
          </label>
        </div>

        {error && (
          <div className="text-sm text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-500/15 px-3 py-2 rounded-lg">
            {error}
          </div>
        )}

        {/* Password reset block */}
        <div className="border-t border-line pt-4">
          {!showPasswordBlock ? (
            <button
              type="button"
              onClick={() => {
                setShowPasswordBlock(true);
                setPasswordSuccess(false);
              }}
              className="flex items-center gap-2 text-sm text-subtle hover:text-primary transition-colors"
            >
              <KeyRound size={14} />
              Сменить пароль
            </button>
          ) : (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-body">Новый пароль</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Минимум 8 символов"
                  className="flex-1 px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={handleSetPassword}
                  disabled={passwordSubmitting}
                  className="px-3 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white shadow-lg shadow-[#6567F1]/30 transition-all disabled:opacity-50"
                >
                  {passwordSubmitting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    "Сохранить"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordBlock(false);
                    setNewPassword("");
                    setPasswordError("");
                  }}
                  className="p-1.5 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              {passwordError && (
                <div className="text-sm text-red-600 dark:text-red-300">{passwordError}</div>
              )}
            </div>
          )}
          {passwordSuccess && (
            <div className="text-sm text-green-600 dark:text-green-300 mt-1">
              Пароль успешно изменён
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-body hover:text-heading transition-colors"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white shadow-lg shadow-[#6567F1]/30 transition-all disabled:opacity-50"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Сохранить
          </button>
        </div>
      </form>
    </Modal>
  );
}
