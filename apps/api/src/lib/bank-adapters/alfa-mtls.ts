import fs from "node:fs";
import { Agent, type Dispatcher } from "undici";
import { BankConfigError } from "./types.js";

export interface AlfaConfig {
  /** Где живёт /oidc/authorize — Alfa ID. */
  authBaseUrl: string;
  /** Где живёт /oidc/token. */
  tokenBaseUrl: string;
  /** Где живёт /api/jp/v1/statement/transactions. */
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** OAuth-скоупы — Альфа разделяет через запятую (см. их письмо/доку). */
  scope: string;
  dispatcher: Dispatcher;
}

let cached: AlfaConfig | null = null;

/**
 * Собирает AlfaConfig из env и мемоизирует mTLS-агент.
 * Сертификат от Альфы выдаётся парой PEM (.cer + .key) — PKCS#12 не поддерживается.
 * Серверная цепочка — УЦ Минцифры; можно переиспользовать sber-ca.pem.
 */
export function getAlfaConfig(): AlfaConfig {
  if (cached) return cached;
  const authBaseUrl = process.env.ALFA_AUTH_BASE || "";
  const tokenBaseUrl = process.env.ALFA_TOKEN_BASE || "";
  const apiBaseUrl = process.env.ALFA_API_BASE || "";
  const clientId = process.env.ALFA_CLIENT_ID || "";
  const clientSecret = process.env.ALFA_CLIENT_SECRET || "";
  const redirectUri = process.env.ALFA_REDIRECT_URI || "";
  const scope =
    process.env.ALFA_SCOPE ||
    "openid,customer,transactions,signature,profile,email,phone,eio,role,inn";
  const certPath = process.env.ALFA_CERT_PATH || "";
  const keyPath = process.env.ALFA_CERT_KEY_PATH || "";
  const passphrase = process.env.ALFA_CERT_PASSPHRASE || undefined;
  const caPath = process.env.ALFA_CA_PATH || process.env.SBER_CA_PATH || "";

  if (
    !authBaseUrl ||
    !tokenBaseUrl ||
    !apiBaseUrl ||
    !clientId ||
    !clientSecret ||
    !redirectUri ||
    !certPath ||
    !keyPath
  ) {
    throw new BankConfigError("Альфа не сконфигурирована на сервере (ALFA_* env)");
  }

  let dispatcher: Agent;
  try {
    const cert = fs.readFileSync(certPath);
    const key = fs.readFileSync(keyPath);
    const ca = caPath ? fs.readFileSync(caPath) : undefined;
    dispatcher = new Agent({ connect: { cert, key, passphrase, ca } });
  } catch {
    throw new BankConfigError("Не удалось прочитать сертификат/ключ Альфы");
  }
  cached = {
    authBaseUrl,
    tokenBaseUrl,
    apiBaseUrl,
    clientId,
    clientSecret,
    redirectUri,
    scope,
    dispatcher,
  };
  return cached;
}
