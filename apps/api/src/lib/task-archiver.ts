import prisma from "./prisma.js";
import { scheduleDailyAt } from "./scheduler.js";

const ARCHIVE_AFTER_DAYS = 30;

export async function archiveOldTasks(): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ARCHIVE_AFTER_DAYS);

  const result = await prisma.task.updateMany({
    where: {
      archivedAt: null,
      status: { in: ["DONE", "CANCELLED"] },
      updatedAt: { lt: cutoff },
    },
    data: { archivedAt: new Date() },
  });

  if (result.count > 0) {
    console.log(`[task-archiver] Archived ${result.count} tasks`);
  }
}

export function startTaskArchiver(): void {
  // Run once at startup, then every night at 03:00
  archiveOldTasks().catch((err) => console.error("[job:task-archiver]", err));
  scheduleDailyAt("task-archiver", archiveOldTasks, 3, 0);
}
