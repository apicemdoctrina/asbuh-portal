import prisma from "./prisma.js";
import { pushToUser } from "./sse-manager.js";
import { sendMessage } from "./telegram.js";

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  body?: string,
  link?: string,
): Promise<void> {
  const notif = await prisma.notification.create({
    data: { userId, type, title, body: body ?? null, link: link ?? null },
  });
  pushToUser(userId, "notification", notif);
}

/**
 * Create an in-app notification AND send a Telegram message if the user has a binding.
 * telegramText — HTML-formatted text for Telegram (falls back to title if omitted).
 */
export async function notifyWithTelegram(
  userId: string,
  type: string,
  title: string,
  body?: string,
  link?: string,
  telegramText?: string,
): Promise<void> {
  await createNotification(userId, type, title, body, link);

  const binding = await prisma.telegramBinding.findUnique({ where: { userId } });
  if (binding?.chatId) {
    await sendMessage(binding.chatId, telegramText ?? title);
  }
}
