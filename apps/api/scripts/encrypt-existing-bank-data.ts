/**
 * One-time script to encrypt existing plaintext login fields in OrganizationBankAccount.
 * Idempotent: skips values already encrypted (starting with "enc_v1:").
 *
 * Usage: cd apps/api && npx tsx scripts/encrypt-existing-bank-data.ts
 */
import { PrismaClient } from "@prisma/client";
import { encrypt } from "../src/lib/crypto.js";

const prisma = new PrismaClient();

async function main() {
  const accounts = await prisma.organizationBankAccount.findMany({
    where: {
      OR: [{ login: { not: null } }, { password: { not: null } }],
    },
  });

  let encryptedCount = 0;

  for (const account of accounts) {
    const updates: Record<string, string> = {};

    if (account.login && !account.login.startsWith("enc_v1:")) {
      updates.login = encrypt(account.login);
    }
    if (account.password && !account.password.startsWith("enc_v1:")) {
      updates.password = encrypt(account.password);
    }

    if (Object.keys(updates).length > 0) {
      await prisma.organizationBankAccount.update({
        where: { id: account.id },
        data: updates,
      });
      encryptedCount++;
    }
  }

  console.log(
    `Done. Processed ${accounts.length} accounts with non-null login/password, encrypted ${encryptedCount}.`,
  );
}

main()
  .catch((e) => {
    console.error("Encryption migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
