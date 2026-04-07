/**
 * Automatic task generation for reporting deadlines.
 *
 * Runs daily. For each active ReportType:
 * - Determines the current period (month/quarter/year)
 * - Creates ONE task per ReportType+period (e.g. "НДС (2 кв. 2026)")
 * - Each active Organization becomes a checklist item linked to its ReportEntry
 * - Assigns the task to all accountants across relevant sections
 *
 * Status sync (checklist ↔ matrix):
 * - syncChecklistToEntry(): checklist item checked → entry SUBMITTED
 * - syncEntryToChecklist(): entry SUBMITTED/ACCEPTED in matrix → checklist item checked
 * - When all checklist items done → task DONE. If any unchecked → task OPEN.
 */

import prisma from "./prisma.js";

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
  return org.form !== "IP"; // ООО, НКО, АО, ПАО — юрлица
}

/**
 * Returns true if the given report type applies to this organization.
 * Rules are based on Russian tax law basics.
 */
export function isReportApplicable(reportCode: string, org: OrgInfo): boolean {
  const ts = org.taxSystems ?? [];
  if (ts.length === 0) return true; // if no tax system set, show everything

  switch (reportCode) {
    // НДС — only ОСНО or USN+NDS
    case "NDS":
      return hasAny(ts, HAS_NDS);

    // Налог на прибыль — only ОСНО, only legal entities
    case "NALOG_PRIBYL":
      return hasAny(ts, OSNO_SYSTEMS) && isJuridical(org);

    // УСН декларация — only USN-based systems
    case "USN":
      return hasAny(ts, USN_SYSTEMS);

    // УСН авансы — only USN-based systems
    case "USN_ADVANCE":
      return hasAny(ts, USN_SYSTEMS);

    // 6-НДФЛ — if has employees, NOT AUSN (bank calculates NDFL automatically)
    case "6NDFL":
      return hasEmployees(org) && !hasAny(ts, AUSN_SYSTEMS);

    // РСВ — if has employees, NOT AUSN (tax authority calculates contributions)
    case "RSV":
      return hasEmployees(org) && !hasAny(ts, AUSN_SYSTEMS);

    // Персонифицированные сведения — if has employees, NOT AUSN
    case "PERS_SVED":
      return hasEmployees(org) && !hasAny(ts, AUSN_SYSTEMS);

    // ЕФС-1 (СЗВ-ТД) — if has employees, NOT AUSN
    case "SZV_TD":
      return hasEmployees(org) && !hasAny(ts, AUSN_SYSTEMS);

    // Бухгалтерская отчётность — legal entities only (not ИП)
    case "BUH_OTCH":
      return isJuridical(org);

    // Налог на имущество — ОСНО legal entities
    case "NALOG_IMUSH":
      return hasAny(ts, OSNO_SYSTEMS) && isJuridical(org);

    // Земельный / транспортный налог — по умолчанию не применимо (зависит от активов)
    case "ZEMEL_NALOG":
    case "TRANSPORT":
      return false;

    default:
      return true;
  }
}

// ─── Main generator ───

