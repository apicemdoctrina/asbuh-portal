import iconv from "iconv-lite";
import type { ParsedStatement, ParsedAccount, ParsedOperation } from "./statement-types.js";

const ENCODINGS = ["win1251", "cp866", "utf8"];

/** Декодирует буфер, подбирая кодировку по наличию кириллических маркеров формата. */
function decode(buf: Buffer): { text: string; encoding: string } {
  for (const enc of ENCODINGS) {
    const text = iconv.decode(buf, enc);
    if (text.includes("КонецФайла") || text.includes("СекцияРасчСчет")) {
      return { text, encoding: enc };
    }
  }
  // фолбэк — win1251 (самый частый для 1С)
  return { text: iconv.decode(buf, "win1251"), encoding: "win1251" };
}

function num(v: string | undefined): number {
  if (!v) return 0;
  return Number(v.replace(/\s/g, "").replace(",", ".")) || 0;
}

/** Парсит блок строк key=value в объект (первое значение ключа побеждает дубликаты). */
function kv(lines: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of lines) {
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key && !(key in out)) out[key] = val;
  }
  return out;
}

export function parseStatement(buf: Buffer): ParsedStatement {
  const { text, encoding } = decode(buf);
  const lines = text.split(/\r?\n/);

  if (!lines[0]?.trim().startsWith("1CClientBankExchange")) {
    throw new Error("File is not a 1CClientBankExchange statement");
  }

  const headerLines: string[] = [];
  const accountBlocks: Record<string, string>[] = [];
  const docBlocks: { type: string; fields: Record<string, string> }[] = [];

  let i = 1;
  // header — до первой секции
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === "СекцияРасчСчет" || line.startsWith("СекцияДокумент") || line === "КонецФайла") {
      break;
    }
    headerLines.push(line);
    i++;
  }

  // секции
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === "СекцияРасчСчет") {
      const block: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "КонецРасчСчет") {
        block.push(lines[i].trim());
        i++;
      }
      i++; // съесть КонецРасчСчет
      accountBlocks.push(kv(block));
    } else if (line.startsWith("СекцияДокумент")) {
      const type = line.slice(line.indexOf("=") + 1).trim();
      const block: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "КонецДокумента") {
        block.push(lines[i].trim());
        i++;
      }
      i++; // съесть КонецДокумента
      docBlocks.push({ type, fields: kv(block) });
    } else {
      i++; // КонецФайла или пустые строки
    }
  }

  const header = kv(headerLines);

  const accounts: ParsedAccount[] = accountBlocks.map((raw) => ({
    accountNumber: raw["РасчСчет"] ?? "",
    openingBalance: num(raw["НачальныйОстаток"]),
    totalIn: num(raw["ВсегоПоступило"]),
    totalOut: num(raw["ВсегоСписано"]),
    closingBalance: num(raw["КонечныйОстаток"]),
    hasClosing: "КонечныйОстаток" in raw,
    raw,
    operations: [],
  }));

  // разложить документы по счетам
  for (const { type, fields } of docBlocks) {
    const payer = fields["ПлательщикСчет"] ?? null;
    const payee = fields["ПолучательСчет"] ?? null;
    for (const acc of accounts) {
      let direction: "in" | "out" | null = null;
      if (payee === acc.accountNumber) direction = "in";
      else if (payer === acc.accountNumber) direction = "out";
      if (!direction) continue;
      acc.operations.push(buildOperation(type, fields, direction));
    }
  }

  return {
    meta: {
      formatVersion: header["ВерсияФормата"] ?? "1.03",
      encoding,
      sender: header["Отправитель"] || null,
      dateStart: header["ДатаНачала"] || null,
      dateEnd: header["ДатаКонца"] || null,
      raw: header,
    },
    accounts,
  };
}

function buildOperation(
  docType: string,
  f: Record<string, string>,
  direction: "in" | "out",
): ParsedOperation {
  return {
    docType,
    number: f["Номер"] ?? "",
    date: f["Дата"] ?? "",
    amount: num(f["Сумма"]),
    direction,
    payerName: f["Плательщик"] || null,
    payerInn: f["ПлательщикИНН"] || null,
    payerAccount: f["ПлательщикСчет"] || null,
    payeeName: f["Получатель"] || null,
    payeeInn: f["ПолучательИНН"] || null,
    payeeAccount: f["ПолучательСчет"] || null,
    purpose: f["НазначениеПлатежа"] || null,
    raw: f,
  };
}
