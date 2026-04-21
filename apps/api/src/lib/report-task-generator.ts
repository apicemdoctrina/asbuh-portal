/**
 * Reporting deadline notifier.
 *
 * Replaces the old task-generation approach: reporting lives entirely
 * in the matrix table; this module only sends deadline reminders
 * (in-app + Telegram) to accountants whose orgs have un-submitted reports.
 *
 * Schedule:
 * - On startup (5 s delay)
 * - Daily at 00:05
 *
 * For each active ReportType whose deadline is within 3 days,
 * notifies each accountant about their orgs that still have
 * NOT_SUBMITTED entries.
 */

import prisma from "./prisma.js";
import { notifyWithTelegram } from "./notify.js";

// ─── Period helpers ───

function getCurrentPeriod(frequency: string): { year: number; period: number } {
  const now = new Date();
  const year = now.getFullYear();
  if (frequency === "MONTHLY") return { year, period: now.getMonth() + 1 };
  if (frequency === "QUARTERLY") return { year, period: Math.ceil((now.getMonth() + 1) / 3) };
  return { year, period: 0 };
}

function periodEndMonth(frequency: string, period: number): number {
  if (frequency === "MONTHLY") return period;
  if (frequency === "QUARTERLY") return period * 3;
  return 12;
}

function computeDeadline(
  frequency: string,
  period: number,
  year: number,
  deadlineDay: number,
  deadlineMonthOffset: number,
): Date {
  const endMonth = periodEndMonth(frequency, period);
  let dlMonth = endMonth + deadlineMonthOffset;
  let dlYear = year;
  while (dlMonth > 12) {
    dlMonth -= 12;
    dlYear += 1;
  }
  const maxDay = new Date(dlYear, dlMonth, 0).getDate();
  const day = Math.min(deadlineDay, maxDay);
  return new Date(dlYear, dlMonth - 1, day, 23, 59, 59);
}

function periodLabel(frequency: string, period: number): string {
  if (frequency === "MONTHLY") {
    const months = [
      "",
      "январь",
      "февраль",
      "март",
      "апрель",
      "май",
      "июнь",
      "июль",
      "август",
      "сентябрь",
      "октябрь",
      "ноябрь",
      "декабрь",
    ];
    return months[period] || String(period);
  }
  if (frequency === "QUARTERLY") return `${period} кв.`;
  return "год";
}

// ─── Applicability rules ───

type OrgInfo = {
  form: string | null;
  taxSystems: string[];
  employeeCount: number | null;
};

const USN_SYSTEMS = ["USN6", "USN15", "USN_NDS5", "USN_NDS7", "USN_NDS22"];
const AUSN_SYSTEMS = ["AUSN8", "AUSN20"];
const OSNO_SYSTEMS = ["OSNO"];
const HAS_NDS = ["OSNO", "USN_NDS5", "USN_NDS7", "USN_NDS22"];

function hasAny(arr: string[], values: string[]): boolean {
  return arr.some((v) => values.includes(v));
}

function hasEmployees(org: OrgInfo): boolean {
  return (org.employeeCount ?? 0) > 0;
}

function isJuridical(org: OrgInfo): boolean {
  return org.form !== "IP";
}

/**
 * Returns true if the given report type applies to this organization.
 */
export function isReportApplicable(reportCode: string, org: OrgInfo): boolean {
  const ts = org.taxSystems ?? [];
  if (ts.length === 0) return true;

  switch (reportCode) {
    case "NDS":
      return hasAny(ts, HAS_NDS);
    case "NALOG_PRIBYL":
      return hasAny(ts, OSNO_SYSTEMS) && isJuridical(org);
    case "USN":
      return hasAny(ts, USN_SYSTEMS);
    case "USN_ADVANCE_NOTIF":
      return hasAny(ts, USN_SYSTEMS);
    case "AUSN_CALC":
      return hasAny(ts, AUSN_SYSTEMS);
    case "TRANSPORT_NOTIF":
      return true;
    case "6NDFL":
      return hasEmployees(org) && !hasAny(ts, AUSN_SYSTEMS);
    case "RSV":
      return hasEmployees(org) && !hasAny(ts, AUSN_SYSTEMS);
    case "PERS_SVED":
      return hasEmployees(org) && !hasAny(ts, AUSN_SYSTEMS);
    case "SZV_TD":
      return hasEmployees(org) && !hasAny(ts, AUSN_SYSTEMS);
    case "EFS1_NS":
      return hasEmployees(org) && !hasAny(ts, AUSN_SYSTEMS);
    case "BUH_OTCH":
      return isJuridical(org);
    case "NALOG_IMUSH":
      return hasAny(ts, OSNO_SYSTEMS) && isJuridical(org);
    case "ZEMEL_NALOG":
    case "TRANSPORT":
    case "DOHOD_INOSTR":
      return false;
    default:
      return true;
  }
}

