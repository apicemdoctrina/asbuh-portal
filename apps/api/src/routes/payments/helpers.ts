import prisma from "../../lib/prisma.js";

/** Get org IDs belonging to the user's sections */
export async function getStaffOrgIds(userId: string): Promise<string[]> {
  const sections = await prisma.sectionMember.findMany({
    where: { userId },
    select: { sectionId: true },
  });
  if (sections.length === 0) return [];
  const orgs = await prisma.organization.findMany({
    where: { sectionId: { in: sections.map((s) => s.sectionId) } },
    select: { id: true },
  });
  return orgs.map((o) => o.id);
}
