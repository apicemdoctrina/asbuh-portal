import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { X, Send, Mail, MessageCircle, Loader2 } from "lucide-react";

const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

export default function SendMessageModal({
  orgId,
  orgName,
  contacts,
  onClose,
  onSent,
  senderName,
}) {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [channel, setChannel] = useState("EMAIL");
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api("/api/messages/templates").then(async (res) => {
      if (res.ok) setTemplates(await res.json());
    });
  }, []);

  // Build template variables from org context
  function getVars() {
    const now = new Date();
    return {
      orgName: orgName || "",
      contactPerson: contacts?.[0]?.contactPerson || "",
      period: `${MONTHS[now.getMonth()]} ${now.getFullYear()}`,
      dueDate: "",
      senderName: senderName || "",
    };
  }

  function applyVars(text) {
    const vars = getVars();
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
  }

  function handleTemplateSelect(id) {
    setSelectedTemplateId(id);
    if (!id) return;
    const t = templates.find((t) => t.id === id);
    if (!t) return;
    setChannel(t.channel);
    setSubject(applyVars(t.subject || ""));
    setBody(applyVars(t.body));
  }

  // Auto-fill recipient from contacts when channel changes
  useEffect(() => {
    if (!contacts?.length) return;
    if (channel === "EMAIL") {
      const emailContact = contacts.find((c) => c.email);
      if (emailContact) setRecipient(emailContact.email);
    } else if (channel === "TELEGRAM") {
      const tgContact = contacts.find((c) => c.telegram);
      if (tgContact) setRecipient(tgContact.telegram);
    }
  }, [channel, contacts]);

  async function handleSend() {
    if (!recipient || !body) return;
    setSending(true);
    setError("");
    try {
      const res = await api(`/api/messages/send/${orgId}`, {
        method: "POST",
        body: JSON.stringify({
          templateId: selectedTemplateId || undefined,
          recipient,
          subject: channel === "EMAIL" ? subject : undefined,
          body,
          channel,
        }),
      });
      if (res.ok || res.status === 207) {
        const data = await res.json();
        if (data.warning) {
          setError(data.warning);
        } else {
          setSuccess(true);
          setTimeout(() => {
            onSent?.();
            onClose();
          }, 1200);
        }
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Ошибка отправки");
      }
    } catch {
      setError("Ошибка сети");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Отправить сообщение</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {success && (
            <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg text-sm font-medium">
              Сообщение отправлено!
            </div>
          )}
          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
          )}

          {/* Template selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Шаблон</label>
            <select
              value={selectedTemplateId}
              onChange={(e) => handleTemplateSelect(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
            >
              <option value="">Без шаблона (произвольное сообщение)</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.channel === "EMAIL" ? "Email" : "Telegram"})
                </option>
              ))}
            </select>
          </div>

          {/* Channel */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Канал</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setChannel("EMAIL")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                  channel === "EMAIL"
                    ? "border-[#6567F1] bg-[#6567F1]/5 text-[#6567F1]"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <Mail size={16} />
                Email
              </button>
              <button
                type="button"
                onClick={() => setChannel("TELEGRAM")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                  channel === "TELEGRAM"
                    ? "border-[#6567F1] bg-[#6567F1]/5 text-[#6567F1]"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <MessageCircle size={16} />
                Telegram
              </button>
            </div>
          </div>

          {/* Recipient */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {channel === "EMAIL" ? "Email получателя" : "Telegram Chat ID"}
            </label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder={channel === "EMAIL" ? "client@example.com" : "123456789"}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
            />
          </div>

          {/* Subject (email only) */}
          {channel === "EMAIL" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Тема</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Запрос документов"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
              />
            </div>
          )}

          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Сообщение</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder="Текст сообщения..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] resize-y"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !recipient || !body || success}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {sending ? "Отправка..." : "Отправить"}
          </button>
        </div>
      </div>
    </div>
  );
}
