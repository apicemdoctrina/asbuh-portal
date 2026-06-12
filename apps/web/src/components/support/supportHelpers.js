import { api } from "../../lib/api.js";

export const STATUS_LABEL = {
  OPEN: {
    text: "Открыто",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  RESOLVED: {
    text: "Решено",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  CLOSED: {
    text: "Закрыто",
    cls: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  },
};

export function formatTime(d) {
  if (!d) return "";
  const date = new Date(d);
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  return sameDay
    ? date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export function fullName(u) {
  if (!u) return "—";
  return `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email;
}

export function avatarUrl(u) {
  if (!u?.avatarUrl) return null;
  return `${import.meta.env.VITE_API_URL || ""}${u.avatarUrl}`;
}

export function attachmentUrl(att) {
  return `${import.meta.env.VITE_API_URL || ""}/uploads/${att.fileKey || att.fileName}`;
}

// Не-картиночные файлы статика не отдаёт — качаем через авторизованный эндпоинт
export async function downloadAttachment(att) {
  const key = att.fileKey || att.fileName;
  const res = await api(`/api/support/files/${encodeURIComponent(key)}`);
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = att.originalName || att.fileName || "file";
  a.click();
  URL.revokeObjectURL(url);
}

export function isImage(att) {
  const mime = att.mimeType || "";
  if (mime.startsWith("image/")) return true;
  const name = (att.originalName || att.fileName || "").toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp)$/.test(name);
}

export function formatBytes(n) {
  if (!n) return "";
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}
