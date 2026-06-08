import type { ParsedAccount, ParsedOperation, ParsedStatement } from "../statement-types.js";
import type { AlfaTransaction } from "./alfa-client.js";

/** Alfa отдаёт даты как ISO YYYY-MM-DD; нам нужен DD.MM.YYYY для 1С-формата. */
function isoToRu(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  // Альфа в /transactions возвращает amount как объект {amount, currencyName}.
  if (v && typeof v === "object" && "amount" in v) return toNum((v as { amount: unknown }).amount);
  return 0;
}

function normalizeDirection(d: unknown): "in" | "out" {
  const s = String(d ?? "").toLowerCase();
  if (s === "credit" || s === "in" || s === "income") return "in";
  return "out";
}

function put(raw: Record<string, string>, key: string, val: string | null | undefined) {
  if (val !== null && val !== undefined && val !== "") raw[key] = String(val);
}

function mapOperation(t: AlfaTransaction): ParsedOperation {
  const r = t.rurTransfer ?? {};
  const direction = normalizeDirection(t.direction);
  const dateRaw = t.operationDate ?? "";
  const dateRu = /^\d{4}-\d{2}-\d{2}/.test(dateRaw) ? isoToRu(dateRaw) : dateRaw;
  const number = r.documentNumber ?? (t.number ? String(t.number) : "");
  const amount = toNum(t.amountRub ?? t.amount);
  const docDateRaw = (t.documentDate as string) ?? "";
  const docDate = /^\d{4}-\d{2}-\d{2}/.test(docDateRaw) ? isoToRu(docDateRaw) : dateRu;

  // raw — это то, что generate1c сериализует обратно в 1С-файл и далее парсит.
  // Без него документ в файле пустой → при обратном парсинге операции теряются.
  const raw: Record<string, string> = {};
  put(raw, "Номер", number);
  put(raw, "Дата", docDate);
  put(raw, "Сумма", amount.toFixed(2));
  put(raw, "ПлательщикСчет", r.payerAccount);
  put(raw, "Плательщик", r.payerName);
  put(raw, "ПлательщикИНН", r.payerInn);
  put(raw, "ПлательщикРасчСчет", r.payerAccount);
  put(raw, "ПлательщикБанк1", (r as { payerBankName?: string }).payerBankName);
  put(raw, "ПлательщикБИК", (r as { payerBankBic?: string }).payerBankBic);
  put(raw, "ПолучательСчет", r.payeeAccount);
  put(raw, "Получатель", r.payeeName);
  put(raw, "ПолучательИНН", r.payeeInn);
  put(raw, "ПолучательРасчСчет", r.payeeAccount);
  put(raw, "ПолучательБанк1", (r as { payeeBankName?: string }).payeeBankName);
  put(raw, "ПолучательБИК", (r as { payeeBankBic?: string }).payeeBankBic);
  if (direction === "out") put(raw, "ДатаСписано", dateRu);
  else put(raw, "ДатаПоступило", dateRu);
  put(raw, "НазначениеПлатежа", t.paymentPurpose);

  return {
    docType: "Платёжное поручение",
    number,
    date: dateRu,
    amount,
    direction,
    payerName: r.payerName ?? null,
    payerInn: r.payerInn ?? null,
    payerAccount: r.payerAccount ?? null,
    payeeName: r.payeeName ?? null,
    payeeInn: r.payeeInn ?? null,
    payeeAccount: r.payeeAccount ?? null,
    purpose: t.paymentPurpose ?? null,
    raw,
  };
}

/**
 * Собрать один однодневный ParsedStatement по операциям Альфы.
 * Балансы Альфа в /transactions не возвращает — оставляем 0, hasClosing=false,
 * reconcile в этом случае пометит "нет данных для сверки".
 */
export function parseAlfaDay(
  accountNumber: string,
  dayISO: string,
  txs: AlfaTransaction[],
): ParsedStatement {
  const operations = txs.map(mapOperation);
  const account: ParsedAccount = {
    accountNumber,
    openingBalance: 0,
    totalIn: operations.filter((o) => o.direction === "in").reduce((s, o) => s + o.amount, 0),
    totalOut: operations.filter((o) => o.direction === "out").reduce((s, o) => s + o.amount, 0),
    closingBalance: 0,
    hasClosing: false,
    raw: {},
    operations,
  };
  const dayRu = isoToRu(dayISO);
  return {
    meta: {
      formatVersion: "1.02",
      encoding: "windows-1251",
      sender: "Альфа-Банк",
      dateStart: dayRu,
      dateEnd: dayRu,
      raw: {},
    },
    accounts: [account],
  };
}
