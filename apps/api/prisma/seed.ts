import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ROLES = ["admin", "manager", "accountant", "client"] as const;

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
];

// Role → permitted (entity, action) pairs
const ROLE_PERMISSIONS: Record<string, Array<{ entity: string; action: string }>> = {
  admin: PERMISSIONS, // all permissions
  manager: [
    { entity: "user", action: "view" },
    { entity: "section", action: "view" },
    { entity: "organization", action: "view" },
    { entity: "document", action: "view" },
    { entity: "audit_log", action: "view" },
  ],
  accountant: [
    { entity: "section", action: "view" },
    { entity: "organization", action: "view" },
    { entity: "organization", action: "edit" },
    { entity: "document", action: "view" },
    { entity: "document", action: "create" },
    { entity: "document", action: "edit" },
  ],
  client: [
    { entity: "organization", action: "view" },
    { entity: "document", action: "view" },
    { entity: "document", action: "create" },
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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
