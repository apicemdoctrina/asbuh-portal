import { useParams, Link } from "react-router";
import { api } from "../lib/api.js";
import { useApi } from "../hooks/useApi.js";
import { sanitizeHtml } from "../lib/sanitize.js";
import { ArrowLeft, Download, ExternalLink, Loader2 } from "lucide-react";

const TYPE_LABELS = { ARTICLE: "Статья", VIDEO: "Видео", FILE: "Файл" };
const AUDIENCE_LABELS = { STAFF: "Сотрудники", CLIENT: "Клиенты" };

export default function KnowledgeArticlePage() {
  const { id } = useParams();
  // errorMessage по умолчанию ("Ошибка загрузки") — для сетевых ошибок;
  // userMessage — точный текст для ответа сервера не-ok (как в исходном коде)
  const {
    data: item,
    loading,
    error,
  } = useApi(async () => {
    const res = await api(`/api/knowledge/${id}`);
    if (!res.ok) {
      const err = new Error("Материал не найден");
      err.userMessage = "Материал не найден";
      throw err;
    }
    return res.json();
  }, [id]);

  async function handleDownload() {
    try {
      const res = await api(`/api/knowledge/${id}/download`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = item.originalName || "file";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }

  function getEmbedUrl(url) {
    if (!url) return null;
    const ytMatch = url.match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    );
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    const rtMatch = url.match(/rutube\.ru\/video\/([a-f0-9]+)/);
    if (rtMatch) return `https://rutube.ru/play/embed/${rtMatch[1]}`;
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-subtle">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link
          to="/knowledge"
          className="inline-flex items-center gap-1 text-sm text-subtle hover:text-primary mb-4"
        >
          <ArrowLeft size={16} />
          Назад к базе знаний
        </Link>
        <div className="bg-surface rounded-2xl shadow-lg border border-line p-12 text-center text-subtle">
          {error || "Материал не найден"}
        </div>
      </div>
    );
  }

  const embedUrl = item.type === "VIDEO" ? getEmbedUrl(item.url) : null;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
      {/* Back link */}
      <Link
        to="/knowledge"
        className="inline-flex items-center gap-1 text-sm text-subtle hover:text-primary mb-6 transition-colors"
      >
        <ArrowLeft size={16} />
        База знаний
      </Link>

      {/* Cover image */}
      {item.coverImagePath && (
        <div className="rounded-2xl overflow-hidden mb-4 sm:mb-6 h-40 sm:h-56">
          <img
            src={`/uploads/${item.coverImagePath}`}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-medium">
            {TYPE_LABELS[item.type]}
          </span>
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              item.audience === "STAFF"
                ? "bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300"
                : "bg-green-50 dark:bg-green-500/15 text-green-600 dark:text-green-300"
            }`}
          >
            {AUDIENCE_LABELS[item.audience]}
          </span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-heading mb-2 leading-tight">
          {item.title}
        </h1>
        {item.description && <p className="text-subtle">{item.description}</p>}
        {/* Tags */}
        {item.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {item.tags.map((tag) => (
              <span key={tag} className="bg-muted text-body px-2.5 py-1 rounded-full text-xs">
                {tag}
              </span>
            ))}
          </div>
        )}
        {/* Meta */}
        <div className="flex items-center gap-4 mt-4 text-xs text-subtle">
          {item.createdBy && (
            <span>
              {item.createdBy.firstName} {item.createdBy.lastName}
            </span>
          )}
          <span>{new Date(item.createdAt).toLocaleDateString("ru-RU")}</span>
        </div>
      </div>

      {/* VIDEO embed */}
      {item.type === "VIDEO" && embedUrl && (
        <div className="aspect-video rounded-xl overflow-hidden bg-muted mb-6">
          <iframe src={embedUrl} className="w-full h-full" allowFullScreen title={item.title} />
        </div>
      )}

      {/* VIDEO link */}
      {item.type === "VIDEO" && item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-primary hover:text-[#5557E1] text-sm font-medium mb-6"
        >
          <ExternalLink size={16} />
          Открыть видео
        </a>
      )}

      {/* FILE download */}
      {item.type === "FILE" && item.originalName && (
        <button
          onClick={handleDownload}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border-2 border-primary/20 text-primary hover:bg-primary/5 transition-colors mb-6"
        >
          <Download size={16} />
          Скачать: {item.originalName}
        </button>
      )}

      {/* ARTICLE content */}
      {item.type === "ARTICLE" && item.content && (
        <div className="bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-8">
          <div
            className="tiptap-content text-body"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.content) }}
          />
        </div>
      )}
    </div>
  );
}
