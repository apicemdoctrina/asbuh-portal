import { formatRelative } from "./relativeTime.js";

const DOT_COLOR = {
  task_done: "bg-emerald-500",
  ticket_status: "bg-[#6567F1]",
};

export default function ActivityFeed({ feed }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-5">
      <div className="font-semibold text-slate-700 text-sm mb-4">Что мы для вас делаем</div>
      {feed.length === 0 ? (
        <div className="text-sm text-slate-400 py-6 text-center">
          Скоро здесь появится история действий бухгалтера по вашей компании.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {feed.map((item) => (
            <li key={item.id} className="flex gap-3">
              <div
                className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${DOT_COLOR[item.kind] ?? "bg-slate-300"}`}
              />
              <div>
                <div className="text-sm font-medium text-slate-900">{item.title}</div>
                <div className="text-xs text-slate-400">
                  {formatRelative(item.at)}
                  {item.actor ? ` · ${item.actor}` : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
