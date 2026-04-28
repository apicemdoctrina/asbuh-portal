/**
 * Weekly client email digest — runs Mondays at 09:00 local server time.
 */

import prisma from "./prisma.js";
import { sendWeeklyDigestEmail } from "./client-email.js";

export function startWeeklyClientDigest(): void {
  scheduleNextRun();
  console.log("[ClientDigest] Weekly client digest scheduled");
}

function scheduleNextRun(): void {
  const now = new Date();
  const next = new Date(now);
  next.setHours(9, 0, 0, 0);
  // Advance to next Monday (1) at 09:00
  const dayShift = (1 - next.getDay() + 7) % 7;
  next.setDate(next.getDate() + dayShift);
  if (next <= now) next.setDate(next.getDate() + 7);

  const delay = next.getTime() - now.getTime();
  setTimeout(() => {
    sendWeeklyDigest().catch(console.error);
    setInterval(() => sendWeeklyDigest().catch(console.error), 7 * 24 * 60 * 60 * 1000);
  }, delay);
}

async function sendWeeklyDigest(): Promise<void> {
  console.log("[ClientDigest] Sending weekly digest...");
  const clients = await prisma.user.findMany({
    where: {
      isActive: true,
      userRoles: { some: { role: { name: "client" } } },
    },
    select: { id: true },
  });

  let sent = 0;
  for (const c of clients) {
    try {
      const ok = await sendWeeklyDigestEmail(c.id);
      if (ok) sent++;
    } catch (err) {
      console.error(`[ClientDigest] failed for user ${c.id}:`, err);
    }
  }
  console.log(`[ClientDigest] Sent ${sent}/${clients.length} digests`);
}
