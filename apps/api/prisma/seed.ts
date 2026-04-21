import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ROLES = ["admin", "supervisor", "manager", "accountant", "client"] as const;

const PERMISSIONS: Array<{ entity: string; action: string }> = [
  // Users
  { entity: "user", action: "view" },
  { entity: "user", action: "create" },
  { entity: "user", action: "edit" },
  { entity: "user", action: "delete" },
  // Sections
  { entity: "section", action: "view" },
  { entity: "section", action: "create" },
  { entity: "section", action: "edit" },
  { entity: "section", action: "delete" },
  // Organizations
  { entity: "organization", action: "view" },
  { entity: "organization", action: "create" },
  { entity: "organization", action: "edit" },
  { entity: "organization", action: "delete" },
  // Documents
  { entity: "document", action: "view" },
  { entity: "document", action: "create" },
  { entity: "document", action: "edit" },
  { entity: "document", action: "delete" },
  // Audit log
  { entity: "audit_log", action: "view" },
  // Organization secrets (bank login/password decryption)
  { entity: "organization_secret", action: "view" },
  // Work contacts
  { entity: "work_contact", action: "view" },
  { entity: "work_contact", action: "create" },
  { entity: "work_contact", action: "edit" },
  { entity: "work_contact", action: "delete" },
  // Knowledge items
  { entity: "knowledge_item", action: "view" },
  { entity: "knowledge_item", action: "create" },
  { entity: "knowledge_item", action: "edit" },
  { entity: "knowledge_item", action: "delete" },
  // Tasks
  { entity: "task", action: "view" },
  { entity: "task", action: "create" },
  { entity: "task", action: "edit" },
  { entity: "task", action: "delete" },
  // Message templates & logs
  { entity: "message", action: "view" },
  { entity: "message", action: "create" },
  { entity: "message", action: "edit" },
  { entity: "message", action: "delete" },
  { entity: "message", action: "send" },
  // Tickets
  { entity: "ticket", action: "view" },
  { entity: "ticket", action: "create" },
  { entity: "ticket", action: "edit" },
  { entity: "ticket", action: "delete" },
  // Reporting tracker
  { entity: "reporting", action: "view" },
  { entity: "reporting", action: "create" },
  { entity: "reporting", action: "edit" },
  { entity: "reporting", action: "delete" },
];

