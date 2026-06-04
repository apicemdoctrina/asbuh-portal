import type { ParsedStatement, ParsedAccount, ParsedOperation } from "./statement-types.js";

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => round2(n).toFixed(2);

/** Записать ключ или удалить, если значение пустое. */
function setOrDelete(raw: Record<string, string>, key: string, value: string | null) {
  if (value === null || value === "") delete raw[key];
  else raw[key] = value;
}

/** Синхронизировать raw-поля документа с типизированными значениями. */
function syncOpRaw(op: ParsedOperation): ParsedOperation {
  const raw = { ...op.raw };
  raw["Номер"] = op.number;
  raw["Дата"] = op.date;
  raw["Сумма"] = money(op.amount);
  setOrDelete(raw, "Плательщик", op.payerName);
  setOrDelete(raw, "ПлательщикИНН", op.payerInn);
  setOrDelete(raw, "ПлательщикСчет", op.payerAccount);
  setOrDelete(raw, "Получатель", op.payeeName);
  setOrDelete(raw, "ПолучательИНН", op.payeeInn);
  setOrDelete(raw, "ПолучательСчет", op.payeeAccount);
  setOrDelete(raw, "НазначениеПлатежа", op.purpose);
  return { ...op, amount: round2(op.amount), raw };
}

/** Синхронизировать секцию счёта: пересчитать итоги из операций и обновить raw. */
function syncAccRaw(acc: ParsedAccount): ParsedAccount {
  const operations = acc.operations.map(syncOpRaw);
  const totalIn = round2(
    operations.filter((o) => o.direction === "in").reduce((s, o) => s + o.amount, 0),
  );
  const totalOut = round2(
    operations.filter((o) => o.direction === "out").reduce((s, o) => s + o.amount, 0),
  );
  const openingBalance = round2(acc.openingBalance);
  const closingBalance = round2(acc.closingBalance);

  const raw = { ...acc.raw };
  raw["РасчСчет"] = acc.accountNumber;
  raw["НачальныйОстаток"] = money(openingBalance);
  raw["ВсегоПоступило"] = money(totalIn);
  raw["ВсегоСписано"] = money(totalOut);
  if (acc.hasClosing) raw["КонечныйОстаток"] = money(closingBalance);
  else delete raw["КонечныйОстаток"];

  return {
    ...acc,
    openingBalance,
    closingBalance,
    totalIn,
    totalOut,
    raw,
    operations,
  };
}

/**
 * Привести правленую выписку к консистентному виду: синхронизировать
 * типизированные значения с `raw` (нужно для корректной генерации .txt)
 * и пересчитать итоги по счетам из операций.
 */
export function normalizeEdited(st: ParsedStatement): ParsedStatement {
  return { ...st, accounts: st.accounts.map(syncAccRaw) };
}
