const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

export function isOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
}

export function formatLastSeen(lastSeenAt) {
  if (!lastSeenAt) return "Никогда";
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  if (diff < ONLINE_THRESHOLD_MS) return "Онлайн";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} мин. назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч. назад`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} дн. назад`;
  return new Date(lastSeenAt).toLocaleDateString("ru-RU");
}

export const ASSIGNABLE_ROLES = ["admin", "supervisor", "manager", "accountant"];

export const ROLE_LABELS = {
  admin: "Админ",
  supervisor: "Руководитель",
  manager: "Менеджер",
  accountant: "Бухгалтер",
  client: "Клиент",
};

export const ACCOUNTANT_TYPE_LABELS = {
  REPORTING: "Отчётность",
  PRIMARY: "Первичка",
  UNIVERSAL: "Универсал",
};

export const ROLE_AVATAR_COLORS = {
  admin: "bg-primary text-white",
  supervisor: "bg-purple-500 text-white",
  manager: "bg-sky-500 text-white",
  accountant: "bg-emerald-500 text-white",
};

export const ROLE_BADGE_COLORS = {
  admin: "bg-primary/10 text-primary",
  supervisor: "bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300",
  manager: "bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300",
  accountant: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

export function getInitials(firstName, lastName) {
  return `${(lastName?.[0] ?? "").toUpperCase()}${(firstName?.[0] ?? "").toUpperCase()}`;
}

export function formatMoney(n) {
  if (n == null) return "—";
  return Math.round(Number(n)).toLocaleString("ru-RU");
}

export function getPrimaryRole(roles) {
  for (const r of ["admin", "supervisor", "manager", "accountant"]) {
    if (roles.includes(r)) return r;
  }
  return null;
}