// Role → permitted (entity, action) pairs
const ROLE_PERMISSIONS: Record<string, Array<{ entity: string; action: string }>> = {
  admin: PERMISSIONS, // all permissions
  supervisor: [
    { entity: "user", action: "view" },
    { entity: "section", action: "view" },
    { entity: "organization", action: "view" },
    { entity: "organization", action: "create" },
    { entity: "organization", action: "edit" },
    { entity: "document", action: "view" },
    { entity: "document", action: "create" },
    // No audit_log:view
    { entity: "organization_secret", action: "view" },
    { entity: "work_contact", action: "view" },
    { entity: "work_contact", action: "create" },
    { entity: "work_contact", action: "edit" },
    { entity: "knowledge_item", action: "view" },
    { entity: "knowledge_item", action: "create" },
    { entity: "knowledge_item", action: "edit" },
    { entity: "task", action: "view" },
    { entity: "task", action: "create" },
    { entity: "task", action: "edit" },
    { entity: "task", action: "delete" },
    { entity: "message", action: "view" },
    { entity: "message", action: "create" },
    { entity: "message", action: "edit" },
    { entity: "message", action: "send" },
    { entity: "ticket", action: "view" },
    { entity: "ticket", action: "create" },
    { entity: "ticket", action: "edit" },
    { entity: "reporting", action: "view" },
    { entity: "reporting", action: "create" },
    { entity: "reporting", action: "edit" },
    { entity: "reporting", action: "delete" },
  ],
  manager: [
    { entity: "user", action: "view" },
    { entity: "section", action: "view" },
    { entity: "organization", action: "view" },
    { entity: "organization", action: "create" },
    { entity: "organization", action: "edit" },
    { entity: "document", action: "view" },
    { entity: "document", action: "create" },
    { entity: "audit_log", action: "view" },
    { entity: "organization_secret", action: "view" },
    { entity: "work_contact", action: "view" },
    { entity: "work_contact", action: "create" },
    { entity: "work_contact", action: "edit" },
    { entity: "knowledge_item", action: "view" },
    { entity: "knowledge_item", action: "create" },
    { entity: "knowledge_item", action: "edit" },
    { entity: "task", action: "view" },
    { entity: "task", action: "create" },
    { entity: "task", action: "edit" },
    { entity: "task", action: "delete" },
    { entity: "message", action: "view" },
    { entity: "message", action: "create" },
    { entity: "message", action: "edit" },
    { entity: "message", action: "send" },
    { entity: "ticket", action: "view" },
    { entity: "ticket", action: "create" },
    { entity: "ticket", action: "edit" },
    { entity: "reporting", action: "view" },
    { entity: "reporting", action: "create" },
    { entity: "reporting", action: "edit" },
  ],
  accountant: [
    { entity: "organization", action: "view" },
    { entity: "organization", action: "edit" },
    { entity: "document", action: "view" },
    { entity: "document", action: "create" },
    { entity: "document", action: "edit" },
    { entity: "organization_secret", action: "view" },
    { entity: "work_contact", action: "view" },
    { entity: "work_contact", action: "create" },
    { entity: "work_contact", action: "edit" },
    { entity: "knowledge_item", action: "view" },
    { entity: "task", action: "view" },
    { entity: "task", action: "create" },
    { entity: "task", action: "edit" },
    { entity: "task", action: "delete" },
    { entity: "message", action: "view" },
    { entity: "message", action: "send" },
    { entity: "ticket", action: "view" },
    { entity: "ticket", action: "create" },
    { entity: "ticket", action: "edit" },
    { entity: "reporting", action: "view" },
    { entity: "reporting", action: "create" },
    { entity: "reporting", action: "edit" },
  ],
  client: [
    { entity: "organization", action: "view" },
    { entity: "document", action: "view" },
    { entity: "document", action: "create" },
    { entity: "knowledge_item", action: "view" },
    { entity: "ticket", action: "view" },
    { entity: "ticket", action: "create" },
  ],
};

