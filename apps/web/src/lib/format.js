/** Деньги в формате «1 234 567 ₽»; null/undefined → «—». */
export function fmtMoney(val, { round = false } = {}) {
  if (val == null) return "—";
  const n = round ? Math.round(Number(val)) : Number(val);
  return n.toLocaleString("ru-RU") + " ₽";
}
