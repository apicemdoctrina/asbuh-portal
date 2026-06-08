/**
 * Диагностика Альфа-выписки: берёт refresh-токен подключённого счёта,
 * меняет на access, декодирует JWT (scope/sub/aud), дёргает statement-endpoint
 * и печатает полный ответ (status + headers + body). Не меняет БД.
 *
 * Usage:
 *   npx tsx scripts/alfa-debug-statement.ts <bankAccountId> [statementDate]
 *
 * statementDate по умолчанию — 2025-12-08 (из примера OpenAPI-спеки).
 */
import "dotenv/config";
import prisma from "../src/lib/prisma.js";
import { decrypt } from "../src/lib/crypto.js";
import { getAlfaConfig } from "../src/lib/bank-adapters/alfa-mtls.js";
import { refreshAccessToken } from "../src/lib/bank-adapters/alfa-client.js";

const accId = process.argv[2];
const date = process.argv[3] || "2025-12-08";

if (!accId) {
  console.error("Usage: npx tsx scripts/alfa-debug-statement.ts <bankAccountId> [date]");
  process.exit(1);
}

function decodeJwt(token: string): unknown {
  const part = token.split(".")[1];
  if (!part) return null;
  const pad = "=".repeat((4 - (part.length % 4)) % 4);
  const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString();
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}

const acc = await prisma.organizationBankAccount.findUnique({
  where: { id: accId },
  select: { id: true, accountNumber: true, apiToken: true, apiProvider: true },
});
if (!acc) {
  console.error("Bank account not found");
  process.exit(1);
}
if (acc.apiProvider !== "alfa") {
  console.error("Not an Alfa account:", acc.apiProvider);
  process.exit(1);
}
if (!acc.apiToken) {
  console.error("No refresh token in DB — connect via OAuth first");
  process.exit(1);
}

console.log(`Bank account: ${acc.accountNumber}`);
const refresh = decrypt(acc.apiToken);
const cfg = getAlfaConfig();

console.log("\n— Exchanging refresh → access...");
const tokens = await refreshAccessToken(refresh, cfg);
console.log(
  `access_token (len=${tokens.accessToken.length}):`,
  tokens.accessToken.slice(0, 40) + "...",
);
console.log("\n— Decoded JWT payload:");
console.log(JSON.stringify(decodeJwt(tokens.accessToken), null, 2));

const accountNumber = acc.accountNumber || "40702810102300000001";

// Пробуем оба endpoint'а подряд, чтобы выяснить какой из них реально живёт в sandbox.
const endpoints = [
  {
    name: "v1 transactions (JSON)",
    url: `${cfg.apiBaseUrl}/jp/v1/statement/transactions?accountNumber=${accountNumber}&statementDate=${date}&page=1`,
    accept: "application/json",
  },
  {
    name: "v2 1C statement (XML)",
    url: `${cfg.apiBaseUrl}/jp/v2/accounts/${accountNumber}/transactions/1C?executeDate=${date}`,
    accept: "application/xml",
  },
];

for (const ep of endpoints) {
  console.log(`\n========== ${ep.name} ==========`);
  console.log(`GET ${ep.url}`);
  const res = await fetch(ep.url, {
    method: "GET",
    headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: ep.accept },
    dispatcher: cfg.dispatcher,
  } as RequestInit);
  console.log(`HTTP ${res.status} ${res.statusText}`);
  for (const [k, v] of res.headers.entries()) console.log(`  ${k}: ${v}`);
  const body = await res.text();
  console.log("Body:");
  console.log(body.slice(0, 2000));
  if (body.length > 2000) console.log(`... (${body.length - 2000} more bytes)`);
}

await prisma.$disconnect();
