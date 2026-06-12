import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { orgStrictScope } from "../../lib/scoping.js";
import { notifyOrgPaymentChanged } from "./helpers.js";

const router = Router();

const getScopedWhere = orgStrictScope;

// POST /api/organizations/:id/price-history — add price entry
router.post(
  "/:id/price-history",
  authenticate,
  requirePermission("organization", "edit"),
  async (req, res) => {
    try {
      const { price, effectiveFrom } = req.body;
      if (!price || !effectiveFrom) {
        res.status(400).json({ error: "price and effectiveFrom are required" });
        return;
      }

      const org = await prisma.organization.findFirst({
        where: { id: req.params.id, ...getScopedWhere(req.user!.userId, req.user!.roles) },
        select: { id: true, monthlyPayment: true },
      });
      if (!org) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      const entry = await prisma.priceHistory.create({
        data: {
          organizationId: req.params.id,
          price: new Prisma.Decimal(price),
          effectiveFrom: new Date(effectiveFrom),
        },
      });

      // Update monthlyPayment to the latest price
      const latest = await prisma.priceHistory.findFirst({
        where: { organizationId: req.params.id },
        orderBy: { effectiveFrom: "desc" },
      });
      if (latest) {
        await prisma.organization.update({
          where: { id: req.params.id },
          data: { monthlyPayment: latest.price },
        });
        const before = org.monthlyPayment;
        const after = latest.price;
        const changed =
          (before == null) !== (after == null) ||
          (before != null && after != null && !before.equals(after));
        if (changed) {
          notifyOrgPaymentChanged(req.params.id, before, after, req.user!.userId).catch(
            console.error,
          );
        }
      }

      res.status(201).json(entry);
    } catch (err) {
      console.error("Create price history error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// DELETE /api/organizations/:id/price-history/:entryId — remove price entry
router.delete(
  "/:id/price-history/:entryId",
  authenticate,
  requirePermission("organization", "edit"),
  async (req, res) => {
    try {
      const before = await prisma.organization.findFirst({
        where: { id: req.params.id, ...getScopedWhere(req.user!.userId, req.user!.roles) },
        select: { monthlyPayment: true },
      });
      if (!before) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }
      // deleteMany с organizationId — запись должна принадлежать именно этой организации
      const deleted = await prisma.priceHistory.deleteMany({
        where: { id: req.params.entryId, organizationId: req.params.id },
      });
      if (deleted.count === 0) {
        res.status(404).json({ error: "Price entry not found" });
        return;
      }

      // Update monthlyPayment to the latest remaining price
      const latest = await prisma.priceHistory.findFirst({
        where: { organizationId: req.params.id },
        orderBy: { effectiveFrom: "desc" },
      });
      await prisma.organization.update({
        where: { id: req.params.id },
        data: { monthlyPayment: latest ? latest.price : null },
      });

      const beforeAmt = before?.monthlyPayment ?? null;
      const afterAmt = latest ? latest.price : null;
      const changed =
        (beforeAmt == null) !== (afterAmt == null) ||
        (beforeAmt != null && afterAmt != null && !beforeAmt.equals(afterAmt));
      if (changed) {
        notifyOrgPaymentChanged(req.params.id, beforeAmt, afterAmt, req.user!.userId).catch(
          console.error,
        );
      }

      res.json({ success: true });
    } catch (err) {
      console.error("Delete price history error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
