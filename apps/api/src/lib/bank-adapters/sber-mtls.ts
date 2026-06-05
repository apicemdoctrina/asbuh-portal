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
  // Опционально: цепочка доверенных CA Сбера (российский УЦ Минцифры). Нужна,
  // чтобы Node доверял серверному сертификату sbi/fintech при mTLS-вызовах.
  // Альтернатива — NODE_EXTRA_CA_CERTS в окружении сервиса.
  const caPath = process.env.SBER_CA_PATH || "";

  // Сбер-консоль выдаёт PKCS#12-бандл (.p12/.pfx) — сертификат и ключ в одном файле.
  // В этом случае отдельный SBER_CERT_KEY_PATH не нужен; иначе ждём пару PEM (cert + key).
  const isPfx = /\.(p12|pfx)$/i.test(certPath);

  if (
    !baseUrl ||
    !authBaseUrl ||
    !redirectUri ||
    !clientId ||
    !clientSecret ||
    !certPath ||
    (!isPfx && !keyPath)
  ) {
    throw new BankConfigError("Сбер не сконфигурирован на сервере (SBER_* env)");
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
    throw new BankConfigError("Не удалось прочитать сертификат/ключ Сбера");
  }
  cached = { baseUrl, authBaseUrl, redirectUri, clientId, clientSecret, dispatcher };
  return cached;
}
