// Одноразовый скрипт: создаёт тестовую организацию + банковский счёт Сбера
// для проверки OAuth-онбординга и забора выписок.
// Запуск: tsx --env-file=.env scripts/seed-sber-test-org.ts
import prisma from "../src/lib/prisma.js";
import bcrypt from "bcryptjs";

async function main() {
  const NAME = "ТЕСТ Сбербанк (Сбер API)";

  // идемпотентность: переиспользуем существующие орг/счёт, не плодим дубли
  const existing = await prisma.organization.findFirst({
    where: { name: NAME },
    include: { bankAccounts: true },
  });

  const org =
    existing ??
    (await prisma.organization.create({
      data: {
        name: NAME,
        inn: "7700000000",
        status: "active",
        paymentDestination: "BANK_TOCHKA", // в enum нет SBER; для теста выписок не важно
      },
    }));

  const acc =
    existing?.bankAccounts.find((a) => a.apiProvider === "sber") ??
    (await prisma.organizationBankAccount.create({
      data: {
        organizationId: org.id,
        bankName: "Сбербанк",
        accountNumber: "40702810000000012345", // тестовый 20-значный р/с
        apiProvider: "sber",
      },
    }));

  // Тестовый клиент, привязанный к этой организации (для проверки доступа клиента к OAuth Сбера)
  const clientEmail = "client.sber@asbuh.local";
  const clientRole = await prisma.role.findUnique({ where: { name: "client" } });
  const clientUser = await prisma.user.upsert({
    where: { email: clientEmail },
    update: {},
    create: {
      email: clientEmail,
      passwordHash: await bcrypt.hash("Client123!", 12),
      firstName: "Тест",
      lastName: "Клиент",
    },
  });
  if (clientRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: clientUser.id, roleId: clientRole.id } },
      update: {},
      create: { userId: clientUser.id, roleId: clientRole.id },
    });
  }
  await prisma.organizationMember.upsert({
    where: { userId_organizationId: { userId: clientUser.id, organizationId: org.id } },
    update: {},
    create: { userId: clientUser.id, organizationId: org.id, role: "client" },
  });

  console.log("OK");
  console.log("organizationId:", org.id);
  console.log("bankAccountId :", acc.id);
  console.log("client login  :", clientEmail, "/ Client123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
