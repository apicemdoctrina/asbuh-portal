import { useState, useEffect, useRef } from "react";
import { api } from "../lib/api.js";
import { Plus, Pencil, Trash2, X, Eye, EyeOff } from "lucide-react";

const SYSTEM_TYPES = [
  { value: "KASSA", label: "Касса", bg: "bg-emerald-100", text: "text-emerald-700" },
  { value: "ONE_C", label: "1С", bg: "bg-blue-100", text: "text-blue-700" },
  { value: "OTHER", label: "Другое", bg: "bg-slate-100", text: "text-slate-600" },
];

const TYPE_STYLE = Object.fromEntries(SYSTEM_TYPES.map((t) => [t.value, t]));

function typeBadgeCls(type) {
  const s = TYPE_STYLE[type];
  if (s) return `${s.bg} ${s.text}`;
  return "bg-slate-100 text-slate-600";
}

function typeLabel(type) {
  return TYPE_STYLE[type]?.label ?? type;
}

const SECRET_DISPLAY_DURATION = 30_000;

export default function SystemAccessesCard({
  organizationId,
  systemAccesses,
  canEdit,
  canViewSecrets,
  onDataChanged,
}) {
  const [showModal, setShowModal] = useState(false);
  const [editingAccess, setEditingAccess] = useState(null);
  const [systemType, setSystemType] = useState("KASSA");
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [revealedSecrets, setRevealedSecrets] = useState({});
  const hideTimers = useRef({});

  useEffect(() => {
    return () => {
      Object.values(hideTimers.current).forEach(clearTimeout);
    };
  }, []);

  function openAdd() {
    setEditingAccess(null);
    setSystemType("KASSA");
    setName("");
    setLogin("");
    setPassword("");
    setComment("");
    setFormError("");
    setShowModal(true);
  }

  function openEdit(acc) {
    setEditingAccess(acc);
    setSystemType(acc.systemType);
    setName(acc.name || "");
    setLogin("");
    setPassword("");
    setComment(acc.comment || "");
    setFormError("");
    setShowModal(true);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setFormError("");
    try {
      const loginVal = login.trim();
      const passwordVal = password.trim();
      const body = JSON.stringify({
        systemType,
        name: name.trim() || null,
        login: loginVal || (editingAccess ? undefined : null),
        password: passwordVal || (editingAccess ? undefined : null),
        comment: comment.trim() || null,
      });
      const url = editingAccess
        ? `/api/organizations/${organizationId}/system-accesses/${editingAccess.id}`
        : `/api/organizations/${organizationId}/system-accesses`;
      const res = await api(url, { method: editingAccess ? "PUT" : "POST", body });
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
    if (!confirm("Удалить запись?")) return;
    try {
      const res = await api(`/api/organizations/${organizationId}/system-accesses/${accId}`, {
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
      const res = await api(
        `/api/organizations/${organizationId}/system-accesses/${accId}/secrets`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка получения данных");
      }
      const secrets = await res.json();
      setRevealedSecrets((prev) => ({ ...prev, [accId]: secrets }));

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

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-900">Доступы (Касса / 1С)</h2>
        {canEdit && (
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-1 text-sm text-[#6567F1] hover:text-[#5557E1] font-medium"
          >
            <Plus size={16} /> Добавить
          </button>
        )}
      </div>

      {systemAccesses.length === 0 ? (
        <p className="text-sm text-slate-400">Нет доступов</p>
      ) : (
        <div className="space-y-2">
          {systemAccesses.map((acc) => {
            const revealed = revealedSecrets[acc.id];
            const isRevealed = !!revealed;
            const displayLogin = revealed ? revealed.login : acc.login;
            const displayPassword = revealed ? revealed.password : acc.password;

            return (
              <div
                key={acc.id}
                className="flex items-center justify-between bg-slate-50 rounded-lg p-3"
              >
                <div className="text-sm text-slate-600 space-y-0.5">
                  <p>
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${typeBadgeCls(acc.systemType)}`}
                    >
                      {typeLabel(acc.systemType)}
                    </span>
                    {acc.name && (
                      <span className="ml-2 font-medium text-slate-700">{acc.name}</span>
                    )}
                  </p>
                  {displayLogin != null && (
                    <p>
                      Логин: <span className="font-mono">{displayLogin}</span>
                    </p>
                  )}
                  {displayPassword != null && (
                    <p>
                      Пароль: <span className="font-mono">{displayPassword}</span>
                    </p>
                  )}
                  {acc.comment && <p className="text-slate-400">{acc.comment}</p>}
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  {canViewSecrets && (acc.login != null || acc.password != null) && (
                    <button
                      onClick={() => handleRevealSecrets(acc.id)}
                      className="text-slate-400 hover:text-[#6567F1] transition-colors"
                      title={isRevealed ? "Скрыть" : "Показать секреты"}
                    >
                      {isRevealed ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  )}
                  {canEdit && (
                    <>
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
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                {editingAccess ? "Редактировать доступ" : "Новый доступ"}
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
                <label className="block text-sm font-medium text-slate-700 mb-2">Система *</label>
                <div className="flex gap-2">
                  {SYSTEM_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setSystemType(t.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all ${
                        systemType === t.value
                          ? `${t.bg} ${t.text} border-current ring-2 ring-current/20`
                          : `${t.bg} ${t.text} border-transparent opacity-60 hover:opacity-100`
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Название <span className="text-slate-400 font-normal">(необязательно)</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder='Например: "Основная касса"'
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Логин</label>
                <input
                  type="text"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder={editingAccess ? "Оставьте пустым, чтобы не менять" : ""}
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Пароль</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editingAccess ? "Оставьте пустым, чтобы не менять" : ""}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                />
              </div>

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
