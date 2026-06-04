import fs from "node:fs";
import { Agent, type Dispatcher } from "undici";
import { BankConfigError } from "./types.js";

export interface SberConfig {
  baseUrl: string;
  authBaseUrl: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  dispatcher: Dispatcher;
}

let cached: SberConfig | null = null;

/** Собирает SberConfig из env и мемоизирует mTLS-агент. BankConfigError, если не настроено. */
export function getSberConfig(): SberConfig {
  if (cached) return cached;
  const baseUrl = process.env.SBER_API_BASE || "";
  const authBaseUrl = process.env.SBER_AUTH_BASE || "";
  const redirectUri = process.env.SBER_REDIRECT_URI || "";
  const clientId = process.env.SBER_CLIENT_ID || "";
  const clientSecret = process.env.SBER_CLIENT_SECRET || "";
  const certPath = process.env.SBER_CERT_PATH || "";
  const keyPath = process.env.SBER_CERT_KEY_PATH || "";
  const passphrase = process.env.SBER_CERT_PASSPHRASE || undefined;

  if (
    !baseUrl ||
    !authBaseUrl ||
    !redirectUri ||
    !clientId ||
    !clientSecret ||
    !certPath ||
    !keyPath
  ) {
    throw new BankConfigError("Сбер не сконфигурирован на сервере (SBER_* env)");
  }

  let cert: Buffer;
  let key: Buffer;
  try {
    cert = fs.readFileSync(certPath);
    key = fs.readFileSync(keyPath);
  } catch {
    throw new BankConfigError("Не удалось прочитать сертификат/ключ Сбера");
  }

  const dispatcher = new Agent({ connect: { cert, key, passphrase } });
  cached = { baseUrl, authBaseUrl, redirectUri, clientId, clientSecret, dispatcher };
  return cached;
}
