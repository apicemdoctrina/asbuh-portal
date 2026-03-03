import prisma from "./prisma.js";
import { pushToUser } from "./sse-manager.js";

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
