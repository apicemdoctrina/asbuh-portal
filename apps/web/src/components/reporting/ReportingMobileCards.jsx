import StatusCell from "./StatusCell.jsx";

export default function ReportingMobileCards({ orgs, data, canEdit, onUpdate }) {
  return (
    <div className="md:hidden space-y-3">
      {orgs.map((org) => (
        <div
          key={org.id}
          className="bg-surface rounded-2xl shadow-sm border border-line overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-line bg-canvas/40">
            <div className="font-semibold text-heading break-words" title={org.name}>
              {org.name}
            </div>
            <div className="text-xs text-subtle flex items-center gap-2 mt-0.5">
              {org.inn && <span className="tabular-nums">ИНН {org.inn}</span>}
            </div>
          </div>
          <ul className="divide-y divide-line">
            {data.reportTypes.map((rt) => {
              const key = `${org.id}_${rt.id}`;
              const entry = data.entries[key];
              const applicable = data.applicability?.[key] !== false;
              const effectiveEntry = entry || (!applicable ? { status: "NOT_APPLICABLE" } : null);
              return (
                <li key={rt.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-sm text-body flex-1 min-w-0 truncate">{rt.name}</span>
                  <div className="shrink-0 min-w-[110px]">
                    <StatusCell
                      entry={effectiveEntry}
                      orgId={org.id}
                      rtId={rt.id}
                      year={data.year}
                      period={data.period}
                      canEdit={canEdit}
                      onUpdate={onUpdate}
                      compact={false}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
