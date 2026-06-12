import { FileText } from "lucide-react";
import { attachmentUrl, isImage, formatBytes, downloadAttachment } from "./supportHelpers.js";

export default function MessageAttachments({ items, mine }) {
  if (!items || items.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-2 mt-1 ${mine ? "justify-end" : "justify-start"}`}>
      {items.map((att, i) => {
        const url = attachmentUrl(att);
        const label = att.originalName || att.fileName || "файл";
        if (isImage(att)) {
          return (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block max-w-[240px] rounded-lg overflow-hidden border border-line bg-canvas hover:opacity-90 transition-opacity"
              title={label}
            >
              <img src={url} alt={label} className="block max-h-48 object-cover" />
            </a>
          );
        }
        return (
          <button
            key={i}
            type="button"
            onClick={() => downloadAttachment(att)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-line bg-canvas text-xs text-body hover:border-primary/40 hover:text-primary transition-colors max-w-[260px]"
          >
            <FileText size={14} className="shrink-0" />
            <span className="truncate">{label}</span>
            {att.fileSize ? (
              <span className="text-subtle shrink-0">· {formatBytes(att.fileSize)}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
