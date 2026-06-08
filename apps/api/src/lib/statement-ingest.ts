import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "./prisma.js";
import { UPLOADS_DIR } from "./upload.js";
import { parseStatement } from "./statement-parser.js";
import { reconcile } from "./statement-reconcile.js";
import { syncStatementTransactions } from "./org-finance.js";
import type { ParsedStatement, ReconcileResult } from "./statement-types.js";

function parseRuDate(d: string | null): Date {
  if (!d) return new Date();
  const [dd, mm, yyyy] = d.split(".");
  return new Date(`${yyyy}-${mm}-${dd}`);
}

export interface IngestInput {
  buffer: Buffer;
  originalName: string;
  organizationId: string;
  uploadedById: string;
  /** Если уже распарсили выше — переиспользуем; иначе парсер вызовется здесь. */
  parsedHint?: ParsedStatement;
  /**
   * Имя файла под которым сохранить в uploads/. Если не задано — генерим UUID.
   * Передавай req.file.filename из multer-роута, чтобы не дублировать запись.
   */
  storedFilename?: string;
}

export interface IngestResult {
  statementId: string;
  parsed: ParsedStatement;
  reconcile: ReconcileResult;
}

/**
 * Общий хелпер: пишет буфер в uploads/ (если ещё не записан), создаёт BankStatement,
 * дёргает syncStatementTransactions. Не делает audit log и не выставляет cookie —
 * это ответственность роута, который вызывает.
 *
 * Используется: POST /api/statements (ручной upload), POST /api/statements/fetch
 * (API-выгрузка), startImapStatementWatcher (email-ingest).
 */
export async function ingestStatement(input: IngestInput): Promise<IngestResult> {
  const parsed = input.parsedHint ?? parseStatement(input.buffer);
  const rec = reconcile(parsed);

  const accountNumbers = parsed.accounts.map((a) => a.accountNumber).filter(Boolean);
  const totalIn = rec.perAccount.reduce((s, p) => s + p.sumIn, 0);
  const totalOut = rec.perAccount.reduce((s, p) => s + p.sumOut, 0);
  const docCount = parsed.accounts.reduce((s, a) => s + a.operations.length, 0);
  const openingBalance = parsed.accounts.reduce((s, a) => s + a.openingBalance, 0);
  const closingBalance = parsed.accounts.reduce((s, a) => s + a.closingBalance, 0);

  const storedFilename = input.storedFilename ?? `${randomUUID()}_${input.originalName}`;
  const storedPath = path.join(UPLOADS_DIR, storedFilename);
  if (!fs.existsSync(storedPath)) {
    await fs.promises.writeFile(storedPath, input.buffer);
  }

  const record = await prisma.bankStatement.create({
    data: {
      organizationId: input.organizationId,
      uploadedById: input.uploadedById,
      bankName: parsed.meta.sender,
      accountNumbers,
      periodStart: parseRuDate(parsed.meta.dateStart),
      periodEnd: parseRuDate(parsed.meta.dateEnd),
      openingBalance: new Prisma.Decimal(openingBalance),
      closingBalance: new Prisma.Decimal(closingBalance),
      totalIn: new Prisma.Decimal(totalIn),
      totalOut: new Prisma.Decimal(totalOut),
      docCount,
      reconcileStatus: rec.status,
      reconcileDiff: new Prisma.Decimal(rec.totalDiff),
      originalName: input.originalName,
      originalPath: storedFilename,
    },
  });

  await syncStatementTransactions(record.id);

  return {
    statementId: record.id,
    parsed,
    reconcile: rec,
  };
}
