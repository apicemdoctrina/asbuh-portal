import { useState, useEffect, useRef } from "react";
import { api } from "../../lib/api.js";
import { Loader2, Check } from "lucide-react";
import { STATUS_OPTIONS, STATUS_MAP } from "./reportingHelpers.js";

export default function StatusCell({
  entry,
  orgId,
  rtId,
  year,
  period,
  canEdit,
  onUpdate,
  compact = true,
}) {
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const status = entry?.status || "NOT_SUBMITTED";
  const info = STATUS_MAP[status];
  const isNA = status === "NOT_APPLICABLE";

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  async function handleSelect(next) {
    setOpen(false);
    if (!canEdit || saving || next === status) return;
    setSaving(true);
    try {
      const res = await api("/api/reporting/entry", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: orgId,
          reportTypeId: rtId,
          year,
          period,
          status: next,
        }),
      });
      if (res.ok) onUpdate(orgId, rtId, await res.json());
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  if (saving) {
    return (
      <div className="w-full h-full flex items-center justify-center py-1.5">
        <Loader2 size={14} className="animate-spin text-subtle" />
      </div>
    );
  }

  const labelCls = compact ? "hidden xl:inline" : "inline";

  // Read-only
  if (!canEdit) {
    if (isNA)
      return <div className="w-full text-center text-subtle text-base font-medium py-1.5">—</div>;
    const Icon = info.icon;
    return (
      <div
        className={`w-full flex items-center justify-center gap-1 text-xs font-medium rounded-md px-2 py-1.5 ${info.color}`}
      >
        <Icon size={14} />
        <span className={labelCls}>{info.label}</span>
      </div>
    );
  }

  // Editable
  const Icon = isNA ? null : info.icon;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-center gap-1 text-xs font-medium rounded-md px-2 py-1.5 transition-colors ${
          isNA ? "text-subtle hover:text-subtle" : `${info.color} hover:opacity-80`
        }`}
      >
        {isNA ? (
          "—"
        ) : (
          <>
            <Icon size={14} />
            <span className={labelCls}>{info.label}</span>
          </>
        )}
      </button>

      {open && (
        <div className="absolute z-50 top-full right-0 mt-1 w-44 bg-surface rounded-xl shadow-xl border border-line py-1 animate-in fade-in zoom-in-95 duration-100">
          {STATUS_OPTIONS.map((opt) => {
            const OptIcon = opt.icon;
            const active = opt.value === status;
            return (
              <button
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                  active ? "bg-canvas font-semibold" : "hover:bg-canvas"
                }`}
              >
                <span
                  className={`flex items-center justify-center w-5 h-5 rounded-md ${opt.color}`}
                >
                  <OptIcon size={12} />
                </span>
                <span className="text-body">
                  {opt.value === "NOT_APPLICABLE" ? "Не применимо" : opt.label}
                </span>
                {active && <Check size={12} className="ml-auto text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
