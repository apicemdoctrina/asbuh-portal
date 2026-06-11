import { Link } from "react-router";
import {
  Layers,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import OrgTable from "./OrgTable.jsx";

export default function GroupedView({
  organizations,
  clientGroups,
  visibleCols,
  expandedGroups,
  setExpandedGroups,
  page,
  limit,
  total,
  totalPages,
  setPage,
}) {
  // Build map: groupId → orgs; null key = без группы
  const grouped = new Map();
  grouped.set(null, []);
  for (const g of clientGroups) grouped.set(g.id, []);
  for (const org of organizations) {
    const key = org.clientGroup?.id ?? null;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(org);
  }

  function toggle(key) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const groupList = clientGroups.filter((g) => (grouped.get(g.id) || []).length > 0);
  const ungrouped = grouped.get(null) || [];

  return (
    <>
      <div className="space-y-3">
        {groupList.map((g) => {
          const orgs = grouped.get(g.id) || [];
          const open = expandedGroups.has(g.id);
          return (
            <div
              key={g.id}
              className="bg-surface rounded-2xl shadow-lg border border-line overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-3.5 hover:bg-canvas/50 transition-colors">
                <div className="flex items-center gap-3">
                  <button onClick={() => toggle(g.id)} className="flex items-center gap-3">
                    <Layers size={16} className="text-primary shrink-0" />
                  </button>
                  <Link
                    to={`/client-groups/${g.id}`}
                    className="font-semibold text-primary text-sm hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {g.name}
                  </Link>
                  {g.description && (
                    <span className="text-xs text-subtle hidden sm:block">{g.description}</span>
                  )}
                </div>
                <button onClick={() => toggle(g.id)} className="flex items-center gap-2">
                  <span className="text-xs font-medium text-subtle bg-muted px-2 py-0.5 rounded-full">
                    {orgs.length} орг.
                  </span>
                  {open ? (
                    <ChevronDown size={16} className="text-subtle" />
                  ) : (
                    <ChevronRightIcon size={16} className="text-subtle" />
                  )}
                </button>
              </div>
              {open && (
                <div className="border-t border-line overflow-x-auto">
                  <OrgTable orgs={orgs} visibleCols={visibleCols} />
                </div>
              )}
            </div>
          );
        })}

        {ungrouped.length > 0 && (
          <div className="bg-surface rounded-2xl shadow-lg border border-line overflow-hidden">
            <button
              onClick={() => toggle("__ungrouped__")}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-canvas/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Layers size={16} className="text-subtle shrink-0" />
                <span className="font-semibold text-subtle text-sm">Без группы</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-subtle bg-muted px-2 py-0.5 rounded-full">
                  {ungrouped.length} орг.
                </span>
                {expandedGroups.has("__ungrouped__") ? (
                  <ChevronDown size={16} className="text-subtle" />
                ) : (
                  <ChevronRightIcon size={16} className="text-subtle" />
                )}
              </div>
            </button>
            {expandedGroups.has("__ungrouped__") && (
              <div className="border-t border-line overflow-x-auto">
                <OrgTable orgs={ungrouped} visibleCols={visibleCols} />
              </div>
            )}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-subtle">
            Показано {(page - 1) * limit + 1}–{Math.min(page * limit, total)} из {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="p-2 rounded-lg border border-line text-body hover:bg-canvas disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-body">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="p-2 rounded-lg border border-line text-body hover:bg-canvas disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
