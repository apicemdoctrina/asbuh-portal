import { X, FileText } from "lucide-react";
import { attachmentUrl, isImage, formatBytes } from "./supportHelpers.js";

export default function PendingAttachments({ items, onRemove }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {items.map((att, i) => {
        const url = attachmentUrl(att);
        const label = att.originalName || att.fileName || "файл";
        return (
          <div
            key={i}
            className="relative inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-line bg-canvas text-xs text-body max-w-[260px]"
          >
            {isImage(att) ? (
              <img src={url} alt="" className="w-8 h-8 object-cover rounded" />
            ) : (
              <FileText size={14} className="shrink-0" />
            )}
            <span className="truncate">{label}</span>
            {att.fileSize ? (
              <span className="text-subtle shrink-0">{formatBytes(att.fileSize)}</span>
            ) : null}
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="p-0.5 rounded text-subtle hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              title="Убрать"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
