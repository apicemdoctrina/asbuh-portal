import { useState, useEffect } from "react";
import { Link } from "react-router";
import {
  Loader2,
  FileUp,
  Building2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Paperclip,
  X,
} from "lucide-react";
import { api } from "../lib/api.js";

export default function MyDocumentsPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploadingId, setUploadingId] = useState(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await api(
        "/api/tickets?type=DOCUMENT_REQUEST&status=NEW,WAITING_CLIENT&limit=50",
      );
      if (!res.ok) throw new Error("Не удалось загрузить запросы");
      const data = await res.json();
      setTickets(data.tickets || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 rounded-lg p-4 flex items-center justify-between">
        <span>{error}</span>
        <button onClick={load} className="text-sm font-semibold underline">
          Попробовать снова
        </button>
      </div>
    );
  }

  // Group by organization
  const byOrg = tickets.reduce((acc, t) => {
    const key = t.organization?.id || "_";
    if (!acc[key]) {
      acc[key] = { name: t.organization?.name || "Без организации", items: [] };
    }
    acc[key].items.push(t);
    return acc;
  }, {});
  const orgGroups = Object.values(byOrg);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Запросы документов</h1>
        <p className="text-sm text-slate-500 mt-1">
          Что от вас ждут — список открытых запросов от ваших бухгалтеров.
        </p>
      </div>

      {tickets.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          {orgGroups.map((g, i) => (
            <div key={i}>
              {orgGroups.length > 1 && (
                <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <Building2 size={16} className="text-slate-400" />
                  {g.name}
                </h2>
              )}
              <div className="space-y-3">
                {g.items.map((t) => (
                  <DocumentRequestCard
                    key={t.id}
                    ticket={t}
                    isUploading={uploadingId === t.id}
                    setUploading={(v) => setUploadingId(v ? t.id : null)}
                    onUploaded={load}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-10 text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 size={32} />
      </div>
      <h2 className="text-lg font-semibold text-slate-900">Все документы загружены</h2>
      <p className="mt-2 text-sm text-slate-500">
        Открытых запросов нет. Если бухгалтер запросит новый документ — он появится здесь.
      </p>
    </div>
  );
}

function DocumentRequestCard({ ticket, isUploading, setUploading, onUploaded }) {
  const [showForm, setShowForm] = useState(false);
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState([]);
  const [submitError, setSubmitError] = useState("");

  const ageDays = Math.floor(
    (Date.now() - new Date(ticket.createdAt).getTime()) / (24 * 60 * 60 * 1000),
  );

  function reset() {
    setShowForm(false);
    setComment("");
    setFiles([]);
    setSubmitError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (files.length === 0) {
      setSubmitError("Прикрепите хотя бы один файл");
      return;
    }
    setUploading(true);
    setSubmitError("");
    try {
      const fd = new FormData();
      fd.append("body", comment.trim() || "Загружаю запрошенные документы");
      for (const f of files) fd.append("files", f);
      const res = await api(`/api/tickets/${ticket.id}/messages`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Не удалось загрузить файл");
      }
      reset();
      await onUploaded();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <StatusBadge status={ticket.status} />
              {ageDays >= 3 && (
                <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                  <Clock size={10} /> {ageDays} дн. назад
                </span>
              )}
            </div>
            <h3 className="text-base font-semibold text-slate-900">{ticket.subject}</h3>
            {ticket.assignedTo && (
              <p className="text-xs text-slate-500 mt-1">
                Запросил: {ticket.assignedTo.firstName} {ticket.assignedTo.lastName}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            {!showForm && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white text-sm font-semibold shadow-lg shadow-[#6567F1]/30 transition-all"
              >
                <FileUp size={14} />
                Загрузить
              </button>
            )}
            <Link
              to={`/tickets/${ticket.id}`}
              className="text-xs font-medium text-[#6567F1] hover:text-[#5557E1] text-center"
            >
              Открыть тикет
            </Link>
          </div>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="border-t border-slate-200 bg-slate-50/50 p-5 space-y-3"
        >
          <FilePicker files={files} onChange={setFiles} disabled={isUploading} />
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Комментарий (необязательно)"
            rows={2}
            disabled={isUploading}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-[#6567F1] focus:ring-2 focus:ring-[#6567F1]/20 outline-none resize-none disabled:opacity-60"
          />
          {submitError && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertCircle size={12} /> {submitError}
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={reset}
              disabled={isUploading}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isUploading || files.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] disabled:from-slate-300 disabled:to-slate-300 text-white text-sm font-semibold transition-all"
            >
              {isUploading ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
              Отправить
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function FilePicker({ files, onChange, disabled }) {
  const MAX = 5;
  function handleChange(e) {
    const picked = Array.from(e.target.files || []);
    onChange([...files, ...picked].slice(0, MAX));
    e.target.value = "";
  }
  function removeAt(i) {
    onChange(files.filter((_, idx) => idx !== i));
  }
  return (
    <div>
      <label
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed border-slate-300 hover:border-[#6567F1] cursor-pointer text-sm text-slate-600 transition-colors ${
          disabled ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        <Paperclip size={14} />
        <span>Выбрать файлы (до {MAX}, до 10 МБ каждый)</span>
        <input
          type="file"
          multiple
          onChange={handleChange}
          className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip"
          disabled={disabled || files.length >= MAX}
        />
      </label>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((f, i) => (
            <li
              key={i}
              className="flex items-center justify-between text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5"
            >
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="shrink-0 ml-2 text-slate-400 hover:text-slate-600"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    NEW: { label: "Новый запрос", cls: "bg-blue-50 text-blue-700" },
    WAITING_CLIENT: { label: "Ждём от вас", cls: "bg-amber-50 text-amber-700" },
  };
  const s = map[status] || { label: status, cls: "bg-slate-100 text-slate-600" };
  return (
    <span
      className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${s.cls}`}
    >
      {s.label}
    </span>
  );
}
