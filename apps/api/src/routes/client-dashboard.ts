import { Router } from "express";
import prisma from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import {
  computeOrgStatus,
  daysBetween,
  worse,
  type Action,
  type OrgStatus,
} from "../lib/client-dashboard.js";

const router = Router();

type FeedItem = {
  id: string;
  kind: "task_done" | "ticket_status";
  title: string;
  actor: string | null;
  at: string;
};

router.get("/", authenticate, requireRole("client"), async (req, res) => {
  try {
    const userId = req.user!.userId;

    // 1) Find all orgs the client is a member of.
    const memberships = await prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true },
    });
    const orgIds = memberships.map((m) => m.organizationId);

    if (orgIds.length === 0) {
      res.json({ organizations: [], group: null });
      return;
    }

    const orgs = await prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: {
        id: true,
        name: true,
        debtAmount: true,
        clientGroupId: true,
        clientGroup: { select: { id: true, name: true } },
      },
    });

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const organizations = await Promise.all(
      orgs.map(async (org) => {
        const [
          tickets,
          paymentPeriods,
          nextDeadlineTask,
          doneTasks,
          recentTickets,
          openTicketCount,
          hasOverdueTaskCount,
        ] = await Promise.all([
          prisma.ticket.findMany({
            where: {
              organizationId: org.id,
              status: { in: ["NEW", "WAITING_CLIENT"] },
            },
            select: { id: true, number: true, subject: true, type: true, status: true },
          }),
          prisma.paymentPeriod.findMany({
            where: {
              organizationId: org.id,
              status: { in: ["OVERDUE", "PARTIAL"] },
            },
            select: { id: true, year: true, month: true, debtAmount: true, status: true },
          }),
          prisma.task.findFirst({
            where: {
              organizationId: org.id,
              visibleToClient: true,
              status: { not: "DONE" },
              dueDate: { gte: now },
            },
            orderBy: { dueDate: "asc" },
            select: { id: true, title: true, dueDate: true },
          }),
          prisma.task.findMany({
            where: {
              organizationId: org.id,
              visibleToClient: true,
              status: "DONE",
              completedAt: { not: null },
            },
            orderBy: { completedAt: "desc" },
            take: 10,
            select: {
              id: true,
              title: true,
              completedAt: true,
              createdBy: { select: { firstName: true, lastName: true } },
            },
          }),
          prisma.ticket.findMany({
            where: {
              organizationId: org.id,
              status: { in: ["CLOSED", "REOPENED"] },
              updatedAt: { gte: thirtyDaysAgo },
            },
            orderBy: { updatedAt: "desc" },
            take: 10,
            select: { id: true, number: true, status: true, updatedAt: true },
          }),
          prisma.ticket.count({
            where: { organizationId: org.id, status: { not: "CLOSED" } },
          }),
          prisma.task.count({
            where: {
              organizationId: org.id,
              visibleToClient: true,
              status: { not: "DONE" },
              dueDate: { lt: now },
            },
          }),
        ]);

        // Build actions
        const actions: Action[] = [];
        for (const t of tickets) {
          if (t.type === "DOCUMENT_REQUEST") {
            actions.push({
              type: "document_request",
              title: `Загрузить документ: ${t.subject}`,
              dueAt: null, // Ticket has no dueDate field; keep null.
              link: `/tickets/${t.id}`,
            });
          } else if (t.status === "WAITING_CLIENT") {
            actions.push({
              type: "ticket_waiting",
              title: `Ответить на обращение #${t.number}`,
              dueAt: null,
              link: `/tickets/${t.id}`,
            });
          }
        }
        for (const p of paymentPeriods) {
          actions.push({
            type: "payment_overdue",
            title: `Оплатить ${monthLabel(p.year, p.month)} — ${Number(p.debtAmount).toLocaleString("ru-RU")} ₽`,
            dueAt: null,
            link: `/my-payments`,
          });
        }
        // sort: items with dueAt asc, nulls last
        actions.sort((a, b) => {
          if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
          if (a.dueAt) return -1;
          if (b.dueAt) return 1;
          return 0;
        });

        const { status } = computeOrgStatus({
          actions,
          hasOverdueTask: hasOverdueTaskCount > 0,
        });

        const nextDeadline = nextDeadlineTask?.dueDate
          ? {
              date: nextDeadlineTask.dueDate.toISOString(),
              label: nextDeadlineTask.title,
              daysUntil: daysBetween(now, nextDeadlineTask.dueDate),
            }
          : null;

        // Build feed
        const feed: FeedItem[] = [
          ...doneTasks
            .filter((t) => t.completedAt)
            .map(
              (t): FeedItem => ({
                id: `task_${t.id}`,
                kind: "task_done",
                title: t.title,
                actor: t.createdBy
                  ? `${t.createdBy.firstName} ${t.createdBy.lastName.charAt(0)}.`
                  : null,
                at: t.completedAt!.toISOString(),
              }),
            ),
          ...recentTickets.map(
            (t): FeedItem => ({
              id: `ticket_${t.id}`,
              kind: "ticket_status",
              title:
                t.status === "CLOSED"
                  ? `Тикет #${t.number} закрыт`
                  : `Тикет #${t.number} переоткрыт`,
              actor: null,
              at: t.updatedAt.toISOString(),
            }),
          ),
        ]
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, 10);

        return {
          id: org.id,
          name: org.name,
          status,
          actions,
          summary: {
            debt: Number(org.debtAmount ?? 0),
            nextDeadline,
            openTickets: openTicketCount,
          },
          feed,
        };
      }),
    );

    // Group aggregation: only when multiple orgs (with or without formal ClientGroup)
    let group: { id: string; name: string; aggregateStatus: OrgStatus; totalDebt: number } | null =
      null;
    if (organizations.length > 1) {
      const aggregateStatus = organizations.reduce<OrgStatus>(
        (acc, o) => worse(acc, o.status as OrgStatus),
        "ok",
      );
      const totalDebt = organizations.reduce((sum, o) => sum + o.summary.debt, 0);

      const groupedOrgs = orgs.filter((o) => o.clientGroupId);
      const sharedGroupId =
        groupedOrgs.length > 0 &&
        groupedOrgs.every((o) => o.clientGroupId === groupedOrgs[0].clientGroupId)
          ? groupedOrgs[0].clientGroupId
          : null;

      if (sharedGroupId && groupedOrgs[0].clientGroup) {
        group = {
          id: groupedOrgs[0].clientGroup.id,
          name: groupedOrgs[0].clientGroup.name,
          aggregateStatus,
          totalDebt,
        };
      } else {
        group = { id: "virtual", name: "Мои организации", aggregateStatus, totalDebt };
      }
    }

    res.json({ organizations, group });
  } catch (err) {
    console.error("client-dashboard error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

function monthLabel(year: number, month: number): string {
  const months = [
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
  return `${months[month - 1]} ${year}`;
}

export default router;
