import prisma from "./prisma.js";

export type NotificationGroup = "org" | "section" | "task" | "ticket" | "misc";

export type NotificationTypeDef = {
  type: string;
  label: string;
  group: NotificationGroup;
  defaultEnabled: boolean;
};

/**
 * All user-toggleable notification types.
 * System-level alerts (admin_login, account_deactivated) are NOT listed here
 * and cannot be disabled.
 */
export const NOTIFICATION_TYPES: NotificationTypeDef[] = [
  // Организации
  {
    type: "org_added_to_section",
    label: "Добавлена на участок",
    group: "org",
    defaultEnabled: true,
  },
  { type: "org_status_changed", label: "Изменён статус", group: "org", defaultEnabled: true },
  {
    type: "org_payment_changed",
    label: "Изменена сумма оплаты",
    group: "org",
    defaultEnabled: true,
  },
  {
    type: "org_member_assigned",
    label: "Назначен ответственным",
    group: "org",
    defaultEnabled: true,
  },
  { type: "org_member_removed", label: "Снят с организации", group: "org", defaultEnabled: true },

  // Участки
  {
    type: "section_member_added",
    label: "Добавлен на участок",
    group: "section",
    defaultEnabled: true,
  },
  {
    type: "section_member_removed",
    label: "Снят с участка",
    group: "section",
    defaultEnabled: true,
  },

  // Задачи
  { type: "task_assigned", label: "Назначена задача", group: "task", defaultEnabled: true },
  { type: "task_due_changed", label: "Изменён срок задачи", group: "task", defaultEnabled: true },
  { type: "deadline_soon", label: "Напоминание за 24ч", group: "task", defaultEnabled: true },
  {
    type: "task_daily_digest",
    label: "Ежедневный дайджест 09:00",
    group: "task",
    defaultEnabled: true,
  },
  {
    type: "escalation",
    label: "Эскалация просрочки (для менеджеров)",
    group: "task",
    defaultEnabled: true,
  },
  {
    type: "task_status_changed",
    label: "Изменение статуса задачи",
    group: "task",
    defaultEnabled: false,
  },
  {
    type: "task_updated",
    label: "Прочие изменения задачи (название/описание/приоритет/исполнители)",
    group: "task",
    defaultEnabled: false,
  },
  {
    type: "task_comment",
    label: "Новый комментарий к задаче",
    group: "task",
    defaultEnabled: false,
  },
  {
    type: "task_checklist_changed",
    label: "Изменения чек-листа",
    group: "task",
    defaultEnabled: false,
  },

  // Тикеты
  { type: "ticket_new", label: "Новый тикет", group: "ticket", defaultEnabled: true },
  {
    type: "ticket_message",
    label: "Новое сообщение в тикете",
    group: "ticket",
    defaultEnabled: true,
  },
  { type: "ticket_status", label: "Смена статуса тикета", group: "ticket", defaultEnabled: true },
  { type: "ticket_escalated", label: "Эскалация тикета", group: "ticket", defaultEnabled: true },

  // Разное
  { type: "reporting_deadline", label: "Дедлайн отчётности", group: "misc", defaultEnabled: true },
  { type: "announcement", label: "Новое объявление", group: "misc", defaultEnabled: true },
];

export const GROUP_LABELS: Record<NotificationGroup, string> = {
  org: "Организации",
  section: "Участки",
  task: "Задачи",
  ticket: "Тикеты",
  misc: "Разное",
};

const DEFAULTS: Record<string, boolean> = Object.fromEntries(
  NOTIFICATION_TYPES.map((t) => [t.type, t.defaultEnabled]),
);

const KNOWN_TYPES = new Set(NOTIFICATION_TYPES.map((t) => t.type));

/**
 * Check if a notification type is enabled for a user.
 * Unknown types (system alerts) always return true — they are not user-toggleable.
 */
export async function isNotificationEnabled(userId: string, type: string): Promise<boolean> {
  if (!KNOWN_TYPES.has(type)) return true;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationPreferences: true },
  });
  const prefs = (user?.notificationPreferences ?? {}) as Record<string, boolean>;
  if (Object.prototype.hasOwnProperty.call(prefs, type)) return prefs[type];
  return DEFAULTS[type] ?? true;
}

/**
 * Get full preference map for a user, with defaults filled in for unset keys.
 */
export async function getFullPreferences(userId: string): Promise<Record<string, boolean>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationPreferences: true },
  });
  const prefs = (user?.notificationPreferences ?? {}) as Record<string, boolean>;
  const result: Record<string, boolean> = {};
  for (const t of NOTIFICATION_TYPES) {
    result[t.type] = Object.prototype.hasOwnProperty.call(prefs, t.type)
      ? prefs[t.type]
      : t.defaultEnabled;
  }
  return result;
}

/**
 * Update preferences for a user. Ignores unknown type keys.
 */
export async function updatePreferences(
  userId: string,
  updates: Record<string, boolean>,
): Promise<Record<string, boolean>> {
  const current = await getFullPreferences(userId);
  const next: Record<string, boolean> = { ...current };
  for (const [key, value] of Object.entries(updates)) {
    if (KNOWN_TYPES.has(key) && typeof value === "boolean") {
      next[key] = value;
    }
  }
  await prisma.user.update({
    where: { id: userId },
    data: { notificationPreferences: next },
  });
  return next;
}
