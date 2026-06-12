import { useState } from "react";
import { useApi, jsonFetcher } from "../hooks/useApi.js";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import { Search, Plus, Loader2, Pencil, Trash2, Phone, Briefcase } from "lucide-react";
import Modal from "../components/ui/Modal.jsx";

function normalizePhone(raw) {
  return raw.replace(/[^\d+]/g, "");
}

export default function WorkContactsPage() {
  const { hasPermission } = useAuth();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);

  const canCreate = hasPermission("work_contact", "create");
  const canEdit = hasPermission("work_contact", "edit");
  const canDelete = hasPermission("work_contact", "delete");

  const {
    data,
    loading,
    refetch: fetchContacts,
  } = useApi(
    jsonFetcher(() => {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      return api(`/api/work-contacts${params}`);
    }),
    [search],
    { debounce: 300 },
  );
  const contacts = data?.data ?? [];
  const total = data?.total ?? 0;

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
      <div className="flex items-center justify-between mb-4 sm:mb-6 gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-heading">Рабочие контакты</h1>
        {canCreate && (
          <button
            onClick={() => {
              setEditingContact(null);
              setShowModal(true);
            }}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white shadow-lg shadow-[#6567F1]/30 transition-all whitespace-nowrap"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Добавить контакт</span>
            <span className="sm:hidden">Добавить</span>
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-4 sm:mb-6">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
        <input
          type="text"
          placeholder="Поиск по имени или должности..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-subtle">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-12 text-subtle text-sm">
          {search ? "Ничего не найдено" : "Нет контактов"}
        </div>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="sm:hidden space-y-2">
            {contacts.map((c) => (
              <div key={c.id} className="bg-surface border border-line rounded-2xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-heading leading-tight">{c.name}</div>
                    {c.position && (
                      <div className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-medium">
                        <Briefcase size={10} />
                        {c.position}
                      </div>
                    )}
                  </div>
                  {(canEdit || canDelete) && (
                    <div className="flex items-center gap-0.5 shrink-0 -mr-1">
                      {canEdit && (
                        <button
                          onClick={() => {
                            setEditingContact(c);
                            setShowModal(true);
                          }}
                          aria-label="Редактировать"
                          className="p-2 text-subtle hover:text-primary rounded-lg transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(c)}
                          aria-label="Удалить"
                          className="p-2 text-subtle hover:text-red-500 dark:hover:text-red-400 rounded-lg transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {c.phone && (
                  <a
                    href={`tel:${normalizePhone(c.phone)}`}
                    className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <Phone size={13} />
                    {c.phone}
                  </a>
                )}
                {c.comment && (
                  <p className="mt-2 text-xs text-subtle whitespace-pre-wrap break-words">
                    {c.comment}
                  </p>
                )}
              </div>
            ))}
            {total > contacts.length && (
              <div className="text-center text-xs text-subtle pt-2">
                Показано {contacts.length} из {total}
              </div>
            )}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block bg-surface rounded-2xl shadow-lg border border-line overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-subtle bg-canvas/30">
                  <th className="px-6 py-3 font-medium">Имя</th>
                  <th className="px-6 py-3 font-medium">Должность</th>
                  <th className="px-6 py-3 font-medium">Телефон</th>
                  <th className="px-6 py-3 font-medium hidden md:table-cell">Комментарий</th>
                  {(canEdit || canDelete) && <th className="px-6 py-3 font-medium w-24"></th>}
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                    <td className="px-6 py-3 font-medium text-heading">{c.name}</td>
                    <td className="px-6 py-3 text-body">{c.position || "—"}</td>
                    <td className="px-6 py-3 text-body">
                      {c.phone ? (
                        <a
                          href={`tel:${normalizePhone(c.phone)}`}
                          className="inline-flex items-center gap-1.5 text-primary hover:underline"
                        >
                          <Phone size={13} />
                          {c.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-6 py-3 text-subtle hidden md:table-cell max-w-[300px] truncate">
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
                              className="p-1.5 text-subtle hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
                              title="Редактировать"
                              aria-label="Редактировать"
                            >
                              <Pencil size={16} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(c)}
                              className="p-1.5 text-subtle hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 rounded-lg transition-colors"
                              title="Удалить"
                              aria-label="Удалить"
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
              <div className="px-6 py-3 text-xs text-subtle border-t border-line">
                Показано {contacts.length} из {total}
              </div>
            )}
          </div>
        </>
      )}

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
    if (form.phone.trim() && !/^[+\d\s()-]{6,20}$/.test(form.phone.trim())) {
      setError("Некорректный формат телефона");
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
    <Modal onClose={onClose} title={isEdit ? "Редактировать контакт" : "Новый контакт"} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-body mb-1">Имя *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-body mb-1">Должность</label>
          <input
            type="text"
            value={form.position}
            onChange={(e) => setField("position", e.target.value)}
            className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-body mb-1">Телефон</label>
          <input
            type="text"
            value={form.phone}
            onChange={(e) => setField("phone", e.target.value)}
            className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-body mb-1">Комментарий</label>
          <textarea
            value={form.comment}
            onChange={(e) => setField("comment", e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
          />
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
            {isEdit ? "Сохранить" : "Создать"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
