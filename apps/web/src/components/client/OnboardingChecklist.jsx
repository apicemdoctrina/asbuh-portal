import { useState, useEffect } from "react";
import { Check, MessageCircle, Users, BookOpen, X, Mail, Phone, Send } from "lucide-react";
import { Link } from "react-router";
import { api } from "../../lib/api.js";

export default function OnboardingChecklist() {
  const [data, setData] = useState(null);
  const [showManagers, setShowManagers] = useState(false);

  async function load() {
    try {
      const res = await api("/api/client/onboarding");
      if (res.ok) setData(await res.json());
    } catch {
      /* silent: onboarding is non-blocking */
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function markStep(step) {
    try {
      await api(`/api/client/onboarding/step/${step}`, { method: "POST" });
      await load();
    } catch {
      /* ignore */
    }
  }

  if (!data || data.allDone) return null;

  const steps = [
    {
      key: "telegram",
      done: data.telegram,
      icon: MessageCircle,
      title: "Привяжите Telegram",
      desc: "Будете получать уведомления о новых задачах и запросах документов.",
      cta: { label: "Привязать", to: "/profile" },
    },
    {
      key: "manager",
      done: data.manager,
      icon: Users,
      title: "Познакомьтесь с менеджером",
      desc: "Кто ведёт ваш учёт и как с ним связаться.",
      action: () => setShowManagers(true),
      ctaLabel: "Посмотреть",
    },
    {
      key: "faq",
      done: data.faq,
      icon: BookOpen,
      title: "Загляните в базу знаний",
      desc: "Ответы на частые вопросы — экономит время и вам, и нам.",
      cta: { label: "Открыть", to: "/knowledge" },
      onClickCta: () => markStep("faq"),
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <>
      <div className="bg-gradient-to-br from-[#6567F1]/5 to-[#5557E1]/5 rounded-2xl border border-[#6567F1]/20 p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Добро пожаловать в ASBUH</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {doneCount} из {steps.length} шагов готово
            </p>
          </div>
          <div className="flex gap-1">
            {steps.map((s) => (
              <span
                key={s.key}
                className={`w-2 h-2 rounded-full ${s.done ? "bg-[#6567F1]" : "bg-slate-300"}`}
              />
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.key}
                className={`bg-white rounded-xl border p-4 ${
                  s.done ? "border-emerald-200" : "border-slate-200"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                      s.done ? "bg-emerald-50 text-emerald-600" : "bg-[#6567F1]/10 text-[#6567F1]"
                    }`}
                  >
                    {s.done ? <Check size={16} /> : <Icon size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{s.title}</p>
                    <p className="text-xs text-slate-500 mt-1">{s.desc}</p>
                  </div>
                </div>
                {!s.done && (
                  <div className="mt-3">
                    {s.cta ? (
                      <Link
                        to={s.cta.to}
                        onClick={s.onClickCta}
                        className="inline-flex items-center text-xs font-semibold text-[#6567F1] hover:text-[#5557E1]"
                      >
                        {s.cta.label} →
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={s.action}
                        className="inline-flex items-center text-xs font-semibold text-[#6567F1] hover:text-[#5557E1]"
                      >
                        {s.ctaLabel} →
                      </button>
                    )}
                  </div>
                )}
                {s.done && <p className="mt-3 text-xs font-medium text-emerald-600">Готово</p>}
              </div>
            );
          })}
        </div>
      </div>

      {showManagers && (
        <ManagersModal
          managers={data.managers}
          onClose={async () => {
            setShowManagers(false);
            if (!data.manager) await markStep("manager");
          }}
        />
      )}
    </>
  );
}

function ManagersModal({ managers, onClose }) {
  return (
    <div
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Ваша команда ASBUH</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {managers.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">
              Команда пока не назначена. Свяжитесь с поддержкой:{" "}
              <a href="mailto:info@asbuh.com" className="text-[#6567F1] font-medium">
                info@asbuh.com
              </a>
            </p>
          ) : (
            managers.map((m) => <ManagerCard key={m.id} m={m} />)
          )}
        </div>

        <div className="p-5 pt-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white text-sm font-semibold shadow-lg shadow-[#6567F1]/30 transition-all"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
}

function ManagerCard({ m }) {
  const roleLabel = m.sectionRole === "manager" ? "Менеджер" : "Бухгалтер";
  const initials = `${m.firstName.charAt(0)}${m.lastName.charAt(0)}`.toUpperCase();
  return (
    <div className="flex gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/50">
      <div className="shrink-0">
        {m.avatarPath ? (
          <img
            src={m.avatarPath}
            alt=""
            className="w-12 h-12 rounded-full object-cover border border-slate-200"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-[#6567F1]/10 text-[#6567F1] font-semibold flex items-center justify-center">
            {initials}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900">
          {m.firstName} {m.lastName}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">{roleLabel}</p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <a
            href={`mailto:${m.email}`}
            className="inline-flex items-center gap-1 text-slate-600 hover:text-[#6567F1]"
          >
            <Mail size={12} /> {m.email}
          </a>
          {m.phone && (
            <a
              href={`tel:${m.phone}`}
              className="inline-flex items-center gap-1 text-slate-600 hover:text-[#6567F1]"
            >
              <Phone size={12} /> {m.phone}
            </a>
          )}
          {m.telegramUsername && (
            <a
              href={`https://t.me/${m.telegramUsername}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-slate-600 hover:text-[#6567F1]"
            >
              <Send size={12} /> @{m.telegramUsername}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
