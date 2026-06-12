import { Router } from "express";
import type { Request } from "express";
import fs from "node:fs";
import prisma from "../../lib/prisma.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { logAudit } from "../../lib/audit.js";
import { upload } from "../../lib/upload.js";
import { parseStatement } from "../../lib/statement-parser.js";
import { reconcile } from "../../lib/statement-reconcile.js";
import { ingestStatement } from "../../lib/statement-ingest.js";
import { orgInScope, detectOrg } from "./helpers.js";

const router = Router();

/**
 * Шаг 1: распарсить и сверить выписку БЕЗ сохранения, предложить организацию
 * по номеру счёта. Файл не сохраняется — клиент шлёт его повторно на сохранение.
 */
router.post(
  "/preview",
  authenticate,
  requirePermission("bank_statement", "create"),
  upload.single("file"),
  async (req: Request, res) => {
    try {
      if (!req.file) {
        res.status(422).json({ error: "Файл не передан" });
        return;
      }
      const buf = fs.readFileSync(req.file.path);
      fs.promises.unlink(req.file.path).catch(() => {}); // preview ничего не хранит

      let parsed;
      try {
        parsed = parseStatement(buf);
      } catch {
        res.status(422).json({
          error: "Не удалось распознать файл как выписку формата 1CClientBankExchange",
        });
        return;
      }

      const rec = reconcile(parsed);
      const accountNumbers = parsed.accounts.map((a) => a.accountNumber).filter(Boolean);
      const suggestedOrg = await detectOrg(accountNumbers, req.user!);

      res.json({
        reconcile: rec,
        accountNumbers,
        bankName: parsed.meta.sender,
        periodStart: parsed.meta.dateStart,
        periodEnd: parsed.meta.dateEnd,
        docCount: parsed.accounts.reduce((s, a) => s + a.operations.length, 0),
        suggestedOrg, // {id,name} | null
      });
    } catch (err) {
      console.error("Statement preview error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

/**
 * Шаг 2: сохранить выписку. Организация ОБЯЗАТЕЛЬНА и проверяется на скоуп —
 * непривязанные выписки не допускаются.
 */
router.post(
  "/",
  authenticate,
  requirePermission("bank_statement", "create"),
  upload.single("file"),
  async (req: Request, res) => {
    const cleanup = () => {
      if (req.file) fs.promises.unlink(req.file.path).catch(() => {});
    };
    try {
      if (!req.file) {
        res.status(422).json({ error: "Файл не передан" });
        return;
      }

      const organizationId = (req.body.organizationId as string) || null;
      if (!organizationId) {
        cleanup();
        res.status(422).json({ error: "Не выбрана организация" });
        return;
      }
      if (!(await orgInScope(organizationId, req.user!))) {
        cleanup();
        res.status(422).json({ error: "Организация не найдена или нет доступа" });
        return;
      }

      const buf = fs.readFileSync(req.file.path);
      let parsed;
      try {
        parsed = parseStatement(buf);
      } catch {
        cleanup();
        res.status(422).json({
          error: "Не удалось распознать файл как выписку формата 1CClientBankExchange",
        });
        return;
      }

      const result = await ingestStatement({
        buffer: buf,
        originalName: req.file.originalname,
        organizationId,
        uploadedById: req.user!.userId,
        parsedHint: parsed,
        storedFilename: req.file.filename,
      });

      const record = await prisma.bankStatement.findUniqueOrThrow({
        where: { id: result.statementId },
        include: { organization: { select: { id: true, name: true } } },
      });

      await logAudit({
        action: "bank_statement_uploaded",
        userId: req.user!.userId,
        entity: "bank_statement",
        entityId: record.id,
        details: {
          reconcile: result.reconcile.status,
          organizationId,
          accounts: result.parsed.accounts.map((a) => a.accountNumber),
        },
      });

      res.status(201).json({
        statement: record,
        reconcile: result.reconcile,
        accounts: result.parsed.accounts.map((a) => ({
          accountNumber: a.accountNumber,
          openingBalance: a.openingBalance,
          closingBalance: a.closingBalance,
          operations: a.operations,
        })),
      });
    } catch (err) {
      console.error("Statement upload error:", err);
      cleanup();
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
