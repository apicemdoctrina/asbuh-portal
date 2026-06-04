import PDFDocument from "pdfkit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ParsedStatement, ReconcileResult } from "./statement-types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_PATH = path.resolve(__dirname, "../assets/fonts/DejaVuSans.ttf");

const money = (n: number) =>
  n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function generatePdf(
  st: ParsedStatement,
  rec: ReconcileResult,
  opts: { orgName?: string | null } = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.registerFont("body", FONT_PATH);
    doc.font("body");

    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Шапка
    doc.fontSize(16).text("Банковская выписка", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10);
    if (opts.orgName) doc.text(`Организация: ${opts.orgName}`);
    if (st.meta.sender) doc.text(`Банк: ${st.meta.sender}`);
    doc.text(`Период: ${st.meta.dateStart ?? "?"} — ${st.meta.dateEnd ?? "?"}`);
    doc.text(
      rec.status === "OK"
        ? "Сверка остатков: ОСТАТКИ СОШЛИСЬ"
        : `Сверка остатков: РАСХОЖДЕНИЕ ${money(rec.totalDiff)} ₽`,
    );
    doc.moveDown(0.5);

    for (const acc of st.accounts) {
      doc.moveDown(0.5);
      doc.fontSize(11).text(`Счёт: ${acc.accountNumber}`);
      doc
        .fontSize(9)
        .text(
          `Нач. остаток: ${money(acc.openingBalance)}    ` +
            `Поступило: ${money(acc.totalIn)}    Списано: ${money(acc.totalOut)}    ` +
            `Кон. остаток: ${money(acc.closingBalance)}`,
        );
      doc.moveDown(0.3);

      for (const op of acc.operations) {
        const sign = op.direction === "in" ? "+" : "−";
        const counterparty = op.direction === "in" ? (op.payerName ?? "") : (op.payeeName ?? "");
        doc
          .fontSize(8)
          .text(
            `${op.date}  №${op.number}  ${sign}${money(op.amount)}  ${counterparty}  ` +
              `${op.purpose ?? ""}`,
          );
      }
    }

    doc.end();
  });
}
