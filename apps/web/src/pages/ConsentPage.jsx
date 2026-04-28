import { useState, useEffect, Fragment } from "react";
import { useNavigate } from "react-router";
import { Loader2, Check, AlertCircle, ShieldCheck } from "lucide-react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import offerMd from "../legal/offer.md?raw";
import personalDataMd from "../legal/personal-data.md?raw";

const DOCS = [
  { type: "offer", title: "Договор-оферта", text: offerMd },
  {
    type: "personal_data",
    title: "Согласие на обработку персональных данных",
    text: personalDataMd,
  },
];

export default function ConsentPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [statusByType, setStatusByType] = useState({});
  const [checked, setChecked] = useState({ offer: false, personal_data: false });
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
    if (!checked.offer || !checked.personal_data) {
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="text-[#6567F1] animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-[#6567F1]/5 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
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

          <div className="p-6 space-y-5">
            {DOCS.map((doc) => {
              const meta = statusByType[doc.type];
              const alreadyAccepted = meta?.accepted;
              return (
                <DocumentBlock
                  key={doc.type}
                  title={doc.title}
                  text={doc.text}
                  version={meta?.version}
                  checked={checked[doc.type]}
                  alreadyAccepted={alreadyAccepted}
                  onCheck={(v) =>
                    setChecked((prev) => ({ ...prev, [doc.type]: v || alreadyAccepted }))
                  }
                />
              );
            })}

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between pt-2">
              <button
                type="button"
                onClick={logout}
                disabled={submitting}
                className="text-sm text-slate-500 hover:text-slate-700 underline order-2 sm:order-1"
              >
                Не согласен — выйти
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !checked.offer || !checked.personal_data}
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

function DocumentBlock({ title, text, version, checked, alreadyAccepted, onCheck }) {
  const blocks = parseLegalMarkdown(text);
  const isChecked = checked || alreadyAccepted;
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">{title}</h3>
          {version && <p className="text-xs text-slate-500 mt-0.5">Версия {version}</p>}
        </div>
        {alreadyAccepted && (
          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
            Уже принято
          </span>
        )}
      </div>
      <div className="px-4 py-3 max-h-72 overflow-y-auto text-sm text-slate-700 space-y-2">
        {blocks.map((b, i) => (
          <RenderBlock key={i} block={b} />
        ))}
      </div>
      <label
        className={`flex items-start gap-3 px-4 py-3 border-t border-slate-200 cursor-pointer transition-colors ${
          isChecked ? "bg-emerald-50/50" : "bg-white hover:bg-slate-50"
        } ${alreadyAccepted ? "opacity-70 pointer-events-none" : ""}`}
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(e) => onCheck(e.target.checked)}
          disabled={alreadyAccepted}
          className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#6567F1] focus:ring-[#6567F1]/30"
        />
        <span className="text-sm text-slate-700">
          Я ознакомился с документом «{title}» и согласен с его условиями.
        </span>
      </label>
    </div>
  );
}

function RenderBlock({ block }) {
  switch (block.kind) {
    case "h1":
      return (
        <h2 className="text-base font-bold text-slate-900 mt-3">{renderInline(block.text)}</h2>
      );
    case "h2":
      return <h3 className="text-sm font-bold text-slate-900 mt-3">{renderInline(block.text)}</h3>;
    case "h3":
      return (
        <h4 className="text-sm font-semibold text-slate-800 mt-2">{renderInline(block.text)}</h4>
      );
    case "p":
      return <p className="leading-relaxed">{renderInline(block.text)}</p>;
    case "blockquote":
      return (
        <blockquote className="border-l-4 border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 text-xs">
          {block.lines.map((line, i) => (
            <p key={i}>{renderInline(line)}</p>
          ))}
        </blockquote>
      );
    case "ul":
      return (
        <ul className="list-disc pl-5 space-y-1">
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    default:
      return null;
  }
}

function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(part);
    if (m) return <strong key={i}>{m[1]}</strong>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function parseLegalMarkdown(md) {
  const lines = md.split(/\r?\n/);
  const blocks = [];
  let listBuffer = null;
  let blockquoteBuffer = null;
  let paraBuffer = null;

  function flushPara() {
    if (paraBuffer) {
      blocks.push({ kind: "p", text: paraBuffer.join(" ") });
      paraBuffer = null;
    }
  }
  function flushList() {
    if (listBuffer) {
      blocks.push({ kind: "ul", items: listBuffer });
      listBuffer = null;
    }
  }
  function flushBlockquote() {
    if (blockquoteBuffer) {
      blocks.push({ kind: "blockquote", lines: blockquoteBuffer });
      blockquoteBuffer = null;
    }
  }
  function flushAll() {
    flushPara();
    flushList();
    flushBlockquote();
  }

  for (const line of lines) {
    if (/^\s*$/.test(line)) {
      flushAll();
      continue;
    }
    let m;
    if ((m = /^### (.*)$/.exec(line))) {
      flushAll();
      blocks.push({ kind: "h3", text: m[1] });
      continue;
    }
    if ((m = /^## (.*)$/.exec(line))) {
      flushAll();
      blocks.push({ kind: "h2", text: m[1] });
      continue;
    }
    if ((m = /^# (.*)$/.exec(line))) {
      flushAll();
      blocks.push({ kind: "h1", text: m[1] });
      continue;
    }
    if ((m = /^> ?(.*)$/.exec(line))) {
      flushPara();
      flushList();
      if (!blockquoteBuffer) blockquoteBuffer = [];
      blockquoteBuffer.push(m[1]);
      continue;
    }
    if ((m = /^- (.*)$/.exec(line))) {
      flushPara();
      flushBlockquote();
      if (!listBuffer) listBuffer = [];
      listBuffer.push(m[1]);
      continue;
    }
    flushList();
    flushBlockquote();
    if (!paraBuffer) paraBuffer = [];
    paraBuffer.push(line);
  }
  flushAll();
  return blocks;
}
