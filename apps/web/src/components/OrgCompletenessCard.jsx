import { calcOrgCompleteness } from "../lib/orgCompleteness.js";
import { CheckCircle2, AlertCircle } from "lucide-react";

function barColor(percent) {
  if (percent >= 80) return "bg-green-500";
  if (percent >= 50) return "bg-amber-400";
  return "bg-red-400";
}

function textColor(percent) {
  if (percent >= 80) return "text-green-700";
  if (percent >= 50) return "text-amber-700";
  return "text-red-600";
}

export default function OrgCompletenessCard({ org }) {
  const { percent, missing, filledCount, totalCount } = calcOrgCompleteness(org);
  const complete = percent === 100;

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-700">Полнота карточки</h3>
        <span className={`text-sm font-bold tabular-nums ${textColor(percent)}`}>{percent}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor(percent)}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="text-xs text-slate-400 mb-3">
        Заполнено {filledCount} из {totalCount} полей
      </p>

      {complete ? (
        <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
          <CheckCircle2 size={16} className="text-green-500 shrink-0" />
          Все данные заполнены
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            <AlertCircle size={12} className="text-amber-500 shrink-0" />
            Не заполнено:
          </div>
          <ul className="space-y-1">
            {missing.map((f) => (
              <li key={f.key} className="flex items-center gap-2 text-xs text-slate-600">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                {f.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
