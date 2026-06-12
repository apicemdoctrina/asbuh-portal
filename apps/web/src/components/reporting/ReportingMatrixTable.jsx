import StatusCell from "./StatusCell.jsx";

export default function ReportingMatrixTable({ orgs, data, canEdit, onUpdate }) {
  return (
    <div className="hidden md:block bg-surface rounded-2xl shadow-lg border border-line overflow-hidden">
      <div className="overflow-auto max-h-[calc(100vh-260px)]">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-body sticky top-0 left-0 bg-canvas z-30 min-w-[200px] border-b border-line">
                Организация
              </th>
              {data.reportTypes.map((rt) => (
                <th
                  key={rt.id}
                  className="text-center px-2 py-3 font-medium text-body min-w-[100px] sticky top-0 bg-canvas z-20 border-b border-line"
                >
                  <div className="text-xs leading-tight">{rt.name}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orgs.map((org, idx) => (
              <tr key={org.id} className={idx % 2 === 0 ? "bg-surface" : "bg-canvas/50"}>
                <td className="px-4 py-2 sticky left-0 z-10 bg-inherit border-b border-line">
                  <div className="font-medium text-heading truncate max-w-[240px]" title={org.name}>
                    {org.name}
                  </div>
                  <div className="text-xs text-subtle flex items-center gap-2">
                    {org.inn && <span>ИНН {org.inn}</span>}
                  </div>
                </td>
                {data.reportTypes.map((rt) => {
                  const key = `${org.id}_${rt.id}`;
                  const entry = data.entries[key];
                  const applicable = data.applicability?.[key] !== false;
                  const effectiveEntry =
                    entry || (!applicable ? { status: "NOT_APPLICABLE" } : null);
                  return (
                    <td key={rt.id} className="px-1.5 py-1.5 border-b border-line">
                      <StatusCell
                        entry={effectiveEntry}
                        orgId={org.id}
                        rtId={rt.id}
                        year={data.year}
                        period={data.period}
                        canEdit={canEdit}
                        onUpdate={onUpdate}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
