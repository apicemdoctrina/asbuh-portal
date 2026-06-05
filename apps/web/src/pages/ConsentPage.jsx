import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { Loader2, Check, AlertCircle, ShieldCheck, ExternalLink } from "lucide-react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";

const DOCS = [
  { type: "terms_of_use", slug: "terms-of-use", title: "Пользовательское соглашение" },
  {
    type: "personal_data",
    slug: "personal-data",
    title: "Согласие на обработку персональных данных",
  },
];

export default function ConsentPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [statusByType, setStatusByType] = useState({});
  const [checked, setChecked] = useState({ terms_of_use: false, personal_data: false });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api("/api/consents/status");
        if (!res.ok) throw new Error("Не удалось загрузить статус согласий");
        const data = await res.json();
        if (cancelled) return;
        if (data.allAccepted) {
          navigate("/", { replace: true });
          return;
        }
        const byType = {};
        for (const r of data.required) byType[r.type] = r;
        setStatusByType(byType);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function handleSubmit() {
    setError("");
    if (!checked.terms_of_use || !checked.personal_data) {
      setError("Чтобы продолжить, отметьте оба пункта согласия");
      return;
    }
    setSubmitting(true);
    try {
      for (const doc of DOCS) {
        const meta = statusByType[doc.type];
        if (!meta) throw new Error("Не удалось определить версию документа: " + doc.type);
        if (meta.accepted) continue;
        const res = await api("/api/consents/accept", {
          method: "POST",
          body: JSON.stringify({ documentType: doc.type, documentVersion: meta.version }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Не удалось сохранить согласие");
        }
      }
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <Loader2 className="text-primary animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-[#6567F1]/5 dark:from-canvas dark:to-primary/5 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-surface rounded-2xl shadow-xl border border-line overflow-hidden">
          <div className="bg-gradient-to-r from-[#6567F1] to-[#5557E1] px-6 py-5 text-white">
            <div className="flex items-center gap-3">
              <ShieldCheck size={28} />
              <div>
                <h1 className="text-xl font-bold">Перед началом работы</h1>
                <p className="text-sm text-white/80 mt-0.5">
                  Ознакомьтесь с условиями обслуживания и подтвердите согласие
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-4">
            {DOCS.map((doc) => {
              const meta = statusByType[doc.type];
              const alreadyAccepted = meta?.accepted;
              const isChecked = checked[doc.type] || alreadyAccepted;
              return (
                <div
                  key={doc.type}
                  className={`border rounded-xl px-4 py-3 transition-colors ${
                    isChecked
                      ? "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-500/15"
                      : "border-line bg-surface"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={alreadyAccepted}
                      onChange={(e) =>
                        setChecked((prev) => ({
                          ...prev,
                          [doc.type]: e.target.checked || alreadyAccepted,
                        }))
                      }
                      className="mt-1 w-4 h-4 rounded border-line text-primary focus:ring-primary/30 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-heading">
                          Я ознакомился с документом «{doc.title}» и согласен с его условиями.
                        </span>
                        {alreadyAccepted && (
                          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/15 px-2 py-0.5 rounded-full">
                            Уже принято
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-subtle">
                        {meta?.version && <span>Версия {meta.version}</span>}
                        <Link
                          to={`/legal/${doc.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:text-[#4547D1] font-medium"
                        >
                          Прочитать документ
                          <ExternalLink size={12} />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/15 px-3 py-2 rounded-lg">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between pt-2">
              <button
                type="button"
                onClick={logout}
                disabled={submitting}
                className="text-sm text-subtle hover:text-body underline order-2 sm:order-1"
              >
                Не согласен — выйти
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !checked.terms_of_use || !checked.personal_data}
                className="order-1 sm:order-2 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] disabled:from-slate-300 disabled:to-slate-300 text-white font-semibold shadow-lg shadow-[#6567F1]/30 transition-all"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Принять и продолжить
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
