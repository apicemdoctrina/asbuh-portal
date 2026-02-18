import { useState, useCallback, useMemo, lazy, Suspense } from "react";
import { useDebouncedEffect } from "../hooks/useDebouncedEffect.js";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import {
  Search,
  Plus,
  X,
  Loader2,
  Pencil,
  Trash2,
  FileText,
  Video,
  File,
  Download,
  ExternalLink,
  ImagePlus,
} from "lucide-react";

const RichTextEditor = lazy(() => import("../components/RichTextEditor.jsx"));

const TYPE_LABELS = { ARTICLE: "Статья", VIDEO: "Видео", FILE: "Файл" };
const AUDIENCE_LABELS = { STAFF: "Сотрудники", CLIENT: "Клиенты" };
const PRESET_TAGS = ["Налоги", "Бухучёт", "Клиенты", "Процессы", "Кадры", "Юридическое", "Прочее"];

const TYPE_ICONS = {
  ARTICLE: FileText,
  VIDEO: Video,
  FILE: File,
};

const TYPE_COLORS = {
  ARTICLE: "from-indigo-500 to-purple-500",
  VIDEO: "from-red-500 to-pink-500",
  FILE: "from-emerald-500 to-teal-500",
};

export default function KnowledgePage() {
  const { hasPermission, hasRole } = useAuth();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [audienceFilter, setAudienceFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [drawerItem, setDrawerItem] = useState(null);

  const isClient = hasRole("client");
  const canCreate = hasPermission("knowledge_item", "create");
  const canEdit = hasPermission("knowledge_item", "edit");
  const canDelete = hasPermission("knowledge_item", "delete");

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (typeFilter) params.set("type", typeFilter);
      if (audienceFilter) params.set("audience", audienceFilter);
      if (tagFilter) params.set("tag", tagFilter);
      const qs = params.toString();
      const res = await api(`/api/knowledge${qs ? `?${qs}` : ""}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.data);
        setTotal(data.total);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter, audienceFilter, tagFilter]);

  useDebouncedEffect(fetchItems, [fetchItems]);

  function handleSaved() {
    setShowModal(false);
    setEditingItem(null);
    fetchItems();
  }

  async function handleDelete(e, item) {
    e.stopPropagation();
    if (!confirm(`Удалить "${item.title}"?`)) return;
    try {
      const res = await api(`/api/knowledge/${item.id}`, { method: "DELETE" });
      if (res.ok) {
        fetchItems();
        if (drawerItem?.id === item.id) setDrawerItem(null);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Ошибка удаления");
      }
    } catch {
      alert("Сетевая ошибка");
    }
  }

  async function handleDownload(item) {
    try {
      const res = await api(`/api/knowledge/${item.id}/download`);
      if (!res.ok) {
        alert("Ошибка скачивания");
        return;
      }
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
      alert("Ошибка скачивания");
    }
  }

  // Collect all unique tags from items for filter dropdown
  const allTags = useMemo(() => [...new Set(items.flatMap((i) => i.tags || []))].sort(), [items]);

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {isClient ? "Материалы" : "База знаний"}
        </h1>
        {canCreate && (
          <button
            onClick={() => {
              setEditingItem(null);
              setShowModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white shadow-lg shadow-[#6567F1]/30 transition-all"
          >
            <Plus size={16} />
            Добавить
          </button>
        )}
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск по названию или описанию..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] bg-white"
        >
          <option value="">Все типы</option>
          <option value="ARTICLE">Статья</option>
          <option value="VIDEO">Видео</option>
          <option value="FILE">Файл</option>
        </select>
        {!isClient && (
          <select
            value={audienceFilter}
            onChange={(e) => setAudienceFilter(e.target.value)}
            className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] bg-white"
          >
            <option value="">Вся аудитория</option>
            <option value="STAFF">Сотрудники</option>
            <option value="CLIENT">Клиенты</option>
          </select>
        )}
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] bg-white"
        >
          <option value="">Все теги</option>
          {[...new Set([...PRESET_TAGS, ...allTags])].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* Card Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          {search || typeFilter || audienceFilter || tagFilter
            ? "Ничего не найдено"
            : "Нет материалов"}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((item) => {
              const Icon = TYPE_ICONS[item.type] || FileText;
              const gradientColors = TYPE_COLORS[item.type] || TYPE_COLORS.ARTICLE;
              return (
                <div
                  key={item.id}
                  onClick={() => setDrawerItem(item)}
                  className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden cursor-pointer hover:shadow-xl hover:-translate-y-0.5 transition-all group"
                >
                  {/* Cover image or fallback */}
                  <div
                    className={`h-40 relative overflow-hidden ${!item.coverImagePath ? `bg-gradient-to-br ${gradientColors}` : ""}`}
                  >
                    {item.coverImagePath ? (
                      <img
                        src={`/uploads/${item.coverImagePath}`}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Icon size={48} className="text-white/40" />
                      </div>
                    )}
                    {/* Type badge overlay */}
                    <span className="absolute top-3 left-3 inline-flex items-center gap-1 bg-white/90 backdrop-blur-sm text-slate-700 px-2.5 py-1 rounded-full text-xs font-medium shadow-sm">
                      <Icon size={12} />
                      {TYPE_LABELS[item.type]}
                    </span>
                    {/* Audience badge */}
                    {!isClient && (
                      <span
                        className={`absolute top-3 right-3 px-2 py-0.5 rounded-full text-xs font-medium shadow-sm ${
                          item.audience === "STAFF"
                            ? "bg-blue-100/90 text-blue-700"
                            : "bg-green-100/90 text-green-700"
                        }`}
                      >
                        {AUDIENCE_LABELS[item.audience]}
                      </span>
                    )}
                  </div>

                  {/* Card body */}
                  <div className="p-4">
                    <h3 className="font-semibold text-slate-900 mb-1.5 line-clamp-2 group-hover:text-[#6567F1] transition-colors">
                      {item.title}
                    </h3>
                    {item.description && (
                      <p className="text-sm text-slate-500 mb-3 line-clamp-2">{item.description}</p>
                    )}

                    {/* Tags */}
                    {item.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {item.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs"
                          >
                            {tag}
                          </span>
                        ))}
                        {item.tags.length > 3 && (
                          <span className="text-slate-400 text-xs">+{item.tags.length - 3}</span>
                        )}
                      </div>
                    )}

                    {/* Footer: author + date + actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <div className="text-xs text-slate-400">
                        {new Date(item.createdAt).toLocaleDateString("ru-RU")}
                      </div>
                      {(canEdit || canDelete) && (
                        <div className="flex items-center gap-1">
                          {canEdit && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingItem(item);
                                setShowModal(true);
                              }}
                              className="p-1.5 text-slate-400 hover:text-[#6567F1] hover:bg-[#6567F1]/5 rounded-lg transition-colors"
                              title="Редактировать"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={(e) => handleDelete(e, item)}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Удалить"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {total > items.length && (
            <div className="mt-4 text-center text-xs text-slate-400">
              Показано {items.length} из {total}
            </div>
          )}
        </>
      )}

      {/* Create / Edit modal */}
      {showModal && (
        <KnowledgeModal
          item={editingItem}
          onClose={() => {
            setShowModal(false);
            setEditingItem(null);
          }}
          onSaved={handleSaved}
        />
      )}

      {/* Side drawer */}
      {drawerItem && (
        <KnowledgeDrawer
          item={drawerItem}
          onClose={() => setDrawerItem(null)}
          onDownload={handleDownload}
        />
      )}
    </div>
  );
}

/* ==================== Modal ==================== */

function KnowledgeModal({ item, onClose, onSaved }) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    title: item?.title || "",
    type: item?.type || "ARTICLE",
    audience: item?.audience || "STAFF",
    tags: item?.tags || [],
    description: item?.description || "",
    content: item?.content || "",
    url: item?.url || "",
  });
  const [file, setFile] = useState(null);
  const [coverImage, setCoverImage] = useState(null);
  const [coverPreview, setCoverPreview] = useState(
    item?.coverImagePath ? `/uploads/${item.coverImagePath}` : null,
  );
  const [tagInput, setTagInput] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function addTag(tag) {
    const t = tag.trim();
    if (t && !form.tags.includes(t)) {
      setField("tags", [...form.tags, t]);
    }
    setTagInput("");
  }

  function removeTag(tag) {
    setField(
      "tags",
      form.tags.filter((t) => t !== tag),
    );
  }

  function handleTagKeyDown(e) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    }
  }

  function handleCoverChange(e) {
    const f = e.target.files?.[0];
    if (f) {
      setCoverImage(f);
      setCoverPreview(URL.createObjectURL(f));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.title.trim()) {
      setError("Название обязательно");
      return;
    }

    setSubmitting(true);
    try {
      // Always use FormData since we may have files
      const fd = new FormData();
      fd.append("title", form.title.trim());
      fd.append("type", form.type);
      fd.append("audience", form.audience);
      form.tags.forEach((t) => fd.append("tags", t));
      if (form.description.trim()) fd.append("description", form.description.trim());
      if (form.type === "ARTICLE" && form.content) fd.append("content", form.content);
      if (form.type === "VIDEO" && form.url.trim()) fd.append("url", form.url.trim());
      if (file) fd.append("file", file);
      if (coverImage) fd.append("coverImage", coverImage);

      const url = isEdit ? `/api/knowledge/${item.id}` : "/api/knowledge";
      const method = isEdit ? "PUT" : "POST";
      const res = await api(url, { method, body: fd, headers: {} });

      if (res.ok) {
        onSaved();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Ошибка сохранения");
      }
    } catch {
      setError("Сетевая ошибка");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900">
            {isEdit ? "Редактировать" : "Новый материал"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Название *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
            />
          </div>

          {/* Type + Audience */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Тип *</label>
              <select
                value={form.type}
                onChange={(e) => setField("type", e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] bg-white"
              >
                <option value="ARTICLE">Статья</option>
                <option value="VIDEO">Видео</option>
                <option value="FILE">Файл</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Аудитория *</label>
              <select
                value={form.audience}
                onChange={(e) => setField("audience", e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] bg-white"
              >
                <option value="STAFF">Сотрудники</option>
                <option value="CLIENT">Клиенты</option>
              </select>
            </div>
          </div>

          {/* Cover image */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Обложка</label>
            {coverPreview && (
              <div className="relative mb-2 rounded-lg overflow-hidden h-32">
                <img src={coverPreview} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setCoverImage(null);
                    setCoverPreview(null);
                  }}
                  className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/70"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {!coverPreview && (
              <label className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-[#6567F1]/30 hover:bg-[#6567F1]/5 transition-colors">
                <ImagePlus size={18} className="text-slate-400" />
                <span className="text-sm text-slate-500">Загрузить обложку</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCoverChange}
                />
              </label>
            )}
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Теги</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {PRESET_TAGS.filter((t) => !form.tags.includes(t)).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => addTag(t)}
                  className="px-2.5 py-1 rounded-full text-xs font-medium border border-slate-200 text-slate-500 hover:border-[#6567F1] hover:text-[#6567F1] transition-colors"
                >
                  + {t}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 bg-[#6567F1]/10 text-[#6567F1] px-2.5 py-1 rounded-full text-xs font-medium"
                >
                  {t}
                  <button type="button" onClick={() => removeTag(t)} className="hover:text-red-500">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              placeholder="Свой тег (Enter для добавления)"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
            />
          </div>

          {/* Description (short, for all types) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Краткое описание
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              rows={2}
              placeholder="Отображается на карточке..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] resize-none"
            />
          </div>

          {/* Rich text editor for ARTICLE */}
          {form.type === "ARTICLE" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Текст статьи</label>
              <Suspense
                fallback={
                  <div className="h-52 border border-slate-200 rounded-lg flex items-center justify-center text-slate-400">
                    <Loader2 size={20} className="animate-spin" />
                  </div>
                }
              >
                <RichTextEditor
                  content={form.content}
                  onChange={(html) => setField("content", html)}
                />
              </Suspense>
            </div>
          )}

          {/* URL for VIDEO */}
          {form.type === "VIDEO" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Ссылка на видео *
              </label>
              <input
                type="url"
                value={form.url}
                onChange={(e) => setField("url", e.target.value)}
                placeholder="https://youtube.com/..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
              />
            </div>
          )}

          {/* File upload for FILE */}
          {form.type === "FILE" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Файл {!isEdit && "*"}
              </label>
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#6567F1]/10 file:text-[#6567F1] hover:file:bg-[#6567F1]/20"
              />
              {isEdit && item?.originalName && !file && (
                <p className="mt-1 text-xs text-slate-400">Текущий файл: {item.originalName}</p>
              )}
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white shadow-lg shadow-[#6567F1]/30 transition-all disabled:opacity-50"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? "Сохранить" : "Создать"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ==================== Side Drawer ==================== */

function KnowledgeDrawer({ item, onClose, onDownload }) {
  const Icon = TYPE_ICONS[item.type] || FileText;

  // Try to embed YouTube / Rutube videos
  function getEmbedUrl(url) {
    if (!url) return null;
    // YouTube
    const ytMatch = url.match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    );
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    // Rutube
    const rtMatch = url.match(/rutube\.ru\/video\/([a-f0-9]+)/);
    if (rtMatch) return `https://rutube.ru/play/embed/${rtMatch[1]}`;
    return null;
  }

  const embedUrl = item.type === "VIDEO" ? getEmbedUrl(item.url) : null;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      {/* Drawer */}
      <aside className="fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-white shadow-2xl border-l border-slate-200 overflow-y-auto animate-slide-in">
        {/* Cover image at top */}
        {item.coverImagePath && (
          <div className="h-48 overflow-hidden">
            <img
              src={`/uploads/${item.coverImagePath}`}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon size={18} className="text-[#6567F1]" />
            <span className="text-xs font-medium text-[#6567F1] uppercase">
              {TYPE_LABELS[item.type]}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                item.audience === "STAFF"
                  ? "bg-blue-50 text-blue-600"
                  : "bg-green-50 text-green-600"
              }`}
            >
              {AUDIENCE_LABELS[item.audience]}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <h2 className="text-xl font-bold text-slate-900">{item.title}</h2>

          {/* Tags */}
          {item.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
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

          {/* VIDEO embed */}
          {item.type === "VIDEO" && embedUrl && (
            <div className="aspect-video rounded-lg overflow-hidden bg-slate-100">
              <iframe src={embedUrl} className="w-full h-full" allowFullScreen title={item.title} />
            </div>
          )}

          {/* VIDEO link (if no embed) */}
          {item.type === "VIDEO" && item.url && !embedUrl && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-[#6567F1] hover:text-[#5557E1] text-sm font-medium"
            >
              <ExternalLink size={16} />
              Открыть видео
            </a>
          )}

          {/* VIDEO link (always show as fallback) */}
          {item.type === "VIDEO" && item.url && embedUrl && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-slate-500 hover:text-[#6567F1] text-xs"
            >
              <ExternalLink size={14} />
              Открыть в новой вкладке
            </a>
          )}

          {/* FILE download */}
          {item.type === "FILE" && item.originalName && (
            <button
              onClick={() => onDownload(item)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border-2 border-[#6567F1]/20 text-[#6567F1] hover:bg-[#6567F1]/5 transition-colors"
            >
              <Download size={16} />
              Скачать: {item.originalName}
            </button>
          )}

          {/* Description */}
          {item.description && <p className="text-sm text-slate-600">{item.description}</p>}

          {/* ARTICLE rich content */}
          {item.type === "ARTICLE" && item.content && (
            <div
              className="tiptap-content text-slate-700"
              dangerouslySetInnerHTML={{ __html: item.content }}
            />
          )}

          {/* Meta */}
          <div className="pt-4 border-t border-slate-100 text-xs text-slate-400 space-y-1">
            <p>
              Автор:{" "}
              {item.createdBy ? `${item.createdBy.firstName} ${item.createdBy.lastName}` : "—"}
            </p>
            <p>Создано: {new Date(item.createdAt).toLocaleString("ru-RU")}</p>
          </div>
        </div>
      </aside>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in {
          animation: slideIn 0.2s ease-out;
        }
      `}</style>
    </>
  );
}
