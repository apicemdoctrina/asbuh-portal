import { useState, useCallback } from "react";
import { useDebouncedEffect } from "../hooks/useDebouncedEffect.js";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import { Search, Plus, X, Loader2, Pencil, Trash2 } from "lucide-react";

export default function WorkContactsPage() {
  const { hasPermission } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);

  const canCreate = hasPermission("work_contact", "create");
  const canEdit = hasPermission("work_contact", "edit");
  const canDelete = hasPermission("work_contact", "delete");

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await api(`/api/work-contacts${params}`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data.data);
        setTotal(data.total);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [search]);

  useDebouncedEffect(fetchContacts, [fetchContacts]);

  function handleSaved() {
    setShowModal(false);
    setEditingContact(null);
    fetchContacts();
  }

  async function handleDelete(contact) {
    if (!confirm(`Удалить контакт "${contact.name}"?`)) return;
    try {
      const res = await api(`/api/work-contacts/${contact.id}`, { method: "DELETE" });
      if (res.ok) {
        fetchContacts();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Ошибка удаления");
      }
    } catch {
      alert("Сетевая ошибка");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Рабочие контакты</h1>
        {canCreate && (
          <button
            onClick={() => {
              setEditingContact(null);
              setShowModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white shadow-lg shadow-[#6567F1]/30 transition-all"
          >
            <Plus size={16} />
            Добавить контакт
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Поиск по имени или должности..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            {search ? "Ничего не найдено" : "Нет контактов"}
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="px-6 py-3 font-medium">Имя</th>
                  <th className="px-6 py-3 font-medium">Должность</th>
                  <th className="px-6 py-3 font-medium">Телефон</th>
                  <th className="px-6 py-3 font-medium hidden md:table-cell">Комментарий</th>
                  {(canEdit || canDelete) && <th className="px-6 py-3 font-medium">Действия</th>}
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-6 py-3 font-medium text-slate-900">{c.name}</td>
                    <td className="px-6 py-3 text-slate-600">{c.position || "—"}</td>
                    <td className="px-6 py-3 text-slate-600">{c.phone || "—"}</td>
                    <td className="px-6 py-3 text-slate-500 hidden md:table-cell">
                      {c.comment || "—"}
                    </td>
                    {(canEdit || canDelete) && (
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          {canEdit && (
                            <button
                              onClick={() => {
                                setEditingContact(c);
                                setShowModal(true);
                              }}
                              className="p-1.5 text-slate-400 hover:text-[#6567F1] hover:bg-[#6567F1]/5 rounded-lg transition-colors"
                              title="Редактировать"
                            >
                              <Pencil size={16} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(c)}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Удалить"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {total > contacts.length && (
              <div className="px-6 py-3 text-xs text-slate-400 border-t border-slate-100">
                Показано {contacts.length} из {total}
              </div>
            )}
          </>
        )}
      </div>

      {showModal && (
        <ContactModal
          contact={editingContact}
          onClose={() => {
            setShowModal(false);
            setEditingContact(null);
          }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

function ContactModal({ contact, onClose, onSaved }) {
  const isEdit = !!contact;
  const [form, setForm] = useState({
    name: contact?.name || "",
    position: contact?.position || "",
    phone: contact?.phone || "",
    comment: contact?.comment || "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.name.trim()) {
      setError("Имя обязательно");
      return;
    }

    const body = {
      name: form.name.trim(),
      position: form.position.trim() || null,
      phone: form.phone.trim() || null,
      comment: form.comment.trim() || null,
    };

    setSubmitting(true);
    try {
      const url = isEdit ? `/api/work-contacts/${contact.id}` : "/api/work-contacts";
      const method = isEdit ? "PUT" : "POST";
      const res = await api(url, { method, body: JSON.stringify(body) });
      if (res.ok) {
        onSaved();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Ошибка сохранения");
      }
    } catch {
      setError("Сетевая ошибка");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900">
            {isEdit ? "Редактировать контакт" : "Новый контакт"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Имя *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Должность</label>
            <input
              type="text"
              value={form.position}
              onChange={(e) => setField("position", e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Телефон</label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setField("phone", e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Комментарий</label>
            <textarea
              value={form.comment}
              onChange={(e) => setField("comment", e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] resize-none"
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white shadow-lg shadow-[#6567F1]/30 transition-all disabled:opacity-50"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? "Сохранить" : "Создать"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
