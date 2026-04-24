/**
 * Format an ISO 8601 UTC timestamp into a Russian relative-time string,
 * using the BROWSER timezone (not the server's). Server is the source of
 * truth for what the timestamp means; the browser decides how to display it.
 */
export function formatRelative(iso, now = new Date()) {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `${diffMin} мин назад`;

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(then)) / 86400000);

  if (diffDays === 0) {
    const hh = String(then.getHours()).padStart(2, "0");
    const mm = String(then.getMinutes()).padStart(2, "0");
    return `сегодня ${hh}:${mm}`;
  }
  if (diffDays === 1) return "вчера";
  if (diffDays < 7) return `${diffDays} дн назад`;
  return then.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}
