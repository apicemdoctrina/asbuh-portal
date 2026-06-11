import { Link } from "react-router";
import { fmtMoney } from "../../lib/format.js";
import { COLUMN_DEFS, STATUS_LABELS, statusBadge, renderCell } from "./orgConstants.jsx";

export default function OrgTable({ orgs, visibleCols }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {orgs.map((org) => (
          <tr key={org.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
            <td className="px-4 py-3 font-medium text-heading whitespace-nowrap">
              <Link to={`/organizations/${org.id}`} className="text-primary hover:underline">
                {org.name}
              </Link>
              {org.clientGroup && (
                <Link
                  to={`/client-groups/${org.clientGroup.id}`}
                  className="ml-2 text-xs text-subtle hover:text-primary"
                >
                  {org.clientGroup.name}
                </Link>
              )}
            </td>
            {COLUMN_DEFS.filter((c) => visibleCols.includes(c.key)).map((col) => (
              <td key={col.key} className="px-4 py-3 text-body whitespace-nowrap">
                {col.key === "status" ? (
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(org.status)}`}
                  >
                    {STATUS_LABELS[org.status] || org.status}
                  </span>
                ) : col.key === "debtAmount" && org.debtAmount > 0 ? (
                  <span className="text-red-600 dark:text-red-300 font-medium">
                    {fmtMoney(org.debtAmount)}
                  </span>
                ) : (
                  (() => {
                    const val = renderCell(col.key, org);
                    if (val?.__expiry) return <span className={val.cls}>{val.label}</span>;
                    return val;
                  })()
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
