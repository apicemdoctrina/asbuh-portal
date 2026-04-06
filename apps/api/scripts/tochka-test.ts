/**
 * Test script for Tochka Bank Open Banking API.
 * Usage: npx tsx scripts/tochka-test.ts
 *
 * Requires TOCHKA_JWT_TOKEN in apps/api/.env
 */
import "dotenv/config";

const TOKEN = process.env.TOCHKA_JWT_TOKEN;
if (!TOKEN) {
  console.error("Set TOCHKA_JWT_TOKEN in .env");
  process.exit(1);
}

const BASE = "https://enter.tochka.com/uapi/open-banking/v1.0";

async function api(method: string, path: string, body?: unknown) {
  const url = `${BASE}${path}`;
  console.log(`\n>>> ${method} ${url}`);
  if (body) console.log("Body:", JSON.stringify(body, null, 2));

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  console.log(`<<< ${res.status}`);
  try {
    const json = JSON.parse(text);
    console.log(JSON.stringify(json, null, 2));
    return json;
  } catch {
    console.log(text);
    return null;
  }
}

async function main() {
  // 1. List accounts
  console.log("=== ACCOUNTS ===");
  const accounts = await api("GET", "/accounts");

  const accountId = accounts?.Data?.Account?.[0]?.accountId;
  if (!accountId) {
    console.error("No accounts found");
    process.exit(1);
  }
  console.log("\nUsing accountId:", accountId);

  // 2. Create statement request
  console.log("\n=== CREATE STATEMENT ===");
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endDate = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prev month

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  console.log(`Period: ${fmt(startDate)} — ${fmt(endDate)}`);

  // Try different request body formats to find what works
  const formats = [
    {
      name: "Format A: lowercase fields, date only",
      body: {
        Data: {
          Statement: {
            accountId,
            startDateTime: fmt(startDate),
            endDateTime: fmt(endDate),
          },
        },
      },
    },
    {
      name: "Format B: lowercase fields, ISO datetime",
      body: {
        Data: {
          Statement: {
            accountId,
            startDateTime: `${fmt(startDate)}T00:00:00`,
            endDateTime: `${fmt(endDate)}T00:00:00`,
          },
        },
      },
    },
    {
      name: "Format C: lowercase fields, ISO+Z",
      body: {
        Data: {
          Statement: {
            accountId,
            startDateTime: `${fmt(startDate)}T00:00:00Z`,
            endDateTime: `${fmt(endDate)}T00:00:00Z`,
          },
        },
      },
    },
    {
      name: "Format D: date objects as YYYY-MM-DD, accountCode",
      body: {
        Data: {
          Statement: {
            accountCode: accountId,
            startDateTime: fmt(startDate),
            endDateTime: fmt(endDate),
          },
        },
      },
    },
  ];

  let statementId: string | null = null;

  for (const f of formats) {
    console.log(`\n--- Trying: ${f.name} ---`);
    const result = await api("POST", "/statements", f.body);
    if (result?.Data?.Statement?.[0]?.statementId || result?.Data?.Statement?.statementId) {
      statementId = result.Data.Statement?.[0]?.statementId || result.Data.Statement?.statementId;
      console.log("\n*** SUCCESS! statementId:", statementId);
      console.log("*** Working format:", f.name);
      break;
    }
    if (result?.code && Number(result.code) >= 400) {
      console.log("Failed:", result.Errors?.[0]?.message || result.message);
    }
  }

  if (!statementId) {
    console.log("\nNo format worked. Check API docs.");
    process.exit(1);
  }

  // 3. Poll until statement is ready
  console.log("\n=== POLLING STATEMENT ===");
  const encodedAccId = encodeURIComponent(accountId);
  const pollPath = `/accounts/${encodedAccId}/statements/${statementId}`;

  for (let attempt = 1; attempt <= 15; attempt++) {
    console.log(`\nPoll attempt ${attempt}/15...`);
    const result = await api("GET", pollPath);

    const stmts = result?.Data?.Statement;
    if (Array.isArray(stmts) && stmts.length > 0) {
      const stmt = stmts[0];
      console.log("Status:", stmt.status);

      if (stmt.status === "Ready" || stmt.status === "Complete") {
        console.log("\n*** Statement ready!");
        if (stmt.Transaction && stmt.Transaction.length > 0) {
          console.log(`\n=== TRANSACTIONS (${stmt.Transaction.length} total) ===`);
          // Show first 3 transactions in full detail
          for (let i = 0; i < Math.min(3, stmt.Transaction.length); i++) {
            console.log(`\n--- Transaction ${i + 1} ---`);
            console.log(JSON.stringify(stmt.Transaction[i], null, 2));
          }
        } else {
          console.log("No transactions in this period");
        }
        break;
      }

      if (stmt.status === "Error") {
        console.log("*** Statement generation failed");
        break;
      }
    }

    if (attempt < 15) {
      console.log("Waiting 3 seconds...");
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main().catch(console.error);
