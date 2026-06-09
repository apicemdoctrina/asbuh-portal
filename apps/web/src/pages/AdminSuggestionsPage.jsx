import { useEffect, useState, useCallback } from "react";
import { Loader2, Lightbulb, Archive, ArchiveRestore, Check, ExternalLink } from "lucide-react";
import { api } from "../lib/api.js";

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AdminSuggestionsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(`/api/suggestions${showArchived ? "?archived=1" : ""}`);
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(id, body) {
    setUpdatingId(id);
    try {
      const res = await api(`/api/suggestions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const updated = await res.json();
        setItems((prev) =>
          prev
            .map((it) => (it.id === id ? { ...it, ...updated } : it))
            .filter((it) => (showArchived ? true : !it.archivedAt)),
        );
      }
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-300 to-yellow-500 text-white flex items-center justify-center">
            <Lightbulb size={20} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-heading">
              Предложения от пользователей
            </h1>
            <p className="text-sm text-subtle">
              Анонимные предложения и пожелания со стороны пользователей сервиса.
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-body cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="accent-primary"
          />
          Показать архив
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-subtle">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-surface border border-line rounded-2xl p-10 text-center text-subtle">
          Пока нет предложений.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((s) => (
            <div
              key={s.id}
              className={`bg-surface border border-line rounded-xl p-4 flex flex-col gap-2 ${
                s.archivedAt ? "opacity-60" : ""
              } ${!s.readAt ? "border-l-4 border-l-primary" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-subtle">
                  <span>{formatDate(s.createdAt)}</span>
                  {s.pageUrl && (
                    <>
                      <span>·</span>
                      {typeof s.pageUrl === "string" &&
                      s.pageUrl.startsWith("/") &&
                      !s.pageUrl.startsWith("//") ? (
                        <a
                          href={s.pageUrl}
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 hover:text-primary"
                        >
                          {s.pageUrl}
                          <ExternalLink size={11} />
                        </a>
                      ) : (
                        <span className="text-subtle">{s.pageUrl}</span>
                      )}
                    </>
                  )}
                  {!s.readAt && (
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      новое
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!s.readAt && (
                    <button
                      onClick={() => patch(s.id, { read: true })}
                      disabled={updatingId === s.id}
                      className="p-1.5 rounded-lg text-subtle hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                      title="Отметить прочитанным"
                    >
                      <Check size={16} />
                    </button>
                  )}
                  <button
                    onClick={() =>
                      patch(s.id, { archived: !s.archivedAt, ...(!s.readAt ? { read: true } : {}) })
                    }
                    disabled={updatingId === s.id}
                    className="p-1.5 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors"
                    title={s.archivedAt ? "Вернуть из архива" : "В архив"}
                  >
                    {s.archivedAt ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                  </button>
                </div>
              </div>
              <div className="text-sm text-body whitespace-pre-wrap">{s.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
