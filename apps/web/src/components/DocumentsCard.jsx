import { useState } from "react";
import { api, getAccessToken } from "../lib/api.js";
import { Plus, Download, Trash2, X, FileText, Upload, History, ChevronUp } from "lucide-react";

const DOCUMENT_TYPES = [
  { value: "CONTRACT", label: "Договор", bg: "bg-blue-100", text: "text-blue-700" },
  { value: "ACT", label: "Акт", bg: "bg-green-100", text: "text-green-700" },
  { value: "INVOICE", label: "Счёт", bg: "bg-amber-100", text: "text-amber-700" },
  { value: "REPORT", label: "Отчёт", bg: "bg-purple-100", text: "text-purple-700" },
  { value: "WAYBILL", label: "Накладная", bg: "bg-orange-100", text: "text-orange-700" },
  { value: "OTHER", label: "Прочее", bg: "bg-slate-100", text: "text-slate-600" },
];

const TYPE_MAP = Object.fromEntries(DOCUMENT_TYPES.map((t) => [t.value, t]));

function typeBadge(type) {
  const t = TYPE_MAP[type] || TYPE_MAP.OTHER;
  return `${t.bg} ${t.text}`;
}

function typeLabel(type) {
  return (TYPE_MAP[type] || TYPE_MAP.OTHER).label;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(val) {
  if (!val) return "";
  return new Date(val).toLocaleDateString("ru-RU");
}

const MONTH_NAMES = [
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

const PERIOD_YEARS = Array.from({ length: 11 }, (_, i) => 2020 + i);

const ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png,text/plain,text/csv";

export default function DocumentsCard({
  organizationId,
  documents,
  canCreate,
  canDelete,
  onDataChanged,
}) {
  const [showModal, setShowModal] = useState(false);
  const [docType, setDocType] = useState("CONTRACT");
  const [file, setFile] = useState(null);
  const [comment, setComment] = useState("");
  const [docDate, setDocDate] = useState("");
  const [periodMonth, setPeriodMonth] = useState("");
  const [periodYear, setPeriodYear] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Filter state
  const [filterType, setFilterType] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterPeriodMonth, setFilterPeriodMonth] = useState("");
  const [filterPeriodYear, setFilterPeriodYear] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // New version upload state
  const [versionTargetDoc, setVersionTargetDoc] = useState(null);
  const [versionFile, setVersionFile] = useState(null);
  const [versionDocDate, setVersionDocDate] = useState("");
  const [versionPeriodMonth, setVersionPeriodMonth] = useState("");
  const [versionPeriodYear, setVersionPeriodYear] = useState("");
  const [versionSubmitting, setVersionSubmitting] = useState(false);
  const [versionError, setVersionError] = useState("");

  // History state: docId -> versions array | null (loading) | false (collapsed)
  const [historyMap, setHistoryMap] = useState({});

  function openUpload() {
    setDocType("CONTRACT");
    setFile(null);
    setComment("");
    setDocDate("");
    setPeriodMonth("");
    setPeriodYear("");
    setFormError("");
    setShowModal(true);
  }

  async function handleUpload() {
    if (!file) {
      setFormError("Выберите файл");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", docType);
      if (comment.trim()) formData.append("comment", comment.trim());
      if (docDate) formData.append("documentDate", docDate);
      if (periodMonth && periodYear) {
        formData.append("periodMonth", periodMonth);
        formData.append("periodYear", periodYear);
      }

      const res = await api(`/api/organizations/${organizationId}/documents`, {
        method: "POST",
        body: formData,
        headers: {},
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка загрузки");
      }
      setShowModal(false);
      onDataChanged();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function openVersionUpload(doc) {
    setVersionTargetDoc(doc);
    setVersionFile(null);
    setVersionDocDate("");
    setVersionPeriodMonth("");
    setVersionPeriodYear("");
    setVersionError("");
  }

  async function handleVersionUpload() {
    if (!versionFile) {
      setVersionError("Выберите файл");
      return;
    }
    setVersionSubmitting(true);
    setVersionError("");
    try {
      const formData = new FormData();
      formData.append("file", versionFile);
      if (versionDocDate) formData.append("documentDate", versionDocDate);
      if (versionPeriodMonth && versionPeriodYear) {
        formData.append("periodMonth", versionPeriodMonth);
        formData.append("periodYear", versionPeriodYear);
      }

      const res = await api(
        `/api/organizations/${organizationId}/documents/${versionTargetDoc.id}/versions`,
        { method: "POST", body: formData, headers: {} },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка загрузки");
      }
      setVersionTargetDoc(null);
      onDataChanged();
    } catch (err) {
      setVersionError(err.message);
    } finally {
      setVersionSubmitting(false);
    }
  }

  async function toggleHistory(doc) {
    const current = historyMap[doc.id];
    if (current !== undefined && current !== null) {
      // collapse
      setHistoryMap((m) => ({ ...m, [doc.id]: undefined }));
      return;
    }
    setHistoryMap((m) => ({ ...m, [doc.id]: null })); // loading
    try {
      const res = await api(`/api/organizations/${organizationId}/documents/${doc.id}/versions`);
      const data = await res.json();
      setHistoryMap((m) => ({ ...m, [doc.id]: data }));
    } catch {
      setHistoryMap((m) => ({ ...m, [doc.id]: undefined }));
    }
  }

  async function handleDelete(docId) {
    if (!confirm("Удалить документ?")) return;
    try {
      const res = await api(`/api/organizations/${organizationId}/documents/${docId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка удаления");
      }
      onDataChanged();
    } catch (err) {
      alert(err.message);
    }
  }

  function handleDownload(docId, originalName) {
    const token = getAccessToken();
    const url = `/api/organizations/${organizationId}/documents/${docId}/download`;
    fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) throw new Error("Download failed");
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = originalName;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => alert("Ошибка скачивания"));
  }

  const hasActiveFilters = !!(
    filterType ||
    filterSearch ||
    filterPeriodMonth ||
    filterPeriodYear ||
    filterDateFrom ||
    filterDateTo
  );

  const filteredDocuments = documents.filter((doc) => {
    if (filterType && doc.type !== filterType) return false;
    if (filterSearch && !doc.originalName.toLowerCase().includes(filterSearch.toLowerCase()))
      return false;
    if (filterPeriodMonth && String(doc.periodMonth) !== filterPeriodMonth) return false;
    if (filterPeriodYear && String(doc.periodYear) !== filterPeriodYear) return false;
    if (filterDateFrom && doc.documentDate && new Date(doc.documentDate) < new Date(filterDateFrom))
      return false;
    if (filterDateTo && doc.documentDate && new Date(doc.documentDate) > new Date(filterDateTo))
      return false;
    return true;
  });

  function resetFilters() {
    setFilterType("");
    setFilterSearch("");
    setFilterPeriodMonth("");
    setFilterPeriodYear("");
    setFilterDateFrom("");
    setFilterDateTo("");
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-900">Документы</h2>
        {canCreate && (
          <button
            onClick={openUpload}
            className="inline-flex items-center gap-1 text-sm text-[#6567F1] hover:text-[#5557E1] font-medium"
          >
            <Plus size={16} /> Загрузить
          </button>
        )}
      </div>

      {documents.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Поиск по имени..."
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
            />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
            >
              <option value="">Все типы</option>
              {DOCUMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <select
              value={filterPeriodMonth}
              onChange={(e) => setFilterPeriodMonth(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
            >
              <option value="">Месяц</option>
              {MONTH_NAMES.map((m, i) => (
                <option key={i + 1} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={filterPeriodYear}
              onChange={(e) => setFilterPeriodYear(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
            >
              <option value="">Год</option>
              {PERIOD_YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              title="Дата документа от"
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
            />
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              title="Дата документа до"
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
            />
          </div>
          {hasActiveFilters && (
            <div>
              <button
                onClick={resetFilters}
                className="text-sm text-[#6567F1] hover:text-[#5557E1] font-medium"
              >
                Сбросить фильтры
              </button>
            </div>
          )}
        </div>
      )}

      {documents.length === 0 ? (
        <p className="text-sm text-slate-400">Нет документов</p>
      ) : filteredDocuments.length === 0 ? (
        <div className="text-sm text-slate-400 space-y-2">
          <p>Документы не найдены</p>
          <button
            onClick={resetFilters}
            className="text-[#6567F1] hover:text-[#5557E1] font-medium"
          >
            Сбросить фильтры
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredDocuments.map((doc) => (
            <div key={doc.id}>
              <div className="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                <div className="text-sm text-slate-600 space-y-0.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${typeBadge(doc.type)}`}
                    >
                      {typeLabel(doc.type)}
                    </span>
                    {doc.version > 1 && (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-[#6567F1]/10 text-[#6567F1]">
                        v{doc.version}
                      </span>
                    )}
                    <span className="font-medium text-slate-900 truncate">{doc.originalName}</span>
                    <span className="text-slate-400 text-xs">{formatSize(doc.size)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    {doc.uploadedBy && (
                      <span>
                        {doc.uploadedBy.lastName} {doc.uploadedBy.firstName}
                      </span>
                    )}
                    <span>{formatDate(doc.createdAt)}</span>
                    {doc.documentDate && <span>• {formatDate(doc.documentDate)}</span>}
                    {doc.periodMonth && doc.periodYear && (
                      <span>
                        • {MONTH_NAMES[doc.periodMonth - 1]} {doc.periodYear}
                      </span>
                    )}
                  </div>
                  {doc.comment && <p className="text-slate-400 text-xs">{doc.comment}</p>}
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  {doc.version > 1 && (
                    <button
                      onClick={() => toggleHistory(doc)}
                      className="text-slate-400 hover:text-[#6567F1] transition-colors"
                      title="История версий"
                    >
                      {historyMap[doc.id] !== undefined ? (
                        <ChevronUp size={16} />
                      ) : (
                        <History size={16} />
                      )}
                    </button>
                  )}
                  {canCreate && (
                    <button
                      onClick={() => openVersionUpload(doc)}
                      className="text-slate-400 hover:text-[#6567F1] transition-colors"
                      title="Загрузить новую версию"
                    >
                      <Upload size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => handleDownload(doc.id, doc.originalName)}
                    className="text-slate-400 hover:text-[#6567F1] transition-colors"
                    title="Скачать"
                  >
                    <Download size={16} />
                  </button>
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                      title="Удалить"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* History panel */}
              {historyMap[doc.id] !== undefined && (
                <div className="mt-1 ml-3 border-l-2 border-[#6567F1]/20 pl-3 space-y-1">
                  {historyMap[doc.id] === null ? (
                    <p className="text-xs text-slate-400 py-1">Загрузка...</p>
                  ) : (
                    historyMap[doc.id].map((v) => (
                      <div
                        key={v.id}
                        className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1 text-slate-600">
                          <span className="font-medium text-[#6567F1] shrink-0">v{v.version}</span>
                          <span className="truncate text-slate-800">{v.originalName}</span>
                          <span className="text-slate-400 shrink-0">{formatSize(v.size)}</span>
                          <span className="text-slate-400 shrink-0">{formatDate(v.createdAt)}</span>
                          {v.documentDate && (
                            <span className="text-slate-400 shrink-0">
                              • {formatDate(v.documentDate)}
                            </span>
                          )}
                          {v.periodMonth && v.periodYear && (
                            <span className="text-slate-400 shrink-0">
                              • {MONTH_NAMES[v.periodMonth - 1]} {v.periodYear}
                            </span>
                          )}
                          {v.uploadedBy && (
                            <span className="text-slate-400 shrink-0">
                              {v.uploadedBy.lastName} {v.uploadedBy.firstName}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleDownload(v.id, v.originalName)}
                          className="ml-2 text-slate-400 hover:text-[#6567F1] transition-colors shrink-0"
                          title="Скачать"
                        >
                          <Download size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload new document modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Загрузить документ</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Тип документа *
                </label>
                <div className="flex flex-wrap gap-2">
                  {DOCUMENT_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setDocType(t.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all ${
                        docType === t.value
                          ? `${t.bg} ${t.text} border-current ring-2 ring-current/20`
                          : `${t.bg} ${t.text} border-transparent opacity-60 hover:opacity-100`
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Файл *</label>
                <label className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm cursor-pointer hover:bg-slate-50 transition-colors">
                  <FileText size={16} className="text-slate-400 shrink-0" />
                  <span className={`truncate ${file ? "text-slate-900" : "text-slate-400"}`}>
                    {file ? file.name : "Выберите файл..."}
                  </span>
                  <input
                    type="file"
                    accept={ACCEPT}
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-slate-400 mt-1">
                  PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, TXT, CSV. Макс. 10 МБ.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Комментарий</label>
                <input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Дата документа
                </label>
                <input
                  type="date"
                  value={docDate}
                  onChange={(e) => setDocDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Отчётный период
                </label>
                <div className="flex gap-2">
                  <select
                    value={periodMonth}
                    onChange={(e) => setPeriodMonth(e.target.value)}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                  >
                    <option value="">Месяц</option>
                    {MONTH_NAMES.map((m, i) => (
                      <option key={i + 1} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select
                    value={periodYear}
                    onChange={(e) => setPeriodYear(e.target.value)}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                  >
                    <option value="">Год</option>
                    {PERIOD_YEARS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {formError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{formError}</div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border-2 border-[#6567F1]/20 text-[#6567F1] hover:bg-[#6567F1]/5 rounded-lg text-sm font-medium transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={submitting}
                  className="px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50"
                >
                  {submitting ? "Загрузка..." : "Загрузить"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload new version modal */}
      {versionTargetDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Новая версия</h2>
                <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">
                  {versionTargetDoc.originalName}
                </p>
              </div>
              <button
                onClick={() => setVersionTargetDoc(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Файл *</label>
                <label className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm cursor-pointer hover:bg-slate-50 transition-colors">
                  <FileText size={16} className="text-slate-400 shrink-0" />
                  <span className={`truncate ${versionFile ? "text-slate-900" : "text-slate-400"}`}>
                    {versionFile ? versionFile.name : "Выберите файл..."}
                  </span>
                  <input
                    type="file"
                    accept={ACCEPT}
                    onChange={(e) => setVersionFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-slate-400 mt-1">
                  PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, TXT, CSV. Макс. 10 МБ.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Дата документа
                </label>
                <input
                  type="date"
                  value={versionDocDate}
                  onChange={(e) => setVersionDocDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Отчётный период
                </label>
                <div className="flex gap-2">
                  <select
                    value={versionPeriodMonth}
                    onChange={(e) => setVersionPeriodMonth(e.target.value)}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                  >
                    <option value="">Месяц</option>
                    {MONTH_NAMES.map((m, i) => (
                      <option key={i + 1} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select
                    value={versionPeriodYear}
                    onChange={(e) => setVersionPeriodYear(e.target.value)}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                  >
                    <option value="">Год</option>
                    {PERIOD_YEARS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {versionError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{versionError}</div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setVersionTargetDoc(null)}
                  className="px-4 py-2 border-2 border-[#6567F1]/20 text-[#6567F1] hover:bg-[#6567F1]/5 rounded-lg text-sm font-medium transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleVersionUpload}
                  disabled={versionSubmitting}
                  className="px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50"
                >
                  {versionSubmitting ? "Загрузка..." : "Загрузить версию"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
