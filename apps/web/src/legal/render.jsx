import { Fragment } from "react";

export function LegalContent({ text }) {
  const blocks = parseLegalMarkdown(text);
  return (
    <div className="text-sm text-body space-y-2">
      {blocks.map((b, i) => (
        <RenderBlock key={i} block={b} />
      ))}
    </div>
  );
}

function RenderBlock({ block }) {
  switch (block.kind) {
    case "h1":
      return <h2 className="text-base font-bold text-heading mt-3">{renderInline(block.text)}</h2>;
    case "h2":
      return <h3 className="text-sm font-bold text-heading mt-3">{renderInline(block.text)}</h3>;
    case "h3":
      return (
        <h4 className="text-sm font-semibold text-heading mt-2">{renderInline(block.text)}</h4>
      );
    case "p":
      return <p className="leading-relaxed">{renderInline(block.text)}</p>;
    case "blockquote":
      return (
        <blockquote className="border-l-4 border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 px-3 py-2 text-amber-900 dark:text-amber-300 text-xs">
          {block.lines.map((line, i) => (
            <p key={i}>{renderInline(line)}</p>
          ))}
        </blockquote>
      );
    case "ul":
      return (
        <ul className="list-disc pl-5 space-y-1">
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    default:
      return null;
  }
}

function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(part);
    if (m) return <strong key={i}>{m[1]}</strong>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function parseLegalMarkdown(md) {
  const lines = md.split(/\r?\n/);
  const blocks = [];
  let listBuffer = null;
  let blockquoteBuffer = null;
  let paraBuffer = null;

  function flushPara() {
    if (paraBuffer) {
      blocks.push({ kind: "p", text: paraBuffer.join(" ") });
      paraBuffer = null;
    }
  }
  function flushList() {
    if (listBuffer) {
      blocks.push({ kind: "ul", items: listBuffer });
      listBuffer = null;
    }
  }
  function flushBlockquote() {
    if (blockquoteBuffer) {
      blocks.push({ kind: "blockquote", lines: blockquoteBuffer });
      blockquoteBuffer = null;
    }
  }
  function flushAll() {
    flushPara();
    flushList();
    flushBlockquote();
  }

  for (const line of lines) {
    if (/^\s*$/.test(line)) {
      flushAll();
      continue;
    }
    let m;
    if ((m = /^### (.*)$/.exec(line))) {
      flushAll();
      blocks.push({ kind: "h3", text: m[1] });
      continue;
    }
    if ((m = /^## (.*)$/.exec(line))) {
      flushAll();
      blocks.push({ kind: "h2", text: m[1] });
      continue;
    }
    if ((m = /^# (.*)$/.exec(line))) {
      flushAll();
      blocks.push({ kind: "h1", text: m[1] });
      continue;
    }
    if ((m = /^> ?(.*)$/.exec(line))) {
      flushPara();
      flushList();
      if (!blockquoteBuffer) blockquoteBuffer = [];
      blockquoteBuffer.push(m[1]);
      continue;
    }
    if ((m = /^- (.*)$/.exec(line))) {
      flushPara();
      flushBlockquote();
      if (!listBuffer) listBuffer = [];
      listBuffer.push(m[1]);
      continue;
    }
    flushList();
    flushBlockquote();
    if (!paraBuffer) paraBuffer = [];
    paraBuffer.push(line);
  }
  flushAll();
  return blocks;
}
