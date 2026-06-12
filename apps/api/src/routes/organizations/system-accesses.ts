import { Router } from "express";
import prisma from "../../lib/prisma.js";
import { logAudit } from "../../lib/audit.js";
import { encrypt, decrypt } from "../../lib/crypto.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { orgStrictScope } from "../../lib/scoping.js";
import { createSystemAccessSchema, updateSystemAccessSchema } from "../../lib/validators.js";
import { secretsLimiter } from "./helpers.js";

const router = Router();

const getScopedWhere = orgStrictScope;

// POST /api/organizations/:id/system-accesses
router.post(
  "/:id/system-accesses",
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

      const result = createSystemAccessSchema.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({ error: "Validation failed", issues: result.error.issues });
        return;
      }

      const loginValue = result.data.login ?? null;
      const passwordValue = result.data.password ?? null;

      const access = await prisma.organizationSystemAccess.create({
        data: {
          organizationId: org.id,
          systemType: result.data.systemType,
          name: result.data.name ?? null,
          login: loginValue ? encrypt(loginValue) : null,
          password: passwordValue ? encrypt(passwordValue) : null,
          comment: result.data.comment ?? null,
        },
      });

      await logAudit({
        action: "organization_system_access_created",
        userId: req.user!.userId,
        entity: "organization",
        entityId: org.id,
        details: { systemAccessId: access.id, systemType: access.systemType },
        ipAddress: req.ip,
      });

      const responseAccess = {
        ...access,
        login: access.login != null ? "***" : null,
        password: access.password != null ? "***" : null,
      };
      res.status(201).json(responseAccess);
    } catch (err) {
      console.error("Create system access error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PUT /api/organizations/:id/system-accesses/:accessId
router.put(
  "/:id/system-accesses/:accessId",
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

      const access = await prisma.organizationSystemAccess.findFirst({
        where: { id: req.params.accessId, organizationId: org.id },
      });
      if (!access) {
        res.status(404).json({ error: "System access not found" });
        return;
      }

      const result = updateSystemAccessSchema.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({ error: "Validation failed", issues: result.error.issues });
        return;
      }

      const data: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(result.data)) {
        if (value !== undefined) data[key] = value;
      }

      if (data.login !== undefined) {
        data.login = data.login ? encrypt(data.login as string) : null;
      }
      if (data.password !== undefined) {
        data.password = data.password ? encrypt(data.password as string) : null;
      }

      const updated = await prisma.organizationSystemAccess.update({
        where: { id: access.id },
        data,
      });

      await logAudit({
        action: "organization_system_access_updated",
        userId: req.user!.userId,
        entity: "organization",
        entityId: org.id,
        details: { systemAccessId: access.id },
        ipAddress: req.ip,
      });

      const responseAccess = {
        ...updated,
        login: updated.login != null ? "***" : null,
        password: updated.password != null ? "***" : null,
      };
      res.json(responseAccess);
    } catch (err) {
      console.error("Update system access error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// DELETE /api/organizations/:id/system-accesses/:accessId
router.delete(
  "/:id/system-accesses/:accessId",
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

      const access = await prisma.organizationSystemAccess.findFirst({
        where: { id: req.params.accessId, organizationId: org.id },
      });
      if (!access) {
        res.status(404).json({ error: "System access not found" });
        return;
      }

      await prisma.organizationSystemAccess.delete({ where: { id: access.id } });

      await logAudit({
        action: "organization_system_access_deleted",
        userId: req.user!.userId,
        entity: "organization",
        entityId: org.id,
        details: { systemAccessId: access.id },
        ipAddress: req.ip,
      });

      res.json({ message: "System access deleted" });
    } catch (err) {
      console.error("Delete system access error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /api/organizations/:id/system-accesses/:accessId/secrets
router.get(
  "/:id/system-accesses/:accessId/secrets",
  authenticate,
  requirePermission("organization_secret", "view"),
  secretsLimiter,
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

      const access = await prisma.organizationSystemAccess.findFirst({
        where: { id: req.params.accessId, organizationId: org.id },
      });
      if (!access) {
        res.status(404).json({ error: "System access not found" });
        return;
      }

      const decryptedLogin = access.login ? decrypt(access.login) : null;
      const decryptedPassword = access.password ? decrypt(access.password) : null;

      await logAudit({
        action: "organization_secret_viewed",
        userId: req.user!.userId,
        entity: "organization",
        entityId: org.id,
        details: { systemAccessId: access.id, systemType: access.systemType },
        ipAddress: req.ip,
      });

      res.set("Cache-Control", "no-store");
      res.json({ login: decryptedLogin, password: decryptedPassword });
    } catch (err) {
      console.error("View system access secrets error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
