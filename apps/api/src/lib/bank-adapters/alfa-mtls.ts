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
  // Sandbox-дефолты (developers.alfabank.ru → FAQ). В .env переопределяются для прода:
  //   ALFA_AUTH_BASE=https://id.alfabank.ru
  //   ALFA_TOKEN_BASE=https://baas.alfabank.ru
  //   ALFA_API_BASE=https://baas.alfabank.ru/api
  const authBaseUrl = process.env.ALFA_AUTH_BASE || "https://id-sandbox.alfabank.ru";
  const tokenBaseUrl = process.env.ALFA_TOKEN_BASE || "https://sandbox.alfabank.ru";
  const apiBaseUrl = process.env.ALFA_API_BASE || "https://sandbox.alfabank.ru/api";
  const clientId = process.env.ALFA_CLIENT_ID || "";
  const clientSecret = process.env.ALFA_CLIENT_SECRET || "";
  const redirectUri = process.env.ALFA_REDIRECT_URI || "";
  // Минимум для выписок — openid + transactions. Прочие scope (customer,
  // signature, ...) включай через ALFA_SCOPE только если они активированы
  // у твоей интеграции в Developer Portal — иначе Альфа отдаст invalid_scope
  // на authorize-запросе с prompt=consent.
  const scope = process.env.ALFA_SCOPE || "openid transactions";
  const certPath = process.env.ALFA_CERT_PATH || "";
  const keyPath = process.env.ALFA_CERT_KEY_PATH || "";
  const passphrase = process.env.ALFA_CERT_PASSPHRASE || undefined;
  // ВАЖНО: НЕ fallback'имся на SBER_CA_PATH — у Сбера серверные сертификаты от
  // УЦ Минцифры, у prod-Альфы (baas.alfabank.ru) — от Starfield/Amazon. Если
  // явно подсунем Минцифру вторым CA, Node заменит system trust и отвергнет
  // Starfield → SELF_SIGNED_CERT_IN_CHAIN. Для sandbox (sandbox.alfabank.ru,
  // Минцифра) явно укажи ALFA_CA_PATH=./certs/russiantrustedca.pem. Для prod
  // оставь ALFA_CA_PATH пустым — Node использует системные CA.
  const caPath = process.env.ALFA_CA_PATH || "";

  const isPfx = /\.(p12|pfx)$/i.test(certPath);

  if (!clientId || !clientSecret || !redirectUri || !certPath || (!isPfx && !keyPath)) {
    throw new BankConfigError("Альфа не сконфигурирована на сервере (ALFA_* env)");
  }

  let dispatcher: Agent;
  try {
    const ca = caPath ? fs.readFileSync(caPath) : undefined;
    if (isPfx) {
      const pfx = fs.readFileSync(certPath);
      dispatcher = new Agent({ connect: { pfx, passphrase, ca } });
    } else {
      const cert = fs.readFileSync(certPath);
      const key = fs.readFileSync(keyPath);
      dispatcher = new Agent({ connect: { cert, key, passphrase, ca } });
    }
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
