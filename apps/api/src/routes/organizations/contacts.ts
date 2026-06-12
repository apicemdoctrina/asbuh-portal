import { Router } from "express";
import prisma from "../../lib/prisma.js";
import { logAudit } from "../../lib/audit.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { orgStrictScope } from "../../lib/scoping.js";
import { createContactSchema, updateContactSchema } from "../../lib/validators.js";

const router = Router();

const getScopedWhere = orgStrictScope;

// POST /api/organizations/:id/contacts
router.post(
  "/:id/contacts",
  authenticate,
  requirePermission("organization", "edit"),
  async (req, res) => {
    try {
      const scope = getScopedWhere(req.user!.userId, req.user!.roles);
      const org = await prisma.organization.findFirst({
        where: { id: req.params.id, ...scope },
      });
      if (!org) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      const result = createContactSchema.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({ error: "Validation failed", issues: result.error.issues });
        return;
      }

      const contact = await prisma.organizationContact.create({
        data: {
          organizationId: org.id,
          contactPerson: result.data.contactPerson,
          phone: result.data.phone ?? null,
          email: result.data.email ?? null,
          telegram: result.data.telegram ?? null,
          comment: result.data.comment ?? null,
        },
      });

      await logAudit({
        action: "organization_contact_created",
        userId: req.user!.userId,
        entity: "organization",
        entityId: org.id,
        details: { contactId: contact.id, contactPerson: result.data.contactPerson },
        ipAddress: req.ip,
      });

      res.status(201).json(contact);
    } catch (err) {
      console.error("Create contact error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PUT /api/organizations/:id/contacts/:contactId
router.put(
  "/:id/contacts/:contactId",
  authenticate,
  requirePermission("organization", "edit"),
  async (req, res) => {
    try {
      const scope = getScopedWhere(req.user!.userId, req.user!.roles);
      const org = await prisma.organization.findFirst({
        where: { id: req.params.id, ...scope },
      });
      if (!org) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      const contact = await prisma.organizationContact.findFirst({
        where: { id: req.params.contactId, organizationId: org.id },
      });
      if (!contact) {
        res.status(404).json({ error: "Contact not found" });
        return;
      }

      const result = updateContactSchema.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({ error: "Validation failed", issues: result.error.issues });
        return;
      }

      const data: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(result.data)) {
        if (value !== undefined) data[key] = value;
      }

      const updated = await prisma.organizationContact.update({
        where: { id: contact.id },
        data,
      });

      await logAudit({
        action: "organization_contact_updated",
        userId: req.user!.userId,
        entity: "organization",
        entityId: org.id,
        details: { contactId: contact.id },
        ipAddress: req.ip,
      });

      res.json(updated);
    } catch (err) {
      console.error("Update contact error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// DELETE /api/organizations/:id/contacts/:contactId
router.delete(
  "/:id/contacts/:contactId",
  authenticate,
  requirePermission("organization", "edit"),
  async (req, res) => {
    try {
      const scope = getScopedWhere(req.user!.userId, req.user!.roles);
      const org = await prisma.organization.findFirst({
        where: { id: req.params.id, ...scope },
      });
      if (!org) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      const contact = await prisma.organizationContact.findFirst({
        where: { id: req.params.contactId, organizationId: org.id },
      });
      if (!contact) {
        res.status(404).json({ error: "Contact not found" });
        return;
      }

      await prisma.organizationContact.delete({ where: { id: contact.id } });

      await logAudit({
        action: "organization_contact_deleted",
        userId: req.user!.userId,
        entity: "organization",
        entityId: org.id,
        details: { contactId: contact.id },
        ipAddress: req.ip,
      });

      res.json({ message: "Contact deleted" });
    } catch (err) {
      console.error("Delete contact error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
