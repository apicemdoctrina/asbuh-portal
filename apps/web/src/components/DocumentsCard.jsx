import { useState } from "react";
import { api, getAccessToken } from "../lib/api.js";
import { Plus, Download, Trash2, X, FileText } from "lucide-react";

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
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  function openUpload() {
    setDocType("CONTRACT");
    setFile(null);
    setComment("");
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
    // Use fetch + blob to include auth header
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

      {documents.length === 0 ? (
        <p className="text-sm text-slate-400">Нет документов</p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between bg-slate-50 rounded-lg p-3"
            >
              <div className="text-sm text-slate-600 space-y-0.5 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${typeBadge(doc.type)}`}
                  >
                    {typeLabel(doc.type)}
                  </span>
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
                </div>
                {doc.comment && <p className="text-slate-400 text-xs">{doc.comment}</p>}
              </div>
              <div className="flex items-center gap-2 ml-4 shrink-0">
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
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Загрузить документ</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600"
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
    </div>
  );
}
