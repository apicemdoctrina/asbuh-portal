/**
 * Получает client_secret для Альфа-интеграции через mTLS.
 * Запускать ОДИН РАЗ — секрет бессрочный, после чего положить в ALFA_CLIENT_SECRET.
 *
 * Источник: developers.alfabank.ru → Подключение → Получение client_secret.
 * Метод: POST {tokenBase}/oidc/clients/{clientId}/client-secret, тело пустое,
 *        авторизация — клиентский сертификат (тот же, что и для всех остальных вызовов).
 *
 * Usage:
 *   ALFA_CLIENT_ID=... ALFA_CERT_PATH=... ALFA_CERT_KEY_PATH=... \
 *     npx tsx scripts/alfa-bootstrap-secret.ts
 *
 * Повторный вызов ротирует секрет — старый сразу перестаёт работать.
 */
import "dotenv/config";
import fs from "node:fs";
import { Agent } from "undici";

const clientId = process.env.ALFA_CLIENT_ID;
const certPath = process.env.ALFA_CERT_PATH;
const keyPath = process.env.ALFA_CERT_KEY_PATH;
const passphrase = process.env.ALFA_CERT_PASSPHRASE || undefined;
const caPath = process.env.ALFA_CA_PATH || process.env.SBER_CA_PATH;
const tokenBase = process.env.ALFA_TOKEN_BASE || "https://sandbox.alfabank.ru";

if (!clientId) {
  console.error("ALFA_CLIENT_ID не задан в .env");
  process.exit(1);
}
if (!certPath) {
  console.error("ALFA_CERT_PATH не задан в .env");
  process.exit(1);
}

const isPfx = /\.(p12|pfx)$/i.test(certPath);
if (!isPfx && !keyPath) {
  console.error("ALFA_CERT_KEY_PATH не задан (требуется для PEM-сертификата)");
  process.exit(1);
}

const ca = caPath && fs.existsSync(caPath) ? fs.readFileSync(caPath) : undefined;
const dispatcher = isPfx
  ? new Agent({ connect: { pfx: fs.readFileSync(certPath), passphrase, ca } })
  : new Agent({
      connect: {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath!),
        passphrase,
        ca,
      },
    });

const url = `${tokenBase}/oidc/clients/${encodeURIComponent(clientId)}/client-secret`;
console.log(`POST ${url}`);
console.log(`mTLS cert: ${certPath}${isPfx ? "" : ` + ${keyPath}`}`);
console.log(`CA: ${caPath || "(system)"}\n`);

const res = await fetch(url, {
  method: "POST",
  headers: { Accept: "application/json" },
  dispatcher,
} as RequestInit);

const text = await res.text();
console.log(`HTTP ${res.status}`);
console.log(text);

if (!res.ok) {
  console.error("\n— запрос отклонён. Возможные причины:");
  console.error("  • clientId не совпадает с выданным в сертификате");
  console.error("  • сертификат не активирован/просрочен");
  console.error("  • домен не тот (sandbox.alfabank.ru vs baas.alfabank.ru)");
  process.exit(1);
}

try {
  const json = JSON.parse(text);
  if (json.clientSecret) {
    console.log("\n=== Положи в apps/api/.env ===");
    console.log(`ALFA_CLIENT_SECRET=${json.clientSecret}`);
  }
} catch {
  // ответ не JSON — выше уже распечатан целиком
}
