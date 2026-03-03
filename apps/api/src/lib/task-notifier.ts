/**
 * Task notification helpers:
 * - notifyAssigned()       — instant message when a task is assigned
 * - startDeadlineReminder() — runs every 30 min, reminds 24 h before due date
 * - startDailyNotifier()   — daily digest at 09:00
 */

import prisma from "./prisma.js";
import { sendMessage } from "./telegram.js";
import { createNotification } from "./notify.js";

const REMINDER_HOURS = 24; // remind when dueDate is within this many hours

// ─── Instant: assignment notification ────────────────────────────────────────

const PRIORITY_LABEL: Record<string, string> = {
  LOW: "🔵 Низкий",
  MEDIUM: "🟡 Средний",
  HIGH: "🟠 Высокий",
  URGENT: "🔴 Срочный",
};

const CATEGORY_LABEL: Record<string, string> = {
  REPORTING: "📊 Отчётность",
  DOCUMENTS: "📄 Документы",
  PAYMENT: "💰 Оплата",
  OTHER: "📝 Прочее",
};

export async function notifyAssigned(task: {
  title: string;
  description?: string | null;
  priority: string;
  category: string;
  dueDate: Date | null;
  assignedToId: string;
  organization?: { name: string } | null;
  assignedBy?: { firstName: string; lastName: string } | null;
}): Promise<void> {
  const binding = await prisma.telegramBinding.findUnique({
    where: { userId: task.assignedToId },
  });
  if (!binding?.chatId) return;

  const lines: string[] = [`📌 <b>Вам назначена задача</b>`, "", `<b>${task.title}</b>`];

  if (task.organization) lines.push(`🏢 ${task.organization.name}`);
  if (task.dueDate) lines.push(`📅 Срок: <b>${task.dueDate.toLocaleDateString("ru-RU")}</b>`);

  lines.push(`⚡ ${PRIORITY_LABEL[task.priority] ?? task.priority}`);
  lines.push(`🗂 ${CATEGORY_LABEL[task.category] ?? task.category}`);

  if (task.assignedBy) {
    lines.push(`👤 Назначил: ${task.assignedBy.firstName} ${task.assignedBy.lastName}`);
  }

  if (task.description?.trim()) {
    const desc = task.description.trim().slice(0, 300);
    lines.push("", `<i>${desc}${task.description.length > 300 ? "…" : ""}</i>`);
  }

  await sendMessage(binding.chatId, lines.join("\n"));
}

// ─── Periodic: deadline reminder (every 30 min) ───────────────────────────────

export function startDeadlineReminder(): void {
  checkDeadlines().catch(console.error);
  setInterval(() => checkDeadlines().catch(console.error), 30 * 60 * 1000);
  console.log(`[Notifier] Deadline reminder started (every 30 min, window: ${REMINDER_HOURS}h)`);
}

async function checkDeadlines(): Promise<void> {
  const now = new Date();
  const threshold = new Date(now.getTime() + REMINDER_HOURS * 60 * 60 * 1000);

  const tasks = await prisma.task.findMany({
    where: {
      status: { notIn: ["DONE", "CANCELLED"] },
      dueDate: { gt: now, lte: threshold },
      reminderSentAt: null,
    },
    include: {
      organization: { select: { name: true } },
      assignees: { select: { userId: true } },
    },
  });

  if (tasks.length === 0) return;

  // Collect unique recipient IDs: all assignees, or creator if none
  const recipientIds = [
    ...new Set(
      tasks.flatMap((t) =>
        t.assignees.length > 0 ? t.assignees.map((a) => a.userId) : [t.createdById],
      ),
    ),
  ];

  const bindings = await prisma.telegramBinding.findMany({
    where: { userId: { in: recipientIds }, chatId: { not: null } },
  });
  const bindingMap = new Map(bindings.map((b) => [b.userId, b.chatId!]));

  for (const task of tasks) {
    const recipients =
      task.assignees.length > 0 ? task.assignees.map((a) => a.userId) : [task.createdById];
    const hoursLeft = Math.round((task.dueDate!.getTime() - now.getTime()) / (60 * 60 * 1000));
    const due = task.dueDate!.toLocaleDateString("ru-RU");
    const org = task.organization ? ` · ${task.organization.name}` : "";
    const taskLink = task.organizationId ? `/organizations/${task.organizationId}` : "/tasks";

    let notified = false;
    for (const recipientId of recipients) {
      const chatId = bindingMap.get(recipientId);
      if (!chatId) continue;

      await sendMessage(
        chatId,
        `⏰ <b>Скоро дедлайн!</b>\n\n${task.title}${org}\n📅 Срок: <b>${due}</b> (через ~${hoursLeft} ч.)`,
      );
      await createNotification(
        recipientId,
        "deadline_soon",
        "⏰ Скоро дедлайн",
        `${task.title}${org} — ${due}`,
        taskLink,
      );
      notified = true;
    }

    if (notified) {
      await prisma.task.update({
        where: { id: task.id },
        data: { reminderSentAt: new Date() },
      });
    }
  }
}

// ─── Periodic: escalation to managers when tasks become overdue ───────────────

