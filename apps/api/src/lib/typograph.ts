import Typograf from "typograf";

/**
 * Единый инстанс типографа для пользовательского контента (RU + EN).
 * Применяется на бэкенде в момент сохранения объявлений, статей базы знаний,
 * сообщений тикетов и саппорта.
 */
const tp = new Typograf({ locale: ["ru", "en-US"] });

// Сильнее, чем дефолт: добавляем неразрывные пробелы после предлогов / перед "г.", "руб."
tp.enableRule("ru/nbsp/afterShortWord");
tp.enableRule("ru/nbsp/beforeShortLastWord");
tp.enableRule("ru/nbsp/centuries");
tp.enableRule("ru/nbsp/dayMonth");
tp.enableRule("ru/nbsp/m");
tp.enableRule("ru/money/ruble");

// Отключаем то, что ломает HTML/markdown ввод
tp.disableRule("common/html/escape");
tp.disableRule("common/html/url");

/** Прогон обычной строки (plain text). Безопасен для null/empty. */
export function typograph(text: string | null | undefined): string {
  if (!text) return "";
  return tp.execute(text);
}

/**
 * Прогон HTML, сохранённого RichTextEditor'ом (TipTap).
 * Typograf сам обходит теги — текст внутри <p>, <li>, заголовков типографируется,
 * содержимое тегов и атрибуты остаются нетронутыми.
 */
export function typographHtml(html: string | null | undefined): string {
  if (!html) return "";
  return tp.execute(html);
}
