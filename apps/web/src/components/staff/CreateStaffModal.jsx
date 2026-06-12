import { useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../../lib/api.js";
import Modal from "../ui/Modal.jsx";
import { ASSIGNABLE_ROLES, ROLE_LABELS } from "./staffConstants.js";

/** Creates a new staff member with a single role. */
export default function CreateStaffModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    lastName: "",
    firstName: "",
    email: "",
    password: "",
    role: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.lastName || !form.firstName || !form.email || !form.password) {
      setError("Заполните все обязательные поля");
      return;
    }
    if (form.password.length < 8) {
      setError("Пароль должен быть не менее 8 символов");
      return;
    }
    if (!form.role) {
      setError("Выберите роль");
      return;
    }

    setSubmitting(true);
    try {
      const { role, ...rest } = form;
      const res = await api("/api/auth/staff", {
        method: "POST",
        body: JSON.stringify({ ...rest, roleNames: [role] }),
      });
      if (res.ok) {
        onCreated();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Ошибка создания сотрудника");
      }
    } catch {
      setError("Сетевая ошибка");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Новый сотрудник" size="md">
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
          <label className="block text-sm font-medium text-body mb-1">Пароль *</label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setField("password", e.target.value)}
            className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            placeholder="Минимум 8 символов"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-body mb-2">Роль *</label>
          <div className="flex flex-wrap gap-3">
            {ASSIGNABLE_ROLES.map((r) => (
              <label key={r} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="role"
                  checked={form.role === r}
                  onChange={() => setField("role", r)}
                  className="w-4 h-4 border-line text-primary focus:ring-primary/30"
                />
                <span className="text-sm text-body">{ROLE_LABELS[r]}</span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-500/15 px-3 py-2 rounded-lg">
            {error}
          </div>
        )}

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
            Создать
          </button>
        </div>
      </form>
    </Modal>
  );
}
