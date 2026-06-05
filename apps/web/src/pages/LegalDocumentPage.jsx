import { useNavigate, useParams } from "react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { LegalContent } from "../legal/render.jsx";
import termsOfUseMd from "../legal/terms-of-use.md?raw";
import personalDataMd from "../legal/personal-data.md?raw";
import privacyPolicyMd from "../legal/privacy-policy.md?raw";

const DOCS = {
  "terms-of-use": { title: "Пользовательское соглашение", text: termsOfUseMd },
  "personal-data": {
    title: "Согласие на обработку персональных данных",
    text: personalDataMd,
  },
  "privacy-policy": {
    title: "Политика в отношении обработки персональных данных",
    text: privacyPolicyMd,
  },
};

export default function LegalDocumentPage() {
  const { type } = useParams();
  const navigate = useNavigate();
  const doc = DOCS[type];

  if (!doc) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-xl font-bold text-heading">Документ не найден</h1>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white"
          >
            <ArrowLeft size={16} /> Назад
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-[#6567F1]/5 dark:from-canvas dark:to-primary/5 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
          className="inline-flex items-center gap-2 text-sm text-body hover:text-heading mb-4"
        >
          <ArrowLeft size={16} /> Назад
        </button>

        <div className="bg-surface rounded-2xl shadow-xl border border-line overflow-hidden">
          <div className="bg-gradient-to-r from-[#6567F1] to-[#5557E1] px-6 py-5 text-white">
            <div className="flex items-center gap-3">
              <ShieldCheck size={28} />
              <h1 className="text-xl font-bold">{doc.title}</h1>
            </div>
          </div>
          <div className="p-6">
            <LegalContent text={doc.text} />
          </div>
        </div>
      </div>
    </div>
  );
}
