import { Router } from "express";
import type { Request } from "express";
import prisma from "../../lib/prisma.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { logAudit } from "../../lib/audit.js";
import { BankApiError } from "../../lib/bank-adapters/index.js";
import { encrypt } from "../../lib/crypto.js";
import { getAlfaConfig } from "../../lib/bank-adapters/alfa-mtls.js";
import { exchangeAuthCode as exchangeAlfaCode } from "../../lib/bank-adapters/alfa-client.js";
import { signAlfaState, verifyAlfaState } from "../../lib/bank-adapters/alfa-oauth-state.js";
import { isPrivileged, mapBankError } from "./helpers.js";

const router = Router();

/** Собрать ссылку авторизации Альфы (Alfa ID OIDC). */
export function buildAlfaAuthorizeUrl(
  cfg: { authBaseUrl: string; clientId: string; redirectUri: string; scope: string },
  state: string,
): string {
  const params: Record<string, string> = {
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: cfg.scope,
    state,
  };
  // Для обычного ACF (B2B SaaS) — prompt=consent заставляет клиента явно
  // одобрить scope; иначе Альфа может вернуть insufficient_scope как 404.
  // Для H2H consent даётся один раз на 1800 дней — повторный prompt не
  // нужен и может сбить флоу. Включается через ALFA_PROMPT_CONSENT=1.
  if (process.env.ALFA_PROMPT_CONSENT === "1") params.prompt = "consent";
  return `${cfg.authBaseUrl}/oidc/authorize?${new URLSearchParams(params).toString()}`;
}

/** Старт OAuth-онбординга Альфы: вернуть ссылку авторизации для счёта в скоупе. */
router.get(
  "/alfa/authorize-url",
  authenticate,
  requirePermission("bank_statement", "connect"),
  async (req: Request, res) => {
    try {
      const bankAccountId = (req.query.bankAccountId as string) || "";
      const acc = await prisma.organizationBankAccount.findFirst({
        where: {
          id: bankAccountId,
          apiProvider: "alfa",
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
        res.status(404).json({ error: "Счёт Альфы не найден или нет доступа" });
        return;
      }
      const cfg = getAlfaConfig();
      const state = signAlfaState({ bankAccountId: acc.id, userId: req.user!.userId });
      res.json({ url: buildAlfaAuthorizeUrl(cfg, state) });
    } catch (err) {
      const m = mapBankError(err);
      if (m.status === 500) console.error("Alfa authorize-url error:", err);
      res.status(m.status).json({ error: m.error });
    }
  },
);

/** Публичный callback Альфы: обменять код на токены и сохранить refresh в счёт. */
router.get("/alfa/callback", async (req: Request, res) => {
  const appUrl = process.env.APP_URL || "http://localhost:5173";
  const code = (req.query.code as string) || "";
  const stateRaw = (req.query.state as string) || "";
  const oauthError = (req.query.error as string) || "";
  const oauthErrorDesc = (req.query.error_description as string) || "";

  // Альфа может прислать ?error=...&error_description=... вместо ?code=...
  // (отказ пользователя в consent, отозванный scope и т.п.).
  const fail = (reason: string, orgId?: string) => {
    const url = orgId
      ? `${appUrl}/organizations/${orgId}?alfa=error&reason=${encodeURIComponent(reason)}`
      : `${appUrl}/?alfa=error&reason=${encodeURIComponent(reason)}`;
    res.redirect(url);
  };

  let state;
  try {
    state = verifyAlfaState(stateRaw);
  } catch {
    console.error("Alfa callback: invalid state", { stateRaw });
    fail("Неверный или просроченный state");
    return;
  }

  const acc = await prisma.organizationBankAccount.findFirst({
    where: { id: state.bankAccountId },
    select: { id: true, organizationId: true },
  });
  if (!acc) {
    console.error("Alfa callback: bank account not found", state);
    fail("Счёт не найден");
    return;
  }

  if (oauthError) {
    console.error("Alfa callback: oauth error", { oauthError, oauthErrorDesc });
    fail(`${oauthError}: ${oauthErrorDesc || "без описания"}`, acc.organizationId);
    return;
  }

  try {
    if (!code) {
      console.error("Alfa callback: no code", req.query);
      throw new BankApiError("Альфа не вернула код авторизации");
    }
    const cfg = getAlfaConfig();
    const { refreshToken } = await exchangeAlfaCode(code, cfg);
    await prisma.organizationBankAccount.update({
      where: { id: acc.id },
      data: { apiToken: encrypt(refreshToken) },
    });
    await logAudit({
      action: "alfa_oauth_connected",
      userId: state.userId,
      entity: "bank_statement",
      entityId: acc.id,
      details: { organizationId: acc.organizationId },
    });
    res.redirect(`${appUrl}/organizations/${acc.organizationId}?alfa=connected`);
  } catch (err) {
    console.error("Alfa callback error:", err);
    const msg = err instanceof Error ? err.message : "Неизвестная ошибка";
    fail(msg, acc.organizationId);
  }
});

export default router;
