/**
 * Единый планировщик фоновых джобов: одинаковое логирование `[job:name]`
 * и гарантия, что упавшая итерация не уронит процесс.
 */

/** Периодический запуск каждые `intervalMs`; опционально — сразу при старте. */
export function scheduleInterval(
  name: string,
  fn: () => Promise<unknown>,
  intervalMs: number,
  opts: { runOnStart?: boolean } = {},
): void {
  const run = () => fn().catch((err) => console.error(`[job:${name}]`, err));
  if (opts.runOnStart) run();
  setInterval(run, intervalMs);
  console.log(`[job:${name}] scheduled every ${Math.round(intervalMs / 60_000)} min`);
}

/** Ежедневный запуск в HH:MM локального времени сервера (или UTC). */
export function scheduleDailyAt(
  name: string,
  fn: () => Promise<unknown>,
  hour: number,
  minute = 0,
  opts: { utc?: boolean } = {},
): void {
  function scheduleNext() {
    const now = new Date();
    const next = new Date(now);
    if (opts.utc) {
      next.setUTCHours(hour, minute, 0, 0);
      if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    } else {
      next.setHours(hour, minute, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
    }
    setTimeout(async () => {
      try {
        await fn();
      } catch (err) {
        console.error(`[job:${name}]`, err);
      }
      scheduleNext();
    }, next.getTime() - now.getTime());
    console.log(`[job:${name}] next run at ${next.toLocaleString("ru-RU")}`);
  }
  scheduleNext();
}
