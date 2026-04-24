/**
 * Admin-only channel health monitoring.
 *
 * When SMTP or Telegram fails during a send, we cascade an alert to every admin
 * using the still-alive channels, with a 60-min cooldown to prevent flooding
 * during long outages. On the next successful send the channel is marked healthy
 * and a "restored" notice is dispatched.
 *
 * Fallback priority:
 *   - SMTP failed  → Telegram → in-app
 *   - Telegram failed → SMTP → in-app
 *   - Both failed  → in-app
 */

import prisma from "./prisma.js";
import { sendMessageRaw, setTelegramHealthReporters } from "./telegram.js";
import { sendEmailRaw, setSmtpHealthReporters } from "./mailer.js";
import { createNotification } from "./notify.js";

const COOLDOWN_MS = 60 * 60 * 1000;

type ChannelKey = "smtp" | "telegram";
type ChannelState = { down: boolean; lastAlertAt: number };

const state: Record<ChannelKey, ChannelState> = {
  smtp: { down: false, lastAlertAt: 0 },
  telegram: { down: false, lastAlertAt: 0 },
};

type AdminTarget = { id: string; email: string; chatId: string | null };

async function getAdmins(): Promise<AdminTarget[]> {
  const users = await prisma.user.findMany({
    where: { userRoles: { some: { role: { name: "admin" } } } },
    include: { telegramBinding: true },
  });
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    chatId: u.telegramBinding?.chatId ?? null,
  }));
}

/**
 * Deliver a single admin alert using the best available channel.
 * `failed` is the channel currently known-broken and must be skipped.
 * `failed=null` means "both channels are candidates" (used for restored notices).
 */
async function deliverToAdmin(
  admin: AdminTarget,
  title: string,
  body: string,
  failed: ChannelKey | null,
): Promise<void> {
  console.log(
    `[health-alerts] deliver to admin=${admin.email} failed=${failed} state.smtp.down=${state.smtp.down} state.tg.down=${state.telegram.down} chatId=${admin.chatId ?? "null"}`,
  );
  // Try Telegram first (if not the failed one and not currently down)
  if (failed !== "telegram" && !state.telegram.down && admin.chatId) {
    console.log(`[health-alerts] trying TG for ${admin.email}`);
    const ok = await sendMessageRaw(admin.chatId, `<b>${title}</b>\n${body}`);
    console.log(`[health-alerts] TG result=${ok}`);
    if (ok) return;
  }
  // Then SMTP (if not the failed one and not currently down)
  if (failed !== "smtp" && !state.smtp.down) {
    console.log(`[health-alerts] trying SMTP for ${admin.email}`);
    const ok = await sendEmailRaw(
      admin.email,
      title,
      `<div style="font-family:sans-serif"><h3 style="color:#6567F1">${title}</h3><p>${body}</p></div>`,
    );
    console.log(`[health-alerts] SMTP result=${ok}`);
    if (ok) return;
  }
  // Last resort — in-app notification
  console.log(`[health-alerts] fallback to in-app for ${admin.email}`);
  await createNotification(admin.id, "system_alert", title, body, "/admin/health");
}

async function alertAllAdmins(
  title: string,
  body: string,
  failed: ChannelKey | null,
): Promise<void> {
  try {
    const admins = await getAdmins();
    await Promise.all(admins.map((a) => deliverToAdmin(a, title, body, failed)));
  } catch (err) {
    console.error("[health-alerts] failed to deliver admin alert:", err);
  }
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export async function reportSmtpFailure(err: unknown): Promise<void> {
  const now = Date.now();
  const s = state.smtp;
  const wasDown = s.down;
  s.down = true;
  // First failure always alerts; subsequent failures within cooldown are swallowed.
  if (wasDown && now - s.lastAlertAt < COOLDOWN_MS) return;
  s.lastAlertAt = now;
  await alertAllAdmins(
    "⚠️ SMTP недоступен",
    `Не удалось отправить письмо. Ошибка: ${formatError(err)}`,
    "smtp",
  );
}

export async function reportSmtpOk(): Promise<void> {
  const s = state.smtp;
  if (!s.down) return;
  s.down = false;
  s.lastAlertAt = 0;
  await alertAllAdmins("✅ SMTP восстановлен", "Отправка писем снова работает.", null);
}

export async function reportTelegramFailure(err: unknown): Promise<void> {
  const now = Date.now();
  const s = state.telegram;
  const wasDown = s.down;
  s.down = true;
  if (wasDown && now - s.lastAlertAt < COOLDOWN_MS) return;
  s.lastAlertAt = now;
  await alertAllAdmins(
    "⚠️ Telegram недоступен",
    `Не удалось отправить сообщение в Telegram. Ошибка: ${formatError(err)}`,
    "telegram",
  );
}

export async function reportTelegramOk(): Promise<void> {
  const s = state.telegram;
  if (!s.down) return;
  s.down = false;
  s.lastAlertAt = 0;
  await alertAllAdmins(
    "✅ Telegram восстановлен",
    "Отправка сообщений в Telegram снова работает.",
    null,
  );
}

export function getHealthStatus(): Record<ChannelKey, ChannelState> {
  return {
    smtp: { ...state.smtp },
    telegram: { ...state.telegram },
  };
}

/** Wire up reporters into mailer.ts / telegram.ts. Call once at startup. */
export function initHealthAlerts(): void {
  setSmtpHealthReporters(
    (err) => {
      void reportSmtpFailure(err);
    },
    () => {
      void reportSmtpOk();
    },
  );
  setTelegramHealthReporters(
    (err) => {
      void reportTelegramFailure(err);
    },
    () => {
      void reportTelegramOk();
    },
  );
}