export async function generateReportTasks(): Promise<number> {
  const reportTypes = await prisma.reportType.findMany({
    where: { isActive: true },
  });
  if (reportTypes.length === 0) return 0;

  const organizations = await prisma.organization.findMany({
    where: { status: { in: ["active", "new"] } },
    select: {
      id: true,
      name: true,
      form: true,
      taxSystems: true,
      employeeCount: true,
      sectionId: true,
      section: {
        select: {
          members: {
            where: { role: "accountant" },
            select: { userId: true },
          },
        },
      },
    },
    orderBy: [{ name: "asc" }],
  });

  const admin = await prisma.user.findFirst({
    where: { userRoles: { some: { role: { name: "admin" } } } },
    select: { id: true },
  });
  if (!admin) {
    console.warn("[report-task-generator] No admin user found, skipping");
    return 0;
  }

  // Group organizations by sectionId
  const orgsBySection = new Map<string, typeof organizations>();
  for (const org of organizations) {
    const key = org.sectionId ?? "__none__";
    if (!orgsBySection.has(key)) orgsBySection.set(key, []);
    orgsBySection.get(key)!.push(org);
  }

  // Fetch sections for titles
  const sections = await prisma.section.findMany({
    select: { id: true, number: true, name: true },
  });
  const sectionMap = new Map(sections.map((s) => [s.id, s]));

  let created = 0;

  for (const rt of reportTypes) {
    const { year, period } = getCurrentPeriod(rt.frequency);
    const deadline = computeDeadline(
      rt.frequency,
      period,
      year,
      rt.deadlineDay,
      rt.deadlineMonthOffset,
    );
    const label = periodLabel(rt.frequency, period);

    // Create report entries for ALL orgs (including N/A) — needed for matrix
    for (const org of organizations) {
      const applicable = isReportApplicable(rt.code, {
        form: org.form,
        taxSystems: org.taxSystems as string[],
        employeeCount: org.employeeCount,
      });
      await prisma.reportEntry.upsert({
        where: {
          organizationId_reportTypeId_year_period: {
            organizationId: org.id,
            reportTypeId: rt.id,
            year,
            period,
          },
        },
        update: {},
        create: {
          organizationId: org.id,
          reportTypeId: rt.id,
          year,
          period,
          status: applicable ? "NOT_SUBMITTED" : "NOT_APPLICABLE",
        },
      });
    }

    // Create one task per section
    for (const [sectionKey, sectionOrgs] of orgsBySection) {
      const sectionId = sectionKey === "__none__" ? null : sectionKey;
      const section = sectionId ? sectionMap.get(sectionId) : null;
      const sectionLabel = section ? ` — §${section.number}` : "";

      // Find or create the task for this section
      let task = await prisma.task.findUnique({
        where: {
          reportTypeId_reportYear_reportPeriod_reportSectionId: {
            reportTypeId: rt.id,
            reportYear: year,
            reportPeriod: period,
            reportSectionId: sectionId ?? "",
          },
        },
        include: { checklistItems: { select: { reportEntryId: true } } },
      });

      const existingEntryIds = new Set(
        task?.checklistItems.map((ci) => ci.reportEntryId).filter(Boolean) ?? [],
      );

      // Filter to applicable orgs in this section
      const applicableOrgs = sectionOrgs.filter((org) =>
        isReportApplicable(rt.code, {
          form: org.form,
          taxSystems: org.taxSystems as string[],
          employeeCount: org.employeeCount,
        }),
      );

      // Skip creating a task if no applicable orgs in this section
      if (applicableOrgs.length === 0) continue;

      if (!task) {
        task = await prisma.task.create({
          data: {
            title: `${rt.name} (${label} ${year})${sectionLabel}`,
            category: "REPORTING",
            priority: "MEDIUM",
            status: "OPEN",
            dueDate: deadline,
            reportTypeId: rt.id,
            reportYear: year,
            reportPeriod: period,
            reportSectionId: sectionId ?? "",
            createdById: admin.id,
          },
          include: { checklistItems: { select: { reportEntryId: true } } },
        });
        created++;
      }

      // Add checklist items for each applicable org
      let position = task.checklistItems.length;
      const sectionAccountantIds = new Set<string>();

      for (const org of applicableOrgs) {
        const entry = await prisma.reportEntry.findUnique({
          where: {
            organizationId_reportTypeId_year_period: {
              organizationId: org.id,
              reportTypeId: rt.id,
              year,
              period,
            },
          },
        });
        if (!entry || entry.status === "NOT_APPLICABLE") continue;

        if (!existingEntryIds.has(entry.id)) {
          await prisma.taskChecklistItem.create({
            data: {
              taskId: task.id,
              text: org.name,
              done: entry.status === "SUBMITTED" || entry.status === "ACCEPTED",
              position: position++,
              reportEntryId: entry.id,
            },
          });
        }

        org.section?.members.forEach((m) => sectionAccountantIds.add(m.userId));
      }

      // Assign section's accountants to this task
      if (sectionAccountantIds.size > 0) {
        const existingAssignees = await prisma.taskAssignee.findMany({
          where: { taskId: task.id },
          select: { userId: true },
        });
        const existingSet = new Set(existingAssignees.map((a) => a.userId));
        const newAssignees = [...sectionAccountantIds].filter((id) => !existingSet.has(id));
        if (newAssignees.length > 0) {
          await prisma.taskAssignee.createMany({
            data: newAssignees.map((userId) => ({ taskId: task!.id, userId })),
            skipDuplicates: true,
          });
        }
      }
    }
  }

  return created;
}

// ─── Status sync ───

/**
 * Call when a checklist item is toggled.
 * Syncs the linked report entry status.
 */
