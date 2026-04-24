import { useState } from "react";
import StatusLight from "./StatusLight.jsx";
import ClientOrgDashboard from "./ClientOrgDashboard.jsx";

const STATUS_BORDER = {
  ok: "border-l-emerald-500",
  action_required: "border-l-amber-500",
  overdue: "border-l-red-500",
};

const STATUS_TEXT_OK = "Полёт нормальный";

const STATUS_TEXT_COLOR = {
  ok: "text-emerald-700",
  action_required: "text-amber-700",
  overdue: "text-red-700",
};

function aggregateGroupTitle(group, orgs) {
  const total = orgs.length;
  const needAttention = orgs.filter((o) => o.status !== "ok").length;
  if (group.aggregateStatus === "overdue") return `Просрочка по ${needAttention} орг`;
  if (group.aggregateStatus === "action_required")
    return `${needAttention} орг из ${total} требуют внимания`;
  return "По всем организациям полёт нормальный";
}

export default function ClientGroupDashboard({ group, organizations }) {
  const firstNonOk = organizations.find((o) => o.status !== "ok");
  const [expandedId, setExpandedId] = useState(firstNonOk?.id ?? null);

  return (
    <div className="flex flex-col gap-4">
      <StatusLight
        status={group.aggregateStatus}
        actions={[]}
        summary={{ debt: group.totalDebt, nextDeadline: null, openTickets: 0 }}
        orgName={aggregateGroupTitle(group, organizations)}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {organizations.map((org) => {
          const expanded = expandedId === org.id;
          const actionsCount = org.actions.length;
          const subline =
            org.status === "ok"
              ? STATUS_TEXT_OK
              : `⚡ ${actionsCount} ${actionsCount === 1 ? "действие" : "действий"}`;

          return (
            <div key={org.id} className="md:col-span-1">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : org.id)}
                className={`w-full text-left bg-white rounded-2xl shadow-lg border border-slate-200 border-l-4 ${STATUS_BORDER[org.status]} p-4 hover:shadow-xl transition-shadow`}
              >
                <div className="font-semibold text-slate-900">{org.name}</div>
                <div className={`text-sm ${STATUS_TEXT_COLOR[org.status]}`}>{subline}</div>
              </button>
              {expanded && (
                <div className="mt-3">
                  <ClientOrgDashboard org={org} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
