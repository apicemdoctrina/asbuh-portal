import { Router } from "express";
import prisma from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const router = Router();

type Manager = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  avatarPath: string | null;
  telegramUsername: string | null;
  sectionRole: string;
};

router.get("/", authenticate, requireRole("client"), async (req, res) => {
  try {
    const userId = req.user!.userId;

    const [user, telegramBinding, orgs] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { onboardingManagerSeen: true, onboardingFaqSeen: true },
      }),
      prisma.telegramBinding.findUnique({ where: { userId } }),
      prisma.organization.findMany({
        where: { members: { some: { userId } } },
        select: { sectionId: true },
      }),
    ]);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const sectionIds = [...new Set(orgs.map((o) => o.sectionId).filter(Boolean) as string[])];

    const managers: Manager[] = [];
    if (sectionIds.length > 0) {
      const sectionMembers = await prisma.sectionMember.findMany({
        where: { sectionId: { in: sectionIds } },
        select: {
          role: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              avatarPath: true,
              isActive: true,
              telegramBinding: { select: { username: true } },
              userRoles: { select: { role: { select: { name: true } } } },
            },
          },
        },
      });

      const seen = new Set<string>();
      for (const m of sectionMembers) {
        if (!m.user.isActive) continue;
        const userRoleNames = m.user.userRoles.map((ur) => ur.role.name);
        if (!userRoleNames.some((r) => r === "manager" || r === "accountant")) continue;
        if (seen.has(m.user.id)) continue;
        seen.add(m.user.id);
        managers.push({
          id: m.user.id,
          firstName: m.user.firstName,
          lastName: m.user.lastName,
          email: m.user.email,
          phone: m.user.phone,
          avatarPath: m.user.avatarPath,
          telegramUsername: m.user.telegramBinding?.username ?? null,
          sectionRole: m.role,
        });
      }
      // managers first, then accountants
      managers.sort((a, b) => {
        const order = (r: string) => (r === "manager" ? 0 : r === "accountant" ? 1 : 2);
        return order(a.sectionRole) - order(b.sectionRole);
      });
    }

    const telegram = telegramBinding !== null;
    const manager = user.onboardingManagerSeen;
    const faq = user.onboardingFaqSeen;
    const allDone = telegram && manager && faq;

    res.json({ telegram, manager, faq, allDone, managers });
  } catch (err) {
    console.error("client-onboarding GET error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/step/:step", authenticate, requireRole("client"), async (req, res) => {
  try {
    const userId = req.user!.userId;
    const { step } = req.params;

    const data: Record<string, boolean> = {};
    if (step === "manager") data.onboardingManagerSeen = true;
    else if (step === "faq") data.onboardingFaqSeen = true;
    else {
      res.status(400).json({ error: "Unknown step" });
      return;
    }

    await prisma.user.update({ where: { id: userId }, data });
    res.json({ ok: true });
  } catch (err) {
    console.error("client-onboarding POST error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
