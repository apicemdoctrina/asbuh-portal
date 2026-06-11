import sanitizeHtml from "sanitize-html";

/**
 * Санитизация rich-text HTML (tiptap: StarterKit + Image + Link) перед записью в БД.
 * Срезает script/iframe/обработчики событий/javascript: — защита от stored XSS,
 * даже если контент пришёл мимо редактора (прямой вызов API).
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "blockquote",
    "pre",
    "code",
    "hr",
    "strong",
    "b",
    "em",
    "i",
    "s",
    "u",
    "a",
    "img",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  // Относительные src вида /uploads/... должны выживать
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true),
  },
};

export function sanitizeRichHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}
