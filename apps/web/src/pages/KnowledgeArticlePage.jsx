import { useState, useEffect } from "react";
import { useParams, Link } from "react-router";
import { api } from "../lib/api.js";
import { ArrowLeft, Download, ExternalLink, Loader2 } from "lucide-react";

const TYPE_LABELS = { ARTICLE: "Статья", VIDEO: "Видео", FILE: "Файл" };
const AUDIENCE_LABELS = { STAFF: "Сотрудники", CLIENT: "Клиенты" };

export default function KnowledgeArticlePage() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await api(`/api/knowledge/${id}`);
        if (res.ok) {
          setItem(await res.json());
        } else {
          setError("Материал не найден");
        }
      } catch {
        setError("Ошибка загрузки");
      } finally {
        setLoading(false);
      }
    }
    load();
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
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link
          to="/knowledge"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#6567F1] mb-4"
        >
          <ArrowLeft size={16} />
          Назад к базе знаний
        </Link>
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-12 text-center text-slate-400">
          {error || "Материал не найден"}
        </div>
      </div>
    );
  }

  const embedUrl = item.type === "VIDEO" ? getEmbedUrl(item.url) : null;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back link */}
      <Link
        to="/knowledge"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#6567F1] mb-6 transition-colors"
      >
        <ArrowLeft size={16} />
        База знаний
      </Link>

      {/* Cover image */}
      {item.coverImagePath && (
        <div className="rounded-2xl overflow-hidden mb-6 h-56">
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
          <span className="bg-[#6567F1]/10 text-[#6567F1] px-3 py-1 rounded-full text-xs font-medium">
            {TYPE_LABELS[item.type]}
          </span>
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              item.audience === "STAFF" ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"
            }`}
          >
            {AUDIENCE_LABELS[item.audience]}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">{item.title}</h1>
        {item.description && <p className="text-slate-500">{item.description}</p>}
        {/* Tags */}
        {item.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        {/* Meta */}
        <div className="flex items-center gap-4 mt-4 text-xs text-slate-400">
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
        <div className="aspect-video rounded-xl overflow-hidden bg-slate-100 mb-6">
          <iframe src={embedUrl} className="w-full h-full" allowFullScreen title={item.title} />
        </div>
      )}

      {/* VIDEO link */}
      {item.type === "VIDEO" && item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-[#6567F1] hover:text-[#5557E1] text-sm font-medium mb-6"
        >
          <ExternalLink size={16} />
          Открыть видео
        </a>
      )}

      {/* FILE download */}
      {item.type === "FILE" && item.originalName && (
        <button
          onClick={handleDownload}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border-2 border-[#6567F1]/20 text-[#6567F1] hover:bg-[#6567F1]/5 transition-colors mb-6"
        >
          <Download size={16} />
          Скачать: {item.originalName}
        </button>
      )}

      {/* ARTICLE content */}
      {item.type === "ARTICLE" && item.content && (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 sm:p-8">
          <div
            className="tiptap-content text-slate-700"
            dangerouslySetInnerHTML={{ __html: item.content }}
          />
        </div>
      )}
    </div>
  );
}
