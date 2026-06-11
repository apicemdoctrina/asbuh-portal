import { useState } from "react";
import { api } from "../lib/api.js";
import { Plus, Pencil, Trash2, Phone, Mail, Send } from "lucide-react";
import Modal from "./ui/Modal.jsx";

function normalizePhone(raw) {
  return raw.replace(/[^\d+]/g, "");
}

function telegramHandle(raw) {
  return raw
    .trim()
    .replace(/^@+/, "")
    .replace(/^https?:\/\/(t\.me|telegram\.me)\//i, "");
}

export default function ContactsCard({ organizationId, contacts, canEdit, onDataChanged }) {
  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [telegram, setTelegram] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  function openAdd() {
    setEditingContact(null);
    setContactPerson("");
    setPhone("");
    setEmail("");
    setTelegram("");
    setComment("");
    setFormError("");
    setShowModal(true);
  }

  function openEdit(c) {
    setEditingContact(c);
    setContactPerson(c.contactPerson || "");
    setPhone(c.phone || "");
    setEmail(c.email || "");
    setTelegram(c.telegram || "");
    setComment(c.comment || "");
    setFormError("");
    setShowModal(true);
  }

  async function handleSubmit() {
    if (!contactPerson.trim()) {
      setFormError("Контактное лицо обязательно");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const body = JSON.stringify({
        contactPerson: contactPerson.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        telegram: telegram.trim() || null,
        comment: comment.trim() || null,
      });
      const url = editingContact
        ? `/api/organizations/${organizationId}/contacts/${editingContact.id}`
        : `/api/organizations/${organizationId}/contacts`;
      const res = await api(url, { method: editingContact ? "PUT" : "POST", body });
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

  async function handleDelete(contactId) {
    if (!confirm("Удалить контакт?")) return;
    try {
      const res = await api(`/api/organizations/${organizationId}/contacts/${contactId}`, {
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
    <div className="bg-surface rounded-2xl shadow-lg border border-line p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-heading">Контакты</h2>
        {canEdit && (
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-1 text-sm text-primary hover:text-[#5557E1] font-medium"
          >
            <Plus size={16} /> Добавить
          </button>
        )}
      </div>

      {contacts.length === 0 ? (
        <p className="text-sm text-subtle">Нет контактов</p>
      ) : (
        <div className="space-y-2">
          {contacts.map((c) => (
            <div key={c.id} className="flex items-center justify-between bg-canvas rounded-lg p-3">
              <div className="text-sm text-body space-y-1 min-w-0 flex-1">
                <p className="font-medium text-heading">{c.contactPerson}</p>
                {c.phone && (
                  <a
                    href={`tel:${normalizePhone(c.phone)}`}
                    className="inline-flex items-center gap-1.5 text-primary hover:underline break-all"
                  >
                    <Phone size={13} className="shrink-0" />
                    {c.phone}
                  </a>
                )}
                {c.email && (
                  <a
                    href={`mailto:${c.email.trim()}`}
                    className="flex items-center gap-1.5 text-primary hover:underline break-all"
                  >
                    <Mail size={13} className="shrink-0" />
                    {c.email}
                  </a>
                )}
                {c.telegram && (
                  <a
                    href={`https://t.me/${telegramHandle(c.telegram)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-primary hover:underline break-all"
                  >
                    <Send size={13} className="shrink-0" />@{telegramHandle(c.telegram)}
                  </a>
                )}
                {c.comment && <p className="text-subtle">{c.comment}</p>}
              </div>
              {canEdit && (
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <button
                    onClick={() => openEdit(c)}
                    className="text-subtle hover:text-primary transition-colors"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="text-subtle hover:text-red-500 dark:hover:text-red-400 transition-colors"
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
        <Modal
          onClose={() => setShowModal(false)}
          title={editingContact ? "Редактировать контакт" : "Новый контакт"}
          size="md"
          footer={
            <>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border-2 border-primary/20 text-primary hover:bg-primary/5 rounded-lg text-sm font-medium transition-colors"
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
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-body mb-1">Контактное лицо *</label>
              <input
                type="text"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                autoFocus
                className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-body mb-1">Телефон</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-body mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-body mb-1">Telegram</label>
              <input
                type="text"
                value={telegram}
                onChange={(e) => setTelegram(e.target.value)}
                className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-body mb-1">Комментарий</label>
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

            {formError && (
              <div className="p-3 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg text-sm">
                {formError}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
