import type { Prisma } from "@prisma/client";

/**
 * Централизованный data-scoping по ролям (см. CLAUDE.md «Role-based data scoping»).
 *
 * Инварианты:
 * - admin и supervisor видят всё — ОБА в `{}`-ветке (забытый supervisor — известный баг);
 * - manager/accountant — организации своих участков (SectionMember);
 * - client — только свои организации (OrganizationMember).
 */

function isAdminLike(roles: string[]): boolean {
  return roles.includes("admin") || roles.includes("supervisor");
}

function isStaffScoped(roles: string[]): boolean {
  return roles.includes("manager") || roles.includes("accountant");
}

/** Strict scope организаций — только свои участки. Для write-операций (PUT/DELETE). */
export function orgStrictScope(userId: string, roles: string[]): Prisma.OrganizationWhereInput {
  if (isAdminLike(roles)) return {};
  if (isStaffScoped(roles)) {
    return { section: { members: { some: { userId } } } };
  }
  return { members: { some: { userId } } };
}

/**
 * View scope организаций — свои участки ПЛЮС организации клиентских групп,
 * где есть хотя бы одна организация с участков пользователя. Для GET list/detail.
 */
export function orgViewScope(userId: string, roles: string[]): Prisma.OrganizationWhereInput {
  if (isAdminLike(roles)) return {};
  if (isStaffScoped(roles)) {
    return {
      OR: [
        { section: { members: { some: { userId } } } },
        {
          clientGroupId: { not: null },
          clientGroup: {
            organizations: {
              some: { section: { members: { some: { userId } } } },
            },
          },
        },
      ],
    };
  }
  return { members: { some: { userId } } };
}

/** Scope участков: staff видит свои, клиент — ничего (нет membership в Section). */
export function sectionScope(userId: string, roles: string[]): Prisma.SectionWhereInput {
  if (isAdminLike(roles)) return {};
  return { members: { some: { userId } } };
}

/** Scope тикетов: через организацию тикета. */
export function ticketScope(userId: string, roles: string[]): Prisma.TicketWhereInput {
  if (isAdminLike(roles)) return {};
  if (isStaffScoped(roles)) {
    return { organization: { section: { members: { some: { userId } } } } };
  }
  // client
  return { organization: { members: { some: { userId, role: "client" } } } };
}

/**
 * Scope задач: кросс-организационный (участки) + личные задачи без организации
 * (создатель или исполнитель). Клиент — только свои созданные/назначенные.
 */
export function taskScope(userId: string, roles: string[]): Prisma.TaskWhereInput {
  if (isAdminLike(roles)) return {};
  if (isStaffScoped(roles)) {
    return {
      OR: [
        { organization: { section: { members: { some: { userId } } } } },
        {
          AND: [
            { organizationId: null },
            { OR: [{ createdById: userId }, { assignees: { some: { userId } } }] },
          ],
        },
      ],
    };
  }
  return { OR: [{ createdById: userId }, { assignees: { some: { userId } } }] };
}
