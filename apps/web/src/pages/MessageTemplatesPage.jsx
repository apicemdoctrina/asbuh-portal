import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  Mail,
  MessageCircle,
  Loader2,
  FileText,
} from "lucide-react";

const CHANNEL_LABELS = { EMAIL: "Email", TELEGRAM: "Telegram" };
const CHANNEL_ICONS = { EMAIL: Mail, TELEGRAM: MessageCircle };

const PLACEHOLDER_HELP = [
  { key: "orgName", desc: "Название организации" },
  { key: "contactPerson", desc: "Контактное лицо" },
  { key: "period", desc: "Период (напр. Март 2026)" },
  { key: "dueDate", desc: "Срок" },
  { key: "senderName", desc: "Имя отправителя" },
];

export default function MessageTemplatesPage() {
  const { hasPermission } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", subject: "", body: "", channel: "EMAIL" });
  const [saving, setSaving] = useState(false);

  const canCreate = hasPermission("message", "create");
  const canEdit = hasPermission("message", "edit");
  const canDelete = hasPermission("message", "delete");

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    setLoading(true);
    try {
      const res = await api("/api/messages/templates");
      if (res.ok) setTemplates(await res.json());
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm({ name: "", subject: "", body: "", channel: "EMAIL" });
    setShowModal(true);
  }

  function openEdit(t) {
    setEditing(t);
    setForm({ name: t.name, subject: t.subject || "", body: t.body, channel: t.channel });
    setShowModal(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.subject) delete payload.subject;

      const res = editing
        ? await api(`/api/messages/templates/${editing.id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          })
        : await api("/api/messages/templates", {
            method: "POST",
            body: JSON.stringify(payload),
          });

      if (res.ok) {
        setShowModal(false);
        loadTemplates();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Удалить шаблон?")) return;
    const res = await api(`/api/messages/templates/${id}`, { method: "DELETE" });
    if (res.ok) loadTemplates();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Шаблоны сообщений</h1>
          <p className="text-sm text-slate-500 mt-1">
            Шаблоны для быстрой отправки email и Telegram-сообщений клиентам
          </p>
        </div>
        {canCreate && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all"
          >
            <Plus size={16} />
            Новый шаблон
          </button>
        )}
      </div>

      {/* Templates list */}
      {templates.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-12 text-center">
          <FileText size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500">Шаблонов пока нет</p>
          {canCreate && (
            <button
              onClick={openCreate}
              className="mt-4 text-[#6567F1] hover:text-[#5557E1] text-sm font-medium"
            >
              Создать первый шаблон
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {templates.map((t) => {
            const Icon = CHANNEL_ICONS[t.channel] || Mail;
            return (
              <div
                key={t.id}
                className="bg-white rounded-2xl shadow-lg border border-slate-200 p-5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5 p-2 bg-[#6567F1]/10 rounded-lg">
                      <Icon size={18} className="text-[#6567F1]" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900">{t.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="bg-[#6567F1]/10 text-[#6567F1] px-2 py-0.5 rounded-full text-xs font-medium">
                          {CHANNEL_LABELS[t.channel]}
                        </span>
                        {t.subject && (
                          <span className="text-xs text-slate-400 truncate">Тема: {t.subject}</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 mt-2 line-clamp-2 whitespace-pre-line">
                        {t.body}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-4 shrink-0">
                    {canEdit && (
                      <button
                        onClick={() => openEdit(t)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                      >
                        <Pencil size={16} />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">
                {editing ? "Редактировать шаблон" : "Новый шаблон"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Название</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Запрос документов"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Канал</label>
                <select
                  value={form.channel}
                  onChange={(e) => setForm({ ...form, channel: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                >
                  <option value="EMAIL">Email</option>
                  <option value="TELEGRAM">Telegram</option>
                </select>
              </div>
              {form.channel === "EMAIL" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Тема письма
                  </label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    placeholder="Запрос документов — {{orgName}}"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Текст сообщения
                </label>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  rows={6}
                  placeholder="Здравствуйте, {{contactPerson}}!&#10;&#10;Просим предоставить документы..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] resize-y"
                />
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs font-medium text-slate-500 mb-1.5">Доступные переменные:</p>
                <div className="flex flex-wrap gap-1.5">
                  {PLACEHOLDER_HELP.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setForm({ ...form, body: form.body + `{{${p.key}}}` })}
                      className="text-xs bg-white border border-slate-200 px-2 py-1 rounded-md hover:bg-[#6567F1]/5 hover:border-[#6567F1]/20 transition-colors"
                      title={p.desc}
                    >
                      {`{{${p.key}}}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-200">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name || !form.body}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={16} />
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
