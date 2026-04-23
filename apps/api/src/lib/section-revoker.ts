import prisma from "./prisma.js";
import { notifyWithTelegram } from "./notify.js";
import { logAudit } from "./audit.js";

export async function revokeExpiredSectionMemberships(): Promise<void> {
  const now = new Date();
  const expired = await prisma.sectionMember.findMany({
    where: { expiresAt: { lt: now, not: null } },
    include: { section: { select: { id: true, number: true, name: true } } },
  });

  if (expired.length === 0) return;

  for (const m of expired) {
    await prisma.sectionMember.delete({ where: { id: m.id } });

    await prisma.organizationMember.deleteMany({
      where: {
        userId: m.userId,
        organization: { sectionId: m.sectionId },
      },
    });

    await logAudit({
      action: "section_member_auto_revoked",
      entity: "section",
      entityId: m.sectionId,
      details: {
        userId: m.userId,
        expiresAt: m.expiresAt?.toISOString(),
        reason: m.reason,
      },
    });

    const sNum = m.section.number;
    const sName = m.section.name;
    notifyWithTelegram(
      m.userId,
      "section_member_revoked",
      "Временный доступ к участку истёк",
      `Вы сняты с участка №${sNum}${sName ? ` (${sName})` : ""} — срок временного назначения истёк`,
      undefined,
      `⏱ <b>Временный доступ истёк</b>\n\nВы сняты с участка №${sNum}${sName ? ` — ${sName}` : ""}`,
    ).catch(console.error);
  }

  console.log(`[section-revoker] Revoked ${expired.length} expired section memberships`);
}

export function startTemporarySectionRevoker(): void {
  // Run once at startup to catch anything that expired while we were down
  revokeExpiredSectionMemberships().catch(console.error);

  // Then every hour — at 02:xx run the sweep
  const INTERVAL_MS = 60 * 60 * 1000;
  setInterval(() => {
    const hour = new Date().getHours();
    if (hour === 2) {
      revokeExpiredSectionMemberships().catch(console.error);
    }
  }, INTERVAL_MS);
}