// ─── Deadline notification sender ───

const WARN_DAYS = 3; // notify when deadline is within N days

async function sendDeadlineNotifications(): Promise<number> {
  const reportTypes = await prisma.reportType.findMany({ where: { isActive: true } });
  if (reportTypes.length === 0) return 0;

  const now = new Date();
  let sent = 0;

  for (const rt of reportTypes) {
    const { year, period } = getCurrentPeriod(rt.frequency);
    const deadline = computeDeadline(
      rt.frequency,
      period,
      year,
      rt.deadlineDay,
      rt.deadlineMonthOffset,
    );

    // Only notify if deadline is within WARN_DAYS and hasn't passed yet
    const daysUntil = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysUntil < 0 || daysUntil > WARN_DAYS) continue;

    const label = periodLabel(rt.frequency, period);
    const deadlineStr = deadline.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

    // Find orgs with NOT_SUBMITTED entries for this report+period
    const pendingEntries = await prisma.reportEntry.findMany({
      where: {
        reportTypeId: rt.id,
        year,
        period,
        status: "NOT_SUBMITTED",
      },
      select: {
        organization: {
          select: {
            id: true,
            name: true,
            sectionId: true,
          },
        },
      },
    });

    if (pendingEntries.length === 0) continue;

    // Group pending orgs by section
    const orgsBySection = new Map<string, string[]>();
    for (const entry of pendingEntries) {
      const sectionId = entry.organization.sectionId ?? "__none__";
      if (!orgsBySection.has(sectionId)) orgsBySection.set(sectionId, []);
      orgsBySection.get(sectionId)!.push(entry.organization.name);
    }

    // Find accountants per section and notify
    for (const [sectionId, orgNames] of orgsBySection) {
      if (sectionId === "__none__") continue;

      const members = await prisma.sectionMember.findMany({
        where: { sectionId, role: "accountant" },
        select: { userId: true },
      });

      const daysWord = daysUntil < 1 ? "сегодня" : `через ${Math.ceil(daysUntil)} дн.`;
      const title = `${rt.name} (${label} ${year}) — дедлайн ${daysWord}`;
      const body = `Не сдано: ${orgNames.length} орг. Срок: ${deadlineStr}`;
      const tgText = `⏰ <b>${title}</b>\n${body}\n\nОрганизации: ${orgNames.slice(0, 5).join(", ")}${orgNames.length > 5 ? ` и ещё ${orgNames.length - 5}` : ""}`;

      // Deduplicate: check if notification already sent today
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      for (const m of members) {
        const existing = await prisma.notification.findFirst({
          where: {
            userId: m.userId,
            type: "reporting_deadline",
            title,
            createdAt: { gte: todayStart },
          },
        });
        if (existing) continue;

        await notifyWithTelegram(m.userId, "reporting_deadline", title, body, "/reporting", tgText);
        sent++;
      }
    }
  }

  return sent;
}

// ─── Cron ───

export function startReportDeadlineNotifier(): void {
  setTimeout(async () => {
    try {
      const count = await sendDeadlineNotifications();
      if (count > 0)
        console.log(`[report-notifier] Sent ${count} deadline notifications on startup`);
    } catch (err) {
      console.error("[report-notifier] Startup run failed:", err);
    }
  }, 5_000);

  function scheduleNext() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(0, 5, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const ms = next.getTime() - now.getTime();

    setTimeout(async () => {
      try {
        const count = await sendDeadlineNotifications();
        if (count > 0) console.log(`[report-notifier] Sent ${count} deadline notifications`);
      } catch (err) {
        console.error("[report-notifier] Daily run failed:", err);
      }
      scheduleNext();
    }, ms);
  }

  scheduleNext();
  console.log("[report-notifier] Scheduled daily at 00:05");
}