export async function syncChecklistToEntry(checklistItemId: string): Promise<void> {
  const item = await prisma.taskChecklistItem.findUnique({
    where: { id: checklistItemId },
    select: { done: true, reportEntryId: true, taskId: true },
  });
  if (!item?.reportEntryId) return;

  if (item.done) {
    await prisma.reportEntry.update({
      where: { id: item.reportEntryId },
      data: { status: "SUBMITTED", filedAt: new Date() },
    });
  } else {
    const entry = await prisma.reportEntry.findUnique({
      where: { id: item.reportEntryId },
      select: { status: true },
    });
    if (entry?.status === "SUBMITTED") {
      await prisma.reportEntry.update({
        where: { id: item.reportEntryId },
        data: { status: "NOT_SUBMITTED", filedAt: null },
      });
    }
  }

  // Update parent task status based on all checklist items
  await updateTaskStatusFromChecklist(item.taskId);
}

/**
 * Call when a report entry status changes in the matrix.
 * Syncs the linked checklist item.
 */
export async function syncEntryToChecklist(entryId: string, newStatus: string): Promise<void> {
  const item = await prisma.taskChecklistItem.findUnique({
    where: { reportEntryId: entryId },
    select: { id: true, done: true, taskId: true },
  });
  if (!item) return;

  const shouldBeDone = newStatus === "SUBMITTED" || newStatus === "ACCEPTED";
  if (item.done !== shouldBeDone) {
    await prisma.taskChecklistItem.update({
      where: { id: item.id },
      data: { done: shouldBeDone },
    });
  }

  // Update parent task status
  await updateTaskStatusFromChecklist(item.taskId);
}

/**
 * If all checklist items are done → task DONE.
 * If any are unchecked → task OPEN (unless already IN_PROGRESS).
 */
async function updateTaskStatusFromChecklist(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { status: true, reportTypeId: true, checklistItems: { select: { done: true } } },
  });
  if (!task || !task.reportTypeId) return; // only for report tasks

  const allDone = task.checklistItems.length > 0 && task.checklistItems.every((ci) => ci.done);

  if (allDone && task.status !== "DONE") {
    await prisma.task.update({ where: { id: taskId }, data: { status: "DONE" } });
  } else if (!allDone && task.status === "DONE") {
    await prisma.task.update({ where: { id: taskId }, data: { status: "OPEN" } });
  }
}

/**
 * Legacy compat — called from tasks route when task status changes.
 * For grouped report tasks: if task → DONE, mark all checklist entries as SUBMITTED.
 * If task reopened, mark all as NOT_SUBMITTED.
 */
export async function syncTaskToEntries(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      status: true,
      reportTypeId: true,
      checklistItems: { select: { id: true, reportEntryId: true } },
    },
  });
  if (!task?.reportTypeId) return;

  const entryIds = task.checklistItems
    .map((ci) => ci.reportEntryId)
    .filter((id): id is string => id != null);
  if (entryIds.length === 0) return;

  if (task.status === "DONE") {
    await prisma.reportEntry.updateMany({
      where: { id: { in: entryIds }, status: "NOT_SUBMITTED" },
      data: { status: "SUBMITTED", filedAt: new Date() },
    });
    await prisma.taskChecklistItem.updateMany({
      where: { taskId, done: false },
      data: { done: true },
    });
  } else if (task.status === "OPEN" || task.status === "IN_PROGRESS") {
    await prisma.reportEntry.updateMany({
      where: { id: { in: entryIds }, status: "SUBMITTED" },
      data: { status: "NOT_SUBMITTED", filedAt: null },
    });
    await prisma.taskChecklistItem.updateMany({
      where: { taskId, done: true },
      data: { done: false },
    });
  }
}

// ─── Cron ───

export function startReportTaskGenerator(): void {
  setTimeout(async () => {
    try {
      const count = await generateReportTasks();
      if (count > 0)
        console.log(`[report-task-generator] Created ${count} report tasks on startup`);
    } catch (err) {
      console.error("[report-task-generator] Startup run failed:", err);
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
        const count = await generateReportTasks();
        if (count > 0) console.log(`[report-task-generator] Created ${count} report tasks`);
      } catch (err) {
        console.error("[report-task-generator] Daily run failed:", err);
      }
      scheduleNext();
    }, ms);
  }

  scheduleNext();
  console.log("[report-task-generator] Scheduled daily at 00:05");
}
