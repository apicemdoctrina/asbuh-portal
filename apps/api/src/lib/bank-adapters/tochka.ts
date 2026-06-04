import type { ParsedStatement, ParsedOperation } from "../statement-types.js";

export interface TochkaTransaction {
  transactionId: string;
  creditDebitIndicator: "Credit" | "Debit";
  documentNumber?: string;
  documentProcessDate: string; // ISO (YYYY-MM-DD[...])
  description?: string;
  Amount: { amount: number; currency: string };
  DebtorParty?: { inn?: string; name?: string };
  DebtorAccount?: { identification?: string };
  CreditorParty?: { inn?: string; name?: string };
  CreditorAccount?: { identification?: string };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** ISO YYYY-MM-DD[...] → DD.MM.YYYY. */
function isoToRu(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/** Записывает в raw только непустые значения. */
function put(raw: Record<string, string>, key: string, val: string | null | undefined) {
  if (val) raw[key] = val;
}

function buildOperation(tx: TochkaTransaction, accountNumber: string): ParsedOperation {
  const isIn = tx.creditDebitIndicator === "Credit";
  const amount = round2(tx.Amount?.amount ?? 0);
  const date = isoToRu(tx.documentProcessDate);
  const number = tx.documentNumber || tx.transactionId;
  const purpose = tx.description || null;

  // Входящий: наш счёт — получатель; контрагент — плательщик (DebtorParty).
  // Исходящий: наш счёт — плательщик; контрагент — получатель (CreditorParty).
  //
  // ВАЖНО (round-trip): parseStatement определяет направление по равенству
  // ПлательщикСчет/ПолучательСчет нашему счёту. Если счёт контрагента СОВПАДАЕТ
  // с нашим (перевод между своими счетами в том же банке), после round-trip обе
  // стороны = наш счёт, и парсер не сможет однозначно определить направление.
  // Поэтому счёт контрагента, равный нашему, обнуляем — направление остаётся
  // закреплённым за нашей стороной (payee для in, payer для out).
  const blankIfOurs = (acc: string | undefined | null) =>
    acc && acc !== accountNumber ? acc : null;

  const payerName = isIn ? (tx.DebtorParty?.name ?? null) : null;
  const payerInn = isIn ? (tx.DebtorParty?.inn ?? null) : null;
  const payerAccount = isIn ? blankIfOurs(tx.DebtorAccount?.identification) : accountNumber;
  const payeeName = isIn ? null : (tx.CreditorParty?.name ?? null);
  const payeeInn = isIn ? null : (tx.CreditorParty?.inn ?? null);
  const payeeAccount = isIn ? accountNumber : blankIfOurs(tx.CreditorAccount?.identification);

  const raw: Record<string, string> = {};
  put(raw, "Номер", number);
  put(raw, "Дата", date);
  put(raw, "Сумма", amount.toFixed(2));
  put(raw, "ПлательщикСчет", payerAccount);
  put(raw, "Плательщик", payerName);
  put(raw, "ПлательщикИНН", payerInn);
  put(raw, "ПолучательСчет", payeeAccount);
  put(raw, "Получатель", payeeName);
  put(raw, "ПолучательИНН", payeeInn);
  put(raw, "НазначениеПлатежа", purpose ?? undefined);

  return {
    docType: "03",
    number,
    date,
    amount,
    direction: isIn ? "in" : "out",
    payerName,
    payerInn,
    payerAccount,
    payeeName,
    payeeInn,
    payeeAccount,
    purpose,
    raw,
  };
}

/** Чистый маппинг ответа Точки → канонический ParsedStatement. */
export function tochkaToParsedStatement(input: {
  accountNumber: string;
  start: string; // YYYY-MM-DD
  end: string;
  transactions: TochkaTransaction[];
  balance: { opening: number; closing: number } | null;
}): ParsedStatement {
  const { accountNumber, start, end, transactions, balance } = input;
  const operations = transactions.map((tx) => buildOperation(tx, accountNumber));

  const accRaw: Record<string, string> = {};
  put(accRaw, "РасчСчет", accountNumber);
  put(accRaw, "ДатаНачала", isoToRu(start));
  put(accRaw, "ДатаКонца", isoToRu(end));
  put(accRaw, "НачальныйОстаток", (balance?.opening ?? 0).toFixed(2));
  if (balance) put(accRaw, "КонечныйОстаток", balance.closing.toFixed(2));

  const headerRaw: Record<string, string> = {};
  put(headerRaw, "ВерсияФормата", "1.03");
  put(headerRaw, "Кодировка", "Windows");
  put(headerRaw, "Отправитель", "Точка");
  put(headerRaw, "ДатаНачала", isoToRu(start));
  put(headerRaw, "ДатаКонца", isoToRu(end));
  put(headerRaw, "РасчСчет", accountNumber);

  return {
    meta: {
      formatVersion: "1.03",
      encoding: "win1251",
      sender: "Точка",
      dateStart: isoToRu(start),
      dateEnd: isoToRu(end),
      raw: headerRaw,
    },
    accounts: [
      {
        accountNumber,
        openingBalance: balance?.opening ?? 0,
        totalIn: 0,
        totalOut: 0,
        closingBalance: balance?.closing ?? 0,
        hasClosing: balance !== null,
        raw: accRaw,
        operations,
      },
    ],
  };
}
