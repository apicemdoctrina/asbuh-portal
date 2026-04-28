import { sendEmail } from "./mailer.js";
import { isNotificationEnabled } from "./notification-prefs.js";
import prisma from "./prisma.js";

const APP_URL = process.env.APP_URL || "https://app.asbuh.com";

const BASE_STYLES = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  max-width: 560px;
  margin: 0 auto;
  color: #1e293b;
  line-height: 1.5;
`;

function wrap(content: string, footer?: string): string {
  return `
    <div style="${BASE_STYLES}">
      <div style="background:linear-gradient(135deg,#6567F1,#5557E1);padding:20px;border-radius:12px 12px 0 0;color:#fff">
        <h2 style="margin:0;font-size:20px">ASBUH</h2>
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px">
        ${content}
      </div>
      <p style="margin-top:16px;color:#94a3b8;font-size:12px;text-align:center">
        ${footer ?? `Управлять уведомлениями: <a href="${APP_URL}/profile" style="color:#6567F1">в профиле</a>`}
      </p>
    </div>
  `;
}

function ctaButton(url: string, label: string): string {
  return `
    <p style="margin:24px 0">
      <a href="${url}"
         style="display:inline-block;padding:12px 24px;background:#6567F1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
        ${label}
      </a>
    </p>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function getClientUserIdsForOrg(organizationId: string): Promise<string[]> {
  const members = await prisma.organizationMember.findMany({
    where: { organizationId, role: "client", user: { isActive: true } },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

// ==================== Triggered emails ====================

export async function sendDocRequestEmail(
  userId: string,
  args: {
    ticketId: string;
    ticketNumber: number;
    subject: string;
    organizationName: string;
  },
): Promise<void> {
  if (!(await isNotificationEnabled(userId, "email_doc_request"))) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return;

  const url = `${APP_URL}/my-documents`;
  const html = wrap(`
    <h3 style="margin:0 0 12px 0;color:#1e293b">У вас новый запрос документа</h3>
    <p style="margin:0 0 8px 0;color:#475569">Организация: <strong>${escapeHtml(args.organizationName)}</strong></p>
    <p style="margin:0 0 8px 0;color:#475569">Что нужно: <strong>${escapeHtml(args.subject)}</strong></p>
    ${ctaButton(url, "Загрузить документ")}
    <p style="color:#64748b;font-size:13px">Чем быстрее загрузите, тем спокойнее вашему бухгалтеру.</p>
  `);

  try {
    await sendEmail(user.email, `Запрос документа: ${args.subject}`, html);
  } catch (err) {
    console.error("[client-email] sendDocRequestEmail failed:", err);
  }
}

export async function sendTicketReplyEmail(
  userId: string,
  args: {
    ticketId: string;
    ticketNumber: number;
    subject: string;
    authorName: string;
    bodyPreview: string;
  },
): Promise<void> {
  if (!(await isNotificationEnabled(userId, "email_ticket_reply"))) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return;

  const url = `${APP_URL}/tickets/${args.ticketId}`;
  const preview =
    args.bodyPreview.length > 200 ? args.bodyPreview.slice(0, 200) + "…" : args.bodyPreview;
  const html = wrap(`
    <h3 style="margin:0 0 12px 0;color:#1e293b">Ответ по обращению #${args.ticketNumber}</h3>
    <p style="margin:0 0 8px 0;color:#475569"><strong>${escapeHtml(args.subject)}</strong></p>
    <div style="margin:16px 0;padding:12px 16px;background:#f8fafc;border-left:3px solid #6567F1;border-radius:4px;color:#475569;font-size:14px">
      <p style="margin:0 0 4px 0;color:#64748b;font-size:12px">${escapeHtml(args.authorName)} пишет:</p>
      <p style="margin:0;white-space:pre-wrap">${escapeHtml(preview)}</p>
    </div>
    ${ctaButton(url, "Открыть тикет")}
  `);

  try {
    await sendEmail(user.email, `Ответ по обращению #${args.ticketNumber}`, html);
  } catch (err) {
    console.error("[client-email] sendTicketReplyEmail failed:", err);
  }
}

// ==================== Weekly digest ====================

type DigestSection = {
  orgName: string;
  doneTasks: { title: string }[];
  openDocRequests: { subject: string }[];
  upcomingDeadlines: { title: string; dueDate: Date }[];
  debt: number;
};

export async function buildWeeklyDigestForClient(userId: string): Promise<DigestSection[] | null> {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    select: { organizationId: true },
  });
  const orgIds = memberships.map((m) => m.organizationId);
  if (orgIds.length === 0) return null;

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const inTwoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const orgs = await prisma.organization.findMany({
    where: { id: { in: orgIds } },
    select: { id: true, name: true, debtAmount: true },
  });

  const sections: DigestSection[] = [];
  for (const org of orgs) {
    const [doneTasks, openDocRequests, upcomingDeadlines] = await Promise.all([
      prisma.task.findMany({
        where: {
          organizationId: org.id,
          visibleToClient: true,
          status: "DONE",
          completedAt: { gte: weekAgo },
        },
        select: { title: true },
        take: 10,
      }),
      prisma.ticket.findMany({
        where: {
          organizationId: org.id,
          type: "DOCUMENT_REQUEST",
          status: { in: ["NEW", "WAITING_CLIENT"] },
        },
        select: { subject: true },
        take: 10,
      }),
      prisma.task.findMany({
        where: {
          organizationId: org.id,
          visibleToClient: true,
          status: { not: "DONE" },
          dueDate: { gte: now, lte: inTwoWeeks },
        },
        orderBy: { dueDate: "asc" },
        select: { title: true, dueDate: true },
        take: 5,
      }),
    ]);

    sections.push({
      orgName: org.name,
      doneTasks,
      openDocRequests,
      upcomingDeadlines: upcomingDeadlines
        .filter((t): t is { title: string; dueDate: Date } => t.dueDate !== null)
        .map((t) => ({ title: t.title, dueDate: t.dueDate })),
      debt: Number(org.debtAmount ?? 0),
    });
  }

  // Skip if all sections are empty (nothing to report)
  const hasContent = sections.some(
    (s) =>
      s.doneTasks.length > 0 ||
      s.openDocRequests.length > 0 ||
      s.upcomingDeadlines.length > 0 ||
      s.debt > 0,
  );
  if (!hasContent) return null;

  return sections;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function renderDigestSection(s: DigestSection): string {
  const blocks: string[] = [];

  if (s.doneTasks.length > 0) {
    const items = s.doneTasks.map((t) => `<li>${escapeHtml(t.title)}</li>`).join("");
    blocks.push(`
      <p style="margin:12px 0 4px 0;font-weight:600;color:#1e293b">✓ Сделано за неделю</p>
      <ul style="margin:0 0 12px 0;padding-left:20px;color:#475569">${items}</ul>
    `);
  }
  if (s.openDocRequests.length > 0) {
    const items = s.openDocRequests.map((t) => `<li>${escapeHtml(t.subject)}</li>`).join("");
    blocks.push(`
      <p style="margin:12px 0 4px 0;font-weight:600;color:#b45309">⚠ Ждём от вас</p>
      <ul style="margin:0 0 12px 0;padding-left:20px;color:#475569">${items}</ul>
    `);
  }
  if (s.upcomingDeadlines.length > 0) {
    const items = s.upcomingDeadlines
      .map(
        (t) =>
          `<li>${escapeHtml(t.title)} — <span style="color:#64748b">${formatDate(t.dueDate)}</span></li>`,
      )
      .join("");
    blocks.push(`
      <p style="margin:12px 0 4px 0;font-weight:600;color:#1e293b">🗓 Ближайшие дедлайны</p>
      <ul style="margin:0 0 12px 0;padding-left:20px;color:#475569">${items}</ul>
    `);
  }
  if (s.debt > 0) {
    blocks.push(`
      <p style="margin:12px 0;color:#b91c1c"><strong>💳 Задолженность:</strong> ${s.debt.toLocaleString("ru-RU")} ₽</p>
    `);
  }

  return `
    <div style="margin-bottom:20px;padding:16px;background:#f8fafc;border-radius:8px">
      <h4 style="margin:0 0 8px 0;color:#1e293b">${escapeHtml(s.orgName)}</h4>
      ${blocks.join("")}
    </div>
  `;
}

export async function sendWeeklyDigestEmail(userId: string): Promise<boolean> {
  if (!(await isNotificationEnabled(userId, "email_weekly_digest"))) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, firstName: true },
  });
  if (!user) return false;

  const sections = await buildWeeklyDigestForClient(userId);
  if (!sections) return false;

  const url = `${APP_URL}/`;
  const html = wrap(`
    <h3 style="margin:0 0 8px 0;color:#1e293b">Здравствуйте, ${escapeHtml(user.firstName)}!</h3>
    <p style="margin:0 0 16px 0;color:#475569">Сводка по вашему учёту за неделю.</p>
    ${sections.map(renderDigestSection).join("")}
    ${ctaButton(url, "Открыть кабинет")}
  `);

  try {
    await sendEmail(user.email, "Сводка за неделю — ASBUH", html);
    return true;
  } catch (err) {
    console.error("[client-email] sendWeeklyDigestEmail failed:", err);
    return false;
  }
}
