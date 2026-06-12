import prisma from "../../lib/prisma.js";
import { taskScope, orgStrictScope, orgViewScope } from "../../lib/scoping.js";
import { notifyWithTelegram } from "../../lib/notify.js";

const ASSIGNEE_SELECT = { id: true, firstName: true, lastName: true };

export const INCLUDE = {
  organization: { select: { id: true, name: true } },
  reportType: { select: { id: true, name: true, code: true } },
  assignees: { include: { user: { select: ASSIGNEE_SELECT } } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  checklistItems: { select: { done: true }, orderBy: { position: "asc" as const } },
  _count: { select: { comments: true } },
};

export const COMMENT_AUTHOR_SELECT = { id: true, firstName: true, lastName: true };

export function isAdminOrManager(roles: string[]) {
  return roles.some((r) => ["admin", "supervisor", "manager"].includes(r));
}

/**
 * Все ли организации из списка существуют и входят в strict-скоуп пользователя?
 * Без этой проверки body.organizationId(s) позволяет вешать задачи на чужие организации.
 */
export async function allOrgsAccessible(
  userId: string,
  roles: string[],
  orgIds: (string | null | undefined)[],
): Promise<boolean> {
  const ids = [...new Set(orgIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return true;
  const found = await prisma.organization.findMany({
    where: { id: { in: ids }, ...orgStrictScope(userId, roles) },
    select: { id: true },
  });
  return found.length === ids.length;
}

/**
 * Видна ли организация пользователю (view-скоуп — включает орги клиентских
 * групп, содержащих орги его участков). Для ЧТЕНИЯ задач по ?organizationId:
 * раз карточка организации видна, её задачи тоже должны открываться.
 * Для записи (создание/перенос задач) остаётся строгий allOrgsAccessible.
 */
export async function orgVisible(userId: string, roles: string[], orgId: string): Promise<boolean> {
  const found = await prisma.organization.findFirst({
    where: { id: orgId, ...orgViewScope(userId, roles) },
    select: { id: true },
  });
  return Boolean(found);
}

/**
 * Загрузить задачу для подроутов (delete, comments, checklist): задача должна
 * входить в taskScope пользователя либо он её создатель/исполнитель — иначе
 * по прямому id доступны задачи чужих участков.
 */
export async function findTaskInScope(id: string, userId: string, roles: string[]) {
  return prisma.task.findFirst({
    where: {
      id,
      OR: [taskScope(userId, roles), { createdById: userId }, { assignees: { some: { userId } } }],
    },
  });
}

/**
 * Collect notification recipients for a task event: current assignees + creator,
 * minus the actor (author of the change) and minus users in `excludeUserIds`.
 */
async function getTaskRecipients(
  taskId: string,
  actorUserId: string,
  excludeUserIds: string[] = [],
): Promise<{ ids: string[]; taskTitle: string; orgId: string | null }> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      title: true,
      organizationId: true,
      createdById: true,
      assignees: { select: { userId: true } },
    },
  });
  if (!task) return { ids: [], taskTitle: "", orgId: null };
  const exclude = new Set([actorUserId, ...excludeUserIds]);
  const ids = new Set<string>();
  if (task.createdById) ids.add(task.createdById);
  for (const a of task.assignees) ids.add(a.userId);
  for (const id of exclude) ids.delete(id);
  return { ids: Array.from(ids), taskTitle: task.title, orgId: task.organizationId };
}

/** Notify recipients about a task change/comment. */
export async function notifyTaskRecipients(
  taskId: string,
  actorUserId: string,
  type: string,
  title: string,
  body: string,
  telegramText: string,
  excludeUserIds: string[] = [],
): Promise<void> {
  const { ids, orgId } = await getTaskRecipients(taskId, actorUserId, excludeUserIds);
  if (ids.length === 0) return;
  const link = orgId ? `/organizations/${orgId}` : "/tasks";
  await Promise.all(
    ids.map((uid) => notifyWithTelegram(uid, type, title, body, link, telegramText)),
  );
}

export function calcNextDue(from: Date, type: string, interval: number): Date {
  const d = new Date(from);
  switch (type) {
    case "DAILY":
      d.setDate(d.getDate() + interval);
      break;
    case "WEEKLY":
      d.setDate(d.getDate() + interval * 7);
      break;
    case "MONTHLY":
      d.setMonth(d.getMonth() + interval);
      break;
    case "YEARLY":
      d.setFullYear(d.getFullYear() + interval);
      break;
  }
  return d;
}
