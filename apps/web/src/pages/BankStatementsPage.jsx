import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  Upload,
  FileText,
  FileDown,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
} from "lucide-react";
import { api } from "../lib/api";

function money(n) {
  return Number(n).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BankStatementsPage() {
  const [orgs, setOrgs] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState(null); // { file, data }
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [saving, setSaving] = useState(false);

  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function loadList() {
    setLoading(true);
    const res = await api("/api/statements");
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }

  async function loadOrgs() {
    const res = await api("/api/organizations?limit=1000&sortBy=name&sortOrder=asc");
    if (res.ok) {
      const data = await res.json();
      setOrgs((data.organizations || []).map((o) => ({ id: o.id, name: o.name })));
    }
  }

  useEffect(() => {
    loadList();
    loadOrgs();
  }, []);

  // Шаг 1 — распознать файл и предложить организацию (без сохранения)
  async function onSelectFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setResult(null);
    setPreview(null);
    setPreviewing(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await api("/api/statements/preview", { method: "POST", body: fd });
    if (res.ok) {
      const data = await res.json();
      setPreview({ file, data });
      setSelectedOrgId(data.suggestedOrg?.id || "");
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Не удалось распознать файл");
    }
    setPreviewing(false);
  }

  // Шаг 2 — сохранить с выбранной организацией
  async function onSave() {
    if (!preview || !selectedOrgId) return;
    setSaving(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", preview.file);
    fd.append("organizationId", selectedOrgId);
    const res = await api("/api/statements", { method: "POST", body: fd });
    if (res.ok) {
      setResult(await res.json());
      setPreview(null);
      setSelectedOrgId("");
      await loadList();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Ошибка сохранения");
    }
    setSaving(false);
  }

  function cancelPreview() {
    setPreview(null);
    setSelectedOrgId("");
    setError(null);
  }

  async function reassign(id, organizationId) {
    const res = await api(`/api/statements/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ organizationId }),
    });
    if (res.ok) loadList();
  }

  async function download(id, format) {
    const res = await api(`/api/statements/${id}/download?format=${format}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = format === "pdf" ? "statement.pdf" : "kl_to_1c.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function remove(id) {
    const res = await api(`/api/statements/${id}`, { method: "DELETE" });
    if (res.ok) loadList();
  }

  const selectClass =
    "rounded-lg border border-line bg-surface text-body text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-heading mb-6">Выписки → 1С</h1>

      {/* Дропзона — скрыта, пока идёт подтверждение привязки */}
      {!preview && (
        <label className="block bg-surface rounded-2xl shadow-lg border border-dashed border-line p-8 text-center cursor-pointer hover:border-primary transition-colors mb-6">
          <input
            type="file"
            accept=".txt"
            className="hidden"
            onChange={onSelectFile}
            disabled={previewing}
          />
          {previewing ? (
            <Loader2 size={32} className="animate-spin mx-auto text-primary" />
          ) : (
            <Upload size={32} className="mx-auto text-primary" />
          )}
          <p className="mt-3 text-body">Загрузить файл выписки (.txt, формат 1С)</p>
        </label>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30 text-sm">
          {error}
        </div>
      )}

      {/* Шаг подтверждения: привязка к организации обязательна */}
      {preview && (
        <div className="mb-6 bg-surface rounded-2xl shadow-lg border border-line p-6">
          <div className="flex items-start justify-between">
            <div
              className={`flex items-center gap-2 font-semibold ${
                preview.data.reconcile.status === "OK"
                  ? "text-emerald-600 dark:text-emerald-300"
                  : "text-red-600 dark:text-red-300"
              }`}
            >
              {preview.data.reconcile.status === "OK" ? (
                <>
                  <CheckCircle2 size={20} /> Остатки сошлись
                </>
              ) : (
                <>
                  <AlertTriangle size={20} /> Расхождение {money(preview.data.reconcile.totalDiff)}{" "}
                  ₽
                </>
              )}
            </div>
            <button
              onClick={cancelPreview}
              className="p-1.5 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors"
              title="Отмена"
            >
              <X size={18} />
            </button>
          </div>

          <p className="text-sm text-subtle mt-1">
            {preview.data.bankName || "Банк не указан"} · {preview.data.periodStart} —{" "}
            {preview.data.periodEnd} · операций: {preview.data.docCount}
          </p>
          <p className="text-xs text-subtle mt-1">
            Счёт(а): {preview.data.accountNumbers.join(", ") || "—"}
          </p>

          <div className="mt-4">
            <label className="block text-sm font-medium text-body mb-1">
              Организация <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              className={`${selectClass} w-full max-w-md`}
            >
              <option value="">— выберите организацию —</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-subtle mt-1">
              {preview.data.suggestedOrg
                ? "Определена автоматически по номеру счёта — проверьте и при необходимости измените."
                : "Счёт не найден ни в одной организации — выберите вручную."}
            </p>
          </div>

          <div className="flex gap-3 mt-5">
            <button
              onClick={onSave}
              disabled={!selectedOrgId || saving}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white shadow-lg shadow-[#6567F1]/30 flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Сохранить и привязать
            </button>
            <button
              onClick={cancelPreview}
              className="px-4 py-2 rounded-lg border-2 border-line text-body hover:bg-muted transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Результат сохранения */}
      {result && (
        <div className="mb-6 bg-surface rounded-2xl shadow-lg border border-line p-6">
          <div className="flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-300">
            <CheckCircle2 size={20} /> Сохранено
          </div>
          <p className="text-sm text-subtle mt-1">
            {result.statement.organization?.name} · {result.statement.bankName || "банк не указан"}{" "}
            · операций: {result.statement.docCount}
          </p>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => download(result.statement.id, "txt")}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white shadow-lg shadow-[#6567F1]/30 flex items-center gap-2"
            >
              <FileDown size={16} /> Скачать .txt для 1С
            </button>
            <button
              onClick={() => download(result.statement.id, "pdf")}
              className="px-4 py-2 rounded-lg border-2 border-primary/20 text-primary hover:bg-primary/5 flex items-center gap-2"
            >
              <FileText size={16} /> Скачать .pdf
            </button>
          </div>
        </div>
      )}

      <div className="bg-surface rounded-2xl shadow-lg border border-line overflow-hidden">
        <div className="px-6 py-4 border-b border-line font-semibold text-body">История</div>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-subtle">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-subtle">Пока нет загруженных выписок</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted text-subtle text-left">
              <tr>
                <th className="px-6 py-3 font-medium">Дата</th>
                <th className="px-6 py-3 font-medium">Организация</th>
                <th className="px-6 py-3 font-medium">Банк</th>
                <th className="px-6 py-3 font-medium">Период</th>
                <th className="px-6 py-3 font-medium">Сверка</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-line text-body">
                  <td className="px-6 py-3">
                    {new Date(it.createdAt).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="px-6 py-3">
                    <select
                      value={it.organizationId || ""}
                      onChange={(e) => reassign(it.id, e.target.value)}
                      className={`${selectClass} ${
                        it.organizationId
                          ? ""
                          : "border-red-300 dark:border-red-500/50 text-red-600 dark:text-red-300"
                      }`}
                    >
                      <option value="" disabled>
                        — не привязано —
                      </option>
                      {orgs.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-3">{it.bankName || "—"}</td>
                  <td className="px-6 py-3">
                    {new Date(it.periodStart).toLocaleDateString("ru-RU")} —{" "}
                    {new Date(it.periodEnd).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="px-6 py-3">
                    {it.reconcileStatus === "OK" ? (
                      <span className="text-emerald-600 dark:text-emerald-300 inline-flex items-center gap-1">
                        <CheckCircle2 size={14} /> ОК
                      </span>
                    ) : (
                      <span className="text-red-600 dark:text-red-300 inline-flex items-center gap-1">
                        <AlertTriangle size={14} /> {money(it.reconcileDiff)} ₽
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <Link
                        to={`/statements/${it.id}`}
                        title="Редактировать операции"
                        className="p-1.5 rounded-lg text-subtle hover:text-primary hover:bg-primary/5 transition-colors"
                      >
                        <Pencil size={16} />
                      </Link>
                      <button
                        onClick={() => download(it.id, "txt")}
                        title="Скачать .txt"
                        className="p-1.5 rounded-lg text-subtle hover:text-primary hover:bg-primary/5 transition-colors"
                      >
                        <FileDown size={16} />
                      </button>
                      <button
                        onClick={() => download(it.id, "pdf")}
                        title="Скачать .pdf"
                        className="p-1.5 rounded-lg text-subtle hover:text-primary hover:bg-primary/5 transition-colors"
                      >
                        <FileText size={16} />
                      </button>
                      <button
                        onClick={() => remove(it.id)}
                        title="Удалить"
                        className="p-1.5 rounded-lg text-subtle hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
