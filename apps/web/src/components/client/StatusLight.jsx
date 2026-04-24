import { Link } from "react-router";
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  FileUp,
  MessageCircle,
  Banknote,
} from "lucide-react";

const STYLES = {
  ok: {
    gradient: "from-emerald-500 to-emerald-600",
    iconBg: "bg-white/20",
    Icon: CheckCircle2,
    title: "Полёт нормальный",
  },
  action_required: {
    gradient: "from-amber-500 to-amber-600",
    iconBg: "bg-white/20",
    Icon: AlertTriangle,
    title: "Требуется ваше действие",
  },
  overdue: {
    gradient: "from-red-500 to-red-600",
    iconBg: "bg-white/20",
    Icon: AlertCircle,
    title: "Есть просрочка",
  },
};

const ACTION_ICON = {
  document_request: FileUp,
  ticket_waiting: MessageCircle,
  payment_overdue: Banknote,
};

const ACTION_CTA = {
  document_request: "Загрузить",
  ticket_waiting: "Открыть",
  payment_overdue: "Оплатить",
};

function buildSubtitle({ status, actions, summary }) {
  if (status === "ok") {
    if (summary?.nextDeadline && summary.nextDeadline.daysUntil <= 7) {
      const date = new Date(summary.nextDeadline.date).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
      });
      return `Следующий отчёт — ${summary.nextDeadline.label} до ${date}`;
    }
    if (summary?.debt > 0) {
      return `Долг ${summary.debt.toLocaleString("ru-RU")} ₽, оплата в графике`;
    }
    return "Все отчёты в графике, долгов нет";
  }
  if (status === "action_required") return `${actions.length} открытых пунктов`;
  return `${actions.length} пунктов требуют срочного внимания`;
}

export default function StatusLight({ status, actions = [], summary, orgName }) {
  const cfg = STYLES[status];
  const subtitle = buildSubtitle({ status, actions, summary });
  const showActions = status !== "ok" && actions.length > 0;

  return (
    <div className={`bg-gradient-to-br ${cfg.gradient} text-white rounded-2xl p-6 shadow-lg`}>
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-full ${cfg.iconBg} flex items-center justify-center`}>
          <cfg.Icon size={26} />
        </div>
        <div>
          <div className="font-bold text-lg">{cfg.title}</div>
          <div className="text-sm opacity-90">
            {orgName ? `${orgName} · ` : ""}
            {subtitle}
          </div>
        </div>
      </div>

      {showActions && (
        <div className="mt-4 bg-white/15 rounded-xl p-3 flex flex-col gap-2">
          {actions.map((a, i) => {
            const Icon = ACTION_ICON[a.type] ?? AlertCircle;
            return (
              <div key={i} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <Icon size={16} />
                  <span>{a.title}</span>
                </div>
                <Link
                  to={a.link}
                  className="bg-white text-slate-900 text-xs font-bold px-3 py-1.5 rounded-md hover:bg-slate-100 transition-colors"
                >
                  {ACTION_CTA[a.type] ?? "Открыть"}
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
