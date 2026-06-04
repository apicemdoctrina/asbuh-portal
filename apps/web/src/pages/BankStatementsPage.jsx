import { useEffect, useState } from "react";
import {
  Upload,
  FileText,
  FileDown,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { api } from "../lib/api";

function money(n) {
  return Number(n).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BankStatementsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    const res = await api("/api/statements");
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function onUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await api("/api/statements", { method: "POST", body: fd });
    if (res.ok) {
      setResult(await res.json());
      await load();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Ошибка загрузки");
    }
    setUploading(false);
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
    if (res.ok) load();
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Выписки → 1С</h1>

      <label className="block bg-white rounded-2xl shadow-lg border border-slate-200 border-dashed p-8 text-center cursor-pointer hover:border-[#6567F1]/50 transition-colors mb-6">
        <input
          type="file"
          accept=".txt"
          className="hidden"
          onChange={onUpload}
          disabled={uploading}
        />
        {uploading ? (
          <Loader2 size={32} className="animate-spin mx-auto text-[#6567F1]" />
        ) : (
          <Upload size={32} className="mx-auto text-[#6567F1]" />
        )}
        <p className="mt-3 text-slate-600">Загрузить файл выписки (.txt, формат 1С)</p>
      </label>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {result && (
        <div className="mb-6 bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
          <div
            className={`flex items-center gap-2 font-semibold ${
              result.reconcile.status === "OK" ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {result.reconcile.status === "OK" ? (
              <>
                <CheckCircle2 size={20} /> Остатки сошлись
              </>
            ) : (
              <>
                <AlertTriangle size={20} /> Расхождение {money(result.reconcile.totalDiff)} ₽
              </>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {result.statement.bankName || "Банк не указан"} · операций: {result.statement.docCount}
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
              className="px-4 py-2 rounded-lg border-2 border-[#6567F1]/20 text-[#6567F1] hover:bg-[#6567F1]/5 flex items-center gap-2"
            >
              <FileText size={16} /> Скачать .pdf
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 font-semibold text-slate-700">
          История
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-slate-400">Пока нет загруженных выписок</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-6 py-3">Дата</th>
                <th className="px-6 py-3">Организация</th>
                <th className="px-6 py-3">Банк</th>
                <th className="px-6 py-3">Период</th>
                <th className="px-6 py-3">Сверка</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-slate-100">
                  <td className="px-6 py-3">
                    {new Date(it.createdAt).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="px-6 py-3">{it.organization?.name || "—"}</td>
                  <td className="px-6 py-3">{it.bankName || "—"}</td>
                  <td className="px-6 py-3">
                    {new Date(it.periodStart).toLocaleDateString("ru-RU")} —{" "}
                    {new Date(it.periodEnd).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="px-6 py-3">
                    {it.reconcileStatus === "OK" ? (
                      <span className="text-emerald-600 inline-flex items-center gap-1">
                        <CheckCircle2 size={14} /> ОК
                      </span>
                    ) : (
                      <span className="text-red-600 inline-flex items-center gap-1">
                        <AlertTriangle size={14} /> {money(it.reconcileDiff)} ₽
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => download(it.id, "txt")}
                        title="Скачать .txt"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-[#6567F1] hover:bg-slate-100"
                      >
                        <FileDown size={16} />
                      </button>
                      <button
                        onClick={() => download(it.id, "pdf")}
                        title="Скачать .pdf"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-[#6567F1] hover:bg-slate-100"
                      >
                        <FileText size={16} />
                      </button>
                      <button
                        onClick={() => remove(it.id)}
                        title="Удалить"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100"
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
