import { Router } from "express";
import type { Request } from "express";
import prisma from "../../lib/prisma.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { logAudit } from "../../lib/audit.js";
import { BankApiError } from "../../lib/bank-adapters/index.js";
import { encrypt } from "../../lib/crypto.js";
import {
  getTochkaOAuthConfig,
  getConsentsToken,
  createConsent,
  buildTochkaAuthorizeUrl,
  exchangeAuthCode as exchangeTochkaCode,
  findAccountIdByNumber as findTochkaAccountId,
} from "../../lib/bank-adapters/tochka-oauth.js";
import { signTochkaState, verifyTochkaState } from "../../lib/bank-adapters/tochka-oauth-state.js";
import { isPrivileged, mapBankError } from "./helpers.js";

const router = Router();

/** Старт OAuth-онбординга Точки: получить consent + вернуть ссылку авторизации. */
router.get(
  "/tochka/authorize-url",
  authenticate,
  requirePermission("bank_statement", "connect"),
  async (req: Request, res) => {
    try {
      const bankAccountId = (req.query.bankAccountId as string) || "";
      const acc = await prisma.organizationBankAccount.findFirst({
        where: {
          id: bankAccountId,
          apiProvider: "tochka",
          ...(isPrivileged(req.user!.roles)
            ? {}
            : {
                organization: {
                  OR: [
                    { section: { members: { some: { userId: req.user!.userId } } } },
                    { members: { some: { userId: req.user!.userId } } },
                  ],
                },
              }),
        },
        select: { id: true },
      });
      if (!acc) {
        res.status(404).json({ error: "Счёт Точки не найден или нет доступа" });
        return;
      }
      const cfg = getTochkaOAuthConfig();
      const consentsToken = await getConsentsToken(cfg);
      const consentId = await createConsent(consentsToken, cfg);
      const state = signTochkaState({ bankAccountId: acc.id, userId: req.user!.userId });
      res.json({ url: buildTochkaAuthorizeUrl(cfg, consentId, state) });
    } catch (err) {
      const m = mapBankError(err);
      if (m.status === 500) console.error("Tochka authorize-url error:", err);
      res.status(m.status).json({ error: m.error });
    }
  },
);

/** Публичный callback Точки: обменять код на токены и сохранить refresh в счёт. */
router.get("/tochka/callback", async (req: Request, res) => {
  const appUrl = process.env.APP_URL || "http://localhost:5173";
  const code = (req.query.code as string) || "";
  const stateRaw = (req.query.state as string) || "";

  let state;
  try {
    state = verifyTochkaState(stateRaw);
  } catch {
    res.redirect(`${appUrl}/?tochka=error`);
    return;
  }

  const acc = await prisma.organizationBankAccount.findFirst({
    where: { id: state.bankAccountId },
    select: { id: true, organizationId: true, accountNumber: true },
  });
  if (!acc) {
    res.redirect(`${appUrl}/?tochka=error`);
    return;
  }

  try {
    if (!code) {
      console.error("Tochka callback query:", req.query);
      throw new BankApiError("Точка не вернула код авторизации");
    }
    const cfg = getTochkaOAuthConfig();
    const { accessToken, refreshToken } = await exchangeTochkaCode(code, cfg);

    // Резолвим внутренний accountId Точки по номеру счёта — без него
    // выписки вернут "Invalid accountId" на первом fetch.
    let apiAccountId: string | null = null;
    if (acc.accountNumber) {
      apiAccountId = await findTochkaAccountId(accessToken, acc.accountNumber);
      if (!apiAccountId) {
        console.warn(
          `[tochka] не нашёл accountId для счёта ${acc.accountNumber} (бух впишет вручную)`,
        );
      }
    }

    await prisma.organizationBankAccount.update({
      where: { id: acc.id },
      data: {
        apiToken: encrypt(refreshToken),
        ...(apiAccountId ? { apiAccountId } : {}),
      },
    });
    await logAudit({
      action: "tochka_oauth_connected",
      userId: state.userId,
      entity: "bank_statement",
      entityId: acc.id,
      details: { organizationId: acc.organizationId },
    });
    res.redirect(`${appUrl}/organizations/${acc.organizationId}?tochka=connected`);
  } catch (err) {
    console.error("Tochka callback error:", err);
    res.redirect(`${appUrl}/organizations/${acc.organizationId}?tochka=error`);
  }
});

export default router;
