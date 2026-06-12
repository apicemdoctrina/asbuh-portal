import { Router } from "express";
import type { Request } from "express";
import prisma from "../../lib/prisma.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { logAudit } from "../../lib/audit.js";
import { BankApiError } from "../../lib/bank-adapters/index.js";
import { encrypt } from "../../lib/crypto.js";
import { getSberConfig } from "../../lib/bank-adapters/sber-mtls.js";
import { exchangeAuthCode } from "../../lib/bank-adapters/sber-client.js";
import { signSberState, verifySberState } from "../../lib/bank-adapters/sber-oauth-state.js";
import { isPrivileged, mapBankError } from "./helpers.js";

const router = Router();

/** Собрать ссылку авторизации Сбера. Имена параметров — кандидат на правку на живом IFT. */
export function buildAuthorizeUrl(
  cfg: { authBaseUrl: string; clientId: string; redirectUri: string; scope: string },
  state: string,
): string {
  const qs = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: cfg.scope,
    state,
  });
  return `${cfg.authBaseUrl}/ic/sso/api/v2/oauth/authorize?${qs.toString()}`;
}

/** Старт OAuth-онбординга Сбера: вернуть ссылку авторизации для счёта в скоупе. */
router.get(
  "/sber/authorize-url",
  authenticate,
  requirePermission("bank_statement", "connect"),
  async (req: Request, res) => {
    try {
      const bankAccountId = (req.query.bankAccountId as string) || "";
      const acc = await prisma.organizationBankAccount.findFirst({
        where: {
          id: bankAccountId,
          apiProvider: "sber",
          // Сотрудники видят счёт через секцию, клиент — через членство в организации.
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
        res.status(404).json({ error: "Счёт Сбера не найден или нет доступа" });
        return;
      }
      const cfg = getSberConfig();
      const state = signSberState({ bankAccountId: acc.id, userId: req.user!.userId });
      res.json({ url: buildAuthorizeUrl(cfg, state) });
    } catch (err) {
      const m = mapBankError(err);
      if (m.status === 500) console.error("Sber authorize-url error:", err);
      res.status(m.status).json({ error: m.error });
    }
  },
);

/** Публичный callback Сбера: обменять код на токены и сохранить refresh в счёт. */
router.get("/sber/callback", async (req: Request, res) => {
  const appUrl = process.env.APP_URL || "http://localhost:5173";
  const code = (req.query.code as string) || "";
  const stateRaw = (req.query.state as string) || "";

  let state;
  try {
    state = verifySberState(stateRaw);
  } catch {
    res.redirect(`${appUrl}/?sber=error`);
    return;
  }

  const acc = await prisma.organizationBankAccount.findFirst({
    where: { id: state.bankAccountId },
    select: { id: true, organizationId: true },
  });
  if (!acc) {
    res.redirect(`${appUrl}/?sber=error`);
    return;
  }

  try {
    if (!code) throw new BankApiError("Сбер не вернул код авторизации");
    const cfg = getSberConfig();
    const { refreshToken } = await exchangeAuthCode(code, cfg);
    await prisma.organizationBankAccount.update({
      where: { id: acc.id },
      data: { apiToken: encrypt(refreshToken) },
    });
    await logAudit({
      action: "sber_oauth_connected",
      userId: state.userId,
      entity: "bank_statement",
      entityId: acc.id,
      details: { organizationId: acc.organizationId },
    });
    res.redirect(`${appUrl}/organizations/${acc.organizationId}?sber=connected`);
  } catch (err) {
    console.error("Sber callback error:", err);
    res.redirect(`${appUrl}/organizations/${acc.organizationId}?sber=error`);
  }
});

export default router;