async function main() {
  // Upsert roles
  const roleRecords: Record<string, { id: string }> = {};
  for (const name of ROLES) {
    roleRecords[name] = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Roles seeded: ${ROLES.join(", ")}`);

  // Upsert permissions
  const permRecords: Record<string, { id: string }> = {};
  for (const p of PERMISSIONS) {
    const key = `${p.entity}:${p.action}`;
    permRecords[key] = await prisma.permission.upsert({
      where: { entity_action: { entity: p.entity, action: p.action } },
      update: {},
      create: { entity: p.entity, action: p.action },
    });
  }
  console.log(`Permissions seeded: ${PERMISSIONS.length}`);

  // Assign permissions to roles
  for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleRecords[roleName].id;
    for (const p of perms) {
      const permId = permRecords[`${p.entity}:${p.action}`].id;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: permId } },
        update: {},
        create: { roleId, permissionId: permId },
      });
    }
  }
  console.log("Role-permission assignments seeded");

  // Seed admin user from env (defaults for dev only)
  const adminEmail = process.env.ADMIN_EMAIL || "admin@asbuh.local";
  const adminPassword = process.env.ADMIN_PASSWORD || "Admin123!";

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      firstName: "Admin",
      lastName: "ASBUH",
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: roleRecords.admin.id } },
    update: {},
    create: { userId: admin.id, roleId: roleRecords.admin.id },
  });

  console.log(`Admin user seeded: ${adminEmail} (dev-only default password)`);

  // Seed test supervisor user (dev only)
  const supervisorPasswordHash = await bcrypt.hash("Supervisor123!", 12);
  const supervisor = await prisma.user.upsert({
    where: { email: "supervisor@asbuh.local" },
    update: {},
    create: {
      email: "supervisor@asbuh.local",
      passwordHash: supervisorPasswordHash,
      firstName: "Тест",
      lastName: "Руководитель",
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: supervisor.id, roleId: roleRecords.supervisor.id } },
    update: {},
    create: { userId: supervisor.id, roleId: roleRecords.supervisor.id },
  });

  console.log("Test supervisor seeded: supervisor@asbuh.local / Supervisor123!");

  // Seed default report types
  const reportTypes = [
    {
      code: "NDS",
      name: "НДС",
      frequency: "QUARTERLY" as const,
      order: 1,
      deadlineDay: 25,
      deadlineMonthOffset: 1,
    },
    {
      code: "USN",
      name: "УСН (декларация)",
      frequency: "YEARLY" as const,
      order: 2,
      deadlineDay: 25,
      deadlineMonthOffset: 3,
    },
    {
      code: "TRANSPORT_NOTIF",
      name: "Транспортный налог — уведомление",
      frequency: "QUARTERLY" as const,
      order: 3,
      deadlineDay: 25,
      deadlineMonthOffset: 1,
    },
    {
      code: "6NDFL",
      name: "6-НДФЛ",
      frequency: "QUARTERLY" as const,
      order: 4,
      deadlineDay: 25,
      deadlineMonthOffset: 1,
    },
    {
      code: "RSV",
      name: "РСВ",
      frequency: "QUARTERLY" as const,
      order: 5,
      deadlineDay: 25,
      deadlineMonthOffset: 1,
    },
    {
      code: "PERS_SVED",
      name: "Персонифицированные сведения",
      frequency: "MONTHLY" as const,
      order: 6,
      deadlineDay: 25,
      deadlineMonthOffset: 1,
    },
    {
      code: "SZV_TD",
      name: "ЕФС-1 (СЗВ-ТД)",
      frequency: "MONTHLY" as const,
      order: 7,
      deadlineDay: 25,
      deadlineMonthOffset: 1,
    },
    {
      code: "BUH_OTCH",
      name: "Бухгалтерская отчётность",
      frequency: "YEARLY" as const,
      order: 8,
      deadlineDay: 31,
      deadlineMonthOffset: 3,
    },
    {
      code: "NALOG_IMUSH",
      name: "Налог на имущество",
      frequency: "YEARLY" as const,
      order: 9,
      deadlineDay: 25,
      deadlineMonthOffset: 3,
    },
    {
      code: "ZEMEL_NALOG",
      name: "Земельный налог",
      frequency: "YEARLY" as const,
      order: 10,
      deadlineDay: 28,
      deadlineMonthOffset: 2,
    },
    {
      code: "TRANSPORT",
      name: "Транспортный налог",
      frequency: "YEARLY" as const,
      order: 11,
      deadlineDay: 28,
      deadlineMonthOffset: 2,
    },
    {
      code: "NALOG_PRIBYL",
      name: "Налог на прибыль",
      frequency: "QUARTERLY" as const,
      order: 12,
      deadlineDay: 28,
      deadlineMonthOffset: 1,
    },
    {
      code: "EFS1_NS",
      name: "ЕФС-1 (Несчастный случай)",
      frequency: "QUARTERLY" as const,
      order: 13,
      deadlineDay: 25,
      deadlineMonthOffset: 1,
    },
    {
      code: "DOHOD_INOSTR",
      name: "Доходы, выплачиваемые иностранным организациям",
      frequency: "QUARTERLY" as const,
      order: 14,
      deadlineDay: 25,
      deadlineMonthOffset: 1,
    },
    {
      code: "USN_ADVANCE_NOTIF",
      name: "УСН (авансы) — уведомление",
      frequency: "QUARTERLY" as const,
      order: 15,
      deadlineDay: 25,
      deadlineMonthOffset: 1,
    },
    {
      code: "AUSN_CALC",
      name: "АУСН — расчёт",
      frequency: "QUARTERLY" as const,
      order: 16,
      deadlineDay: 25,
      deadlineMonthOffset: 1,
    },
  ];

  for (const rt of reportTypes) {
    await prisma.reportType.upsert({
      where: { code: rt.code },
      update: {
        name: rt.name,
        frequency: rt.frequency,
        order: rt.order,
        deadlineDay: rt.deadlineDay,
        deadlineMonthOffset: rt.deadlineMonthOffset,
      },
      create: rt,
    });
  }
  console.log(`Report types seeded: ${reportTypes.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
