import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { api } from "../../lib/api.js";
import Modal from "../ui/Modal.jsx";

/** Generates a client invite link for the organization, optionally sending it by email. */
export default function InviteClientModal({ orgId, orgName, onClose }) {
  const [inviteLink, setInviteLink] = useState("");
  const [inviteExpiry, setInviteExpiry] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailWarning, setEmailWarning] = useState("");

  async function handleGenerate() {
    setLoading(true);
    setError("");
    setInviteLink("");
    setEmailSent(false);
    setEmailWarning("");
    setCopied(false);
    try {
      const trimmedEmail = email.trim();
      const body = { organizationId: orgId };
      if (trimmedEmail) body.email = trimmedEmail;
      const res = await api("/api/auth/invite", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка генерации приглашения");
      }
      const data = await res.json();
      setInviteLink(`${window.location.origin}/invite/${data.token}`);
      setInviteExpiry(new Date(data.expiresAt).toLocaleString("ru-RU"));
      setEmailSent(!!data.emailSent);
      if (data.emailError) setEmailWarning(data.emailError);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }

  return (
    <Modal
      onClose={onClose}
      title="Пригласить клиента"
      size="md"
      footer={
        <button
          onClick={onClose}
          className="px-4 py-2 border-2 border-primary/20 text-primary hover:bg-primary/5 rounded-lg text-sm font-medium transition-colors"
        >
          Закрыть
        </button>
      }
    >
      {!inviteLink && !error && (
        <div>
          <p className="text-sm text-subtle mb-4">
            Будет сгенерирована ссылка-приглашение для регистрации клиента в организации{" "}
            <span className="font-semibold text-heading">&laquo;{orgName}&raquo;</span>.
          </p>
          <label className="block text-sm font-medium text-body mb-1">
            Email клиента (необязательно)
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="client@example.com"
            className="w-full px-3 py-2 mb-2 border border-line rounded-lg text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
          />
          <p className="text-xs text-subtle mb-4">
            Если заполните — клиенту придёт приветственное письмо со ссылкой. Иначе только
            скопируете ссылку и отправите сами.
          </p>
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50"
          >
            {loading
              ? "Генерация..."
              : email.trim()
                ? "Сгенерировать и отправить"
                : "Сгенерировать ссылку"}
          </button>
        </div>
      )}

      {inviteLink && (
        <div className="space-y-3">
          {emailSent && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 rounded-lg text-sm">
              <Check size={16} className="shrink-0" />
              <span>
                Приглашение отправлено на <strong>{email.trim()}</strong>
              </span>
            </div>
          )}
          {emailWarning && (
            <div className="p-3 bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 rounded-lg text-sm">
              {emailWarning}
            </div>
          )}
          <p className="text-xs text-subtle">
            Ссылка-приглашение (можно скопировать и отправить вручную):
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={inviteLink}
              className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-canvas text-body"
            />
            <button
              onClick={handleCopy}
              className="shrink-0 inline-flex items-center gap-1 px-3 py-2 border-2 border-primary/20 text-primary hover:bg-primary/5 rounded-lg text-sm font-medium transition-colors"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Скопировано" : "Копировать"}
            </button>
          </div>
          <p className="text-xs text-subtle">Действительна до: {inviteExpiry}</p>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg text-sm">
          {error}
        </div>
      )}
    </Modal>
  );
}