export function startEscalationNotifier(): void {
  checkEscalations().catch(console.error);
  setInterval(() => checkEscalations().catch(console.error), 60 * 60 * 1000);
  console.log("[Notifier] Escalation notifier started (every 60 min)");
}

async function checkEscalations(): Promise<void> {
  const now = new Date();

  const tasks = await prisma.task.findMany({
    where: {
      status: { notIn: ["DONE", "CANCELLED"] },
      dueDate: { lt: now },
      escalatedAt: null,
    },
    include: {
      organization: { select: { id: true, name: true } },
      assignees: { include: { user: { select: { firstName: true, lastName: true } } } },
    },
  });

  if (tasks.length === 0) return;

  // Find all active managers and admins
  const managers = await prisma.user.findMany({
    where: {
      isActive: true,
      userRoles: { some: { role: { name: { in: ["admin", "manager"] } } } },
    },
    include: { telegramBinding: { select: { chatId: true } } },
  });

  if (managers.length === 0) return;

  const lines: string[] = [`🚨 <b>Просроченные задачи (${tasks.length})</b>`, ""];

  for (const task of tasks) {
    const daysOverdue = Math.floor(
      (now.getTime() - task.dueDate!.getTime()) / (1000 * 60 * 60 * 24),
    );
    const org = task.organization ? ` · ${task.organization.name}` : "";
    const assignees =
      task.assignees.length > 0
        ? ` 👤 ${task.assignees.map((a) => `${a.user.lastName} ${a.user.firstName}`).join(", ")}`
        : "";
    const overdueTxt = daysOverdue === 0 ? "сегодня" : `${daysOverdue} дн.`;
    lines.push(`• <b>${task.title}</b>${org} — просрочено ${overdueTxt}${assignees}`);
  }

  for (const manager of managers) {
    if (manager.telegramBinding?.chatId) {
      await sendMessage(manager.telegramBinding.chatId, lines.join("\n"));
    }
    await createNotification(
      manager.id,
      "escalation",
      `🚨 Просроченные задачи (${tasks.length})`,
      tasks
        .map((t) => t.title)
        .join(", ")
        .slice(0, 200),
      "/tasks",
    );
  }

  // Mark all escalated
  await prisma.task.updateMany({
    where: { id: { in: tasks.map((t) => t.id) } },
    data: { escalatedAt: now },
  });
}

// ─── Daily digest at 09:00 ───────────────────────────────────────────────────

export function startDailyNotifier(): void {
  scheduleNextRun();
  console.log("[Notifier] Daily task notifier scheduled");
}

function scheduleNextRun(): void {
  const now = new Date();
  const next = new Date(now);
  next.setHours(9, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);

  const delay = next.getTime() - now.getTime();
  setTimeout(() => {
    sendDailyDigest().catch(console.error);
    setInterval(() => sendDailyDigest().catch(console.error), 24 * 60 * 60 * 1000);
  }, delay);
}

async function sendDailyDigest(): Promise<void> {
  console.log("[Notifier] Sending daily digest...");
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const tomorrowEnd = new Date(now);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  tomorrowEnd.setHours(23, 59, 59, 999);

  const bindings = await prisma.telegramBinding.findMany({
    where: { chatId: { not: null } },
    include: { user: { select: { firstName: true } } },
  });

  for (const binding of bindings) {
    const tasks = await prisma.task.findMany({
      where: {
        status: { notIn: ["DONE", "CANCELLED"] },
        OR: [
          { assignees: { some: { userId: binding.userId } } },
          { assignees: { none: {} }, createdById: binding.userId },
        ],
        dueDate: { not: null, lte: tomorrowEnd },
      },
      include: { organization: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
    });

    if (tasks.length === 0) continue;

    const overdue = tasks.filter((t) => t.dueDate! < now);
    const dueToday = tasks.filter((t) => t.dueDate! >= now && t.dueDate! <= todayEnd);
    const dueTomorrow = tasks.filter((t) => t.dueDate! > todayEnd && t.dueDate! <= tomorrowEnd);

    const lines: string[] = [
      `<b>📋 Задачи — ${binding.user.firstName}</b>`,
      `<i>${new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</i>`,
      "",
    ];

    if (overdue.length) {
      lines.push("🔴 <b>Просрочено:</b>");
      for (const t of overdue) {
        const org = t.organization ? ` · ${t.organization.name}` : "";
        const date = t.dueDate ? ` (${t.dueDate.toLocaleDateString("ru-RU")})` : "";
        lines.push(`  • ${t.title}${org}${date}`);
      }
      lines.push("");
    }

    if (dueToday.length) {
      lines.push("🟡 <b>Сегодня:</b>");
      for (const t of dueToday) {
        const org = t.organization ? ` · ${t.organization.name}` : "";
        lines.push(`  • ${t.title}${org}`);
      }
      lines.push("");
    }

    if (dueTomorrow.length) {
      lines.push("🟢 <b>Завтра:</b>");
      for (const t of dueTomorrow) {
        const org = t.organization ? ` · ${t.organization.name}` : "";
        lines.push(`  • ${t.title}${org}`);
      }
    }

    await sendMessage(binding.chatId!, lines.join("\n"));
  }
}
