import DOMPurify from "dompurify";

// Все ссылки из rich-text открываются безопасно
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("rel", "noopener noreferrer");
    if (node.getAttribute("target") === "_blank") return;
    node.setAttribute("target", "_blank");
  }
});

/** Санитизация HTML перед dangerouslySetInnerHTML — вторая линия защиты от stored XSS. */
export function sanitizeHtml(html) {
  return DOMPurify.sanitize(html ?? "", { USE_PROFILES: { html: true } });
}
