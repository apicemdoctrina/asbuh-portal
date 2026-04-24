export type OrgStatus = "ok" | "action_required" | "overdue";

export type Action = {
  type: "document_request" | "ticket_waiting" | "payment_overdue";
  title: string;
  dueAt: string | null;
  link: string;
};

const STATUS_PRIORITY: Record<OrgStatus, number> = {
  ok: 0,
  action_required: 1,
  overdue: 2,
};

/** Returns the worse (higher-priority) of two statuses. */
export function worse(a: OrgStatus, b: OrgStatus): OrgStatus {
  return STATUS_PRIORITY[a] >= STATUS_PRIORITY[b] ? a : b;
}

/**
 * Whole days between two UTC dates ignoring time-of-day.
 * Positive when `to` is after `from`.
 *
 * Why UTC: clients are spread across UTC+2..UTC+10. We compare in UTC so
 * "days remaining" is consistent across timezones.
 */
export function daysBetween(from: Date, to: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((startOfDay(to) - startOfDay(from)) / MS_PER_DAY);
}

export function computeOrgStatus(input: { actions: Action[]; hasOverdueTask: boolean }): {
  status: OrgStatus;
} {
  const hasPaymentOverdue = input.actions.some((a) => a.type === "payment_overdue");
  if (hasPaymentOverdue || input.hasOverdueTask) return { status: "overdue" };
  if (input.actions.length > 0) return { status: "action_required" };
  return { status: "ok" };
}
