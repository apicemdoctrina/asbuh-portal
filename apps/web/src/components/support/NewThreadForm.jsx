import { useRef } from "react";
import { X, Paperclip, Loader2, Send } from "lucide-react";
import PendingAttachments from "./PendingAttachments.jsx";

export default function NewThreadForm({
  subject,
  onSubjectChange,
  body,
  onBodyChange,
  attachments,
  onRemoveAttachment,
  uploadingCount,
  creating,
  onSubmit,
  onClose,
  onFiles,
  onPaste,
}) {
  const fileInputRef = useRef(null);

  return (
    <form onSubmit={onSubmit} className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-heading">Новое обращение</h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors"
        >
          <X size={18} />
        </button>
      </div>
      <div>
        <label className="block text-sm font-medium text-body mb-1">Тема</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          placeholder="Кратко опишите проблему"
          required
          minLength={3}
          maxLength={200}
          className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-body mb-1">Сообщение</label>
        <textarea
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          onPaste={onPaste}
          placeholder="Опишите проблему подробно. Можно вставить скриншот через Ctrl+V."
          rows={8}
          maxLength={10_000}
          className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
        <PendingAttachments items={attachments} onRemove={onRemoveAttachment} />
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 text-xs text-subtle hover:text-primary transition-colors"
          >
            <Paperclip size={14} />
            Прикрепить файл
          </button>
          {uploadingCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-subtle">
              <Loader2 size={12} className="animate-spin" />
              Загрузка…
            </span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
            onChange={(e) => {
              onFiles(Array.from(e.target.files || []));
              e.target.value = "";
            }}
            className="hidden"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={
            creating ||
            !subject.trim() ||
            (!body.trim() && attachments.length === 0) ||
            uploadingCount > 0
          }
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white text-sm font-medium shadow-lg shadow-[#6567F1]/30 hover:from-[#5557E1] hover:to-[#4547D1] disabled:opacity-50 transition-all"
        >
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          Отправить
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm text-body hover:bg-muted transition-colors"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}
