import prisma from "./prisma.js";

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
  // Run once at startup
  archiveOldTasks().catch(console.error);

  // Then every night at 03:00
  const INTERVAL_MS = 60 * 60 * 1000; // check every hour
  setInterval(() => {
    const hour = new Date().getHours();
    if (hour === 3) {
      archiveOldTasks().catch(console.error);
    }
  }, INTERVAL_MS);
}
