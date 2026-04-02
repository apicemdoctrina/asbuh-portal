import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ACCOUNTS = [
  { email: "manager@asbuh.local", password: "Manager123!" },
  { email: "manager2@asbuh.local", password: "Manager123!" },
  { email: "elena@asbuh.com", password: "Manager123!" },
  { email: "buh1@asbuh.local", password: "Buh123!" },
  { email: "buh2@asbuh.local", password: "Buh123!" },
  { email: "buh3@asbuh.local", password: "Buh123!" },
  { email: "alexei@asbuh.com", password: "Buh123!" },
  { email: "client@asbuh.local", password: "Client123!" },
  { email: "sokolov@gmail.com", password: "Client123!" },
];

async function main() {
  for (const { email, password } of ACCOUNTS) {
    const hash = await bcrypt.hash(password, 12);
    const updated = await prisma.user.updateMany({
      where: { email },
      data: { passwordHash: hash },
    });
    if (updated.count > 0) {
      console.log(`✓ ${email} → ${password}`);
    } else {
      console.log(`✗ ${email} — не найден`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
