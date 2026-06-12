import iconv from "iconv-lite";
import type { ParsedStatement, ParsedOperation } from "./statement-types.js";

const HEADER_ORDER = [
  "ВерсияФормата",
  "Кодировка",
  "Отправитель",
  "Получатель",
  "ДатаСоздания",
  "ВремяСоздания",
  "ДатаНачала",
  "ДатаКонца",
  "РасчСчет",
];

const ACCOUNT_ORDER = [
  "РасчСчет",
  "ДатаНачала",
  "ДатаКонца",
  "НачальныйОстаток",
  "ВсегоПоступило",
  "ВсегоСписано",
  "КонечныйОстаток",
];

const DOC_ORDER = [
  "Номер",
  "Дата",
  "Сумма",
  "ПлательщикСчет",
  "Плательщик",
  "ПлательщикИНН",
  "ПлательщикРасчСчет",
  "ПлательщикБанк1",
  "ПлательщикБИК",
  "ПолучательСчет",
  "Получатель",
  "ПолучательИНН",
  "ПолучательРасчСчет",
  "ПолучательБанк1",
  "ПолучательБИК",
  "ВидПлатежа",
  "ВидОплаты",
  "ДатаСписано",
  "ДатаПоступило",
  "НазначениеПлатежа",
];

/**
 * Формат построчный (`Ключ=Значение`): перевод строки внутри ключа/значения
 * позволил бы подделать структуру файла (вставить СекцияДокумент/КонецДокумента).
 * Вычищаем при записи — независимо от того, откуда пришли данные.
 */
function clean(s: string): string {
  return s.replace(/[\r\n]+/g, " ");
}

/** Пишет ключи в заданном порядке, затем оставшиеся raw-ключи (без потерь). */
function writeFields(
  out: string[],
  raw: Record<string, string>,
  order: string[],
  override: Record<string, string> = {},
) {
  const written = new Set<string>();
  for (const key of order) {
    const val = key in override ? override[key] : raw[key];
    if (val !== undefined) {
      out.push(`${key}=${clean(val)}`);
      written.add(key);
    }
  }
  for (const [key, val] of Object.entries(raw)) {
    if (!written.has(key)) out.push(`${clean(key)}=${clean(val)}`);
  }
}

export function generate1c(st: ParsedStatement): Buffer {
  const lines: string[] = ["1CClientBankExchange"];

  // заголовок: форсируем кодировку Windows
  writeFields(lines, st.meta.raw, HEADER_ORDER, { Кодировка: "Windows" });

  for (const acc of st.accounts) {
    lines.push("СекцияРасчСчет");
    writeFields(lines, acc.raw, ACCOUNT_ORDER);
    lines.push("КонецРасчСчет");
  }

  // документы: операция дублируется на счетах (in/out при внутреннем переводе),
  // поэтому дедуплицируем по исходному объекту полей raw
  const seenRaw = new Set<Record<string, string>>();
  for (const acc of st.accounts) {
    for (const op of acc.operations) {
      if (seenRaw.has(op.raw)) continue;
      seenRaw.add(op.raw);
      writeDoc(lines, op);
    }
  }

  lines.push("КонецФайла");
  lines.push(""); // завершающий перевод строки

  return iconv.encode(lines.join("\r\n"), "win1251");
}

function writeDoc(out: string[], op: ParsedOperation) {
  out.push(`СекцияДокумент=${clean(op.docType)}`);
  writeFields(out, op.raw, DOC_ORDER);
  out.push("КонецДокумента");
}
